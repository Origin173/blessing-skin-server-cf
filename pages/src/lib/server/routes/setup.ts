/**
 * Cloudflare Pages/D1 安装向导。
 *
 * 安装状态只在 D1 保存一次性 token 的摘要；明文 token 只通过 GET /setup
 * 返回给当前安装浏览器。完成安装时用带条件的 D1 batch 抢占安装槽位，
 * 因而重复提交和并发提交都不会再创建第二个超级管理员。
 */

import { CompatRouter, CompatContext } from '@/lib/server/compat';
import { csrfMiddleware, AppVariables } from '@/lib/server/guards';
import { hashPassword, hashEquals } from '@/lib/server/ciphers';
import { setOptions, getOption } from '@/lib/server/options';
import { jsonData, jsonValidationError, forbidden } from '@/lib/server/response';
import { createSession, sessionCookie } from '@/lib/server/session';
import { formatDateTime, now, PERMISSION, randomHex } from '@/lib/server/types';
import { validate } from '@/lib/server/validate';
import { readBody } from './helpers';

type SetupEnv = { Bindings: Env; Variables: AppVariables };

interface InstallStateRow {
  id: number;
  completed: number;
  setup_token_hash: string | null;
  setup_token_expires_at: number | null;
  completed_at: string | null;
}

interface BindingCheck {
  configured: boolean;
  ok: boolean;
  message?: string;
}

interface SetupStatus {
  available: boolean;
  completed: boolean;
  has_users: boolean;
  install_state: {
    configured: boolean;
    completed: boolean;
  };
  checks: {
    d1: BindingCheck;
    r2: BindingCheck;
    kv: BindingCheck;
    secrets: {
      configured: Record<string, boolean>;
      required: string[];
      missing: string[];
      ok: boolean;
    };
  };
}

const SETUP_TOKEN_TTL = 10 * 60;
const REQUIRED_SECRETS = ['APP_KEY'];
const OPTIONAL_SECRET_NAMES = [
  'SALT',
  'PASSPORT_PRIVATE_KEY',
  'PASSPORT_PUBLIC_KEY',
  'RESEND_API_KEY',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
];

export const setupRoutes = new CompatRouter();

// POST 安装完成必须同时通过现有会话 CSRF 与一次性 token 校验。
setupRoutes.use('/setup/finish', csrfMiddleware);

/** SHA-256 摘要只用于保存一次性安装 token，不用于密码。 */
async function tokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readInstallState(env: Env): Promise<InstallStateRow | null> {
  try {
    return await env.DB.prepare(
      `SELECT id, completed, setup_token_hash, setup_token_expires_at, completed_at
       FROM install_state WHERE id = 1 LIMIT 1`,
    ).first<InstallStateRow>();
  } catch {
    // 0003 migration 尚未应用时，调用方会在状态中明确报告，而不是 500。
    return null;
  }
}

async function hasUsers(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT 1 AS found FROM users LIMIT 1').first<{ found: number }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function checkD1(env: Env): Promise<BindingCheck> {
  if (!env.DB) return { configured: false, ok: false, message: 'D1 binding DB is not configured' };
  try {
    await env.DB.prepare('SELECT 1').first();
    return { configured: true, ok: true };
  } catch {
    return { configured: true, ok: false, message: 'D1 is unavailable or migrations are not applied' };
  }
}

async function checkR2(env: Env): Promise<BindingCheck> {
  const bucket = env.TEXTURES as R2Bucket | undefined;
  if (!bucket) return { configured: false, ok: false, message: 'R2 binding TEXTURES is not configured' };
  try {
    // head() 不创建对象，只验证绑定和权限。
    await bucket.head('__blessing_skin_setup_probe__');
    return { configured: true, ok: true };
  } catch {
    return { configured: true, ok: false, message: 'R2 is unavailable or access is denied' };
  }
}

async function checkKv(env: Env): Promise<BindingCheck> {
  const kv = env.KV_SKIN as KVNamespace | undefined;
  if (!kv) return { configured: false, ok: false, message: 'KV binding KV_SKIN is not configured' };
  try {
    await kv.get('__blessing_skin_setup_probe__');
    return { configured: true, ok: true };
  } catch {
    return { configured: true, ok: false, message: 'KV is unavailable or access is denied' };
  }
}

function checkSecrets(env: Env): SetupStatus['checks']['secrets'] {
  const names = [...REQUIRED_SECRETS, ...OPTIONAL_SECRET_NAMES];
  const configured: Record<string, boolean> = {};
  for (const name of names) {
    configured[name] = Boolean((env as unknown as Record<string, unknown>)[name]);
  }
  const missing = REQUIRED_SECRETS.filter((name) => !configured[name]);
  return {
    configured,
    required: REQUIRED_SECRETS,
    missing,
    ok: missing.length === 0,
  };
}

async function collectStatus(env: Env): Promise<SetupStatus> {
  const [d1, r2, kv] = await Promise.all([checkD1(env), checkR2(env), checkKv(env)]);
  const state = await readInstallState(env);
  const users = await hasUsers(env);
  const stateConfigured = state !== null;
  const stateCompleted = state?.completed === 1;
  return {
    // 迁移旧站时 state.completed 仍为 0，但已有用户也必须视为已安装。
    available: stateConfigured && !stateCompleted && !users,
    completed: stateCompleted || users,
    has_users: users,
    install_state: {
      configured: stateConfigured,
      completed: stateCompleted,
    },
    checks: {
      d1,
      r2,
      kv,
      secrets: checkSecrets(env),
    },
  };
}

async function ensureSetupSession(
  c: CompatContext,
): Promise<{ csrf: string; setCookie: string | null }> {
  const session = c.get('session');
  if (session && c.get('sessionId')) {
    return { csrf: session.csrf, setCookie: null };
  }
  const { id, data } = await createSession(c.env, 0, false);
  const secure = new URL(c.req.url).protocol === 'https:';
  return { csrf: data.csrf, setCookie: sessionCookie(id, false, secure) };
}

function unavailable(status: SetupStatus): Response {
  const reason = status.completed
    ? 'Setup has already been completed'
    : status.install_state.configured
      ? 'Setup is unavailable until the required Cloudflare bindings and migrations are ready'
      : 'Install-state migration 0003 has not been applied';
  return forbidden(reason);
}

setupRoutes.get('/setup/status', async (c) => {
  return jsonData(await collectStatus(c.env));
});

setupRoutes.get('/setup', async (c) => {
  const status = await collectStatus(c.env);
  if (!status.available) return unavailable(status);

  const { csrf, setCookie } = await ensureSetupSession(c);
  const token = randomHex(64);
  const digest = await tokenDigest(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SETUP_TOKEN_TTL;

  await c.env.DB.prepare(
    `UPDATE install_state
     SET setup_token_hash = ?, setup_token_expires_at = ?
     WHERE id = 1 AND completed = 0 AND NOT EXISTS (SELECT 1 FROM users)`,
  )
    .bind(digest, expiresAt)
    .run();

  const res = jsonData({
    ...status,
    csrf,
    // token 是一次性的；setup_token 是显式别名，方便 API 客户端使用。
    token,
    setup_token: token,
    token_expires_at: expiresAt,
  });
  if (setCookie) res.headers.set('Set-Cookie', setCookie);
  return res;
});

setupRoutes.post('/setup/finish', async (c) => {
  const status = await collectStatus(c.env);
  if (!status.available) return unavailable(status);

  const body = await readBody(c);
  const setupToken = String(body.setup_token ?? body.token ?? '');
  const data = {
    ...body,
    email: body.email ?? body.admin_email,
    password: body.password ?? body.admin_password,
    nickname: body.nickname ?? body.admin_name ?? body.name,
    site_name: body.site_name,
    site_url: body.site_url ?? '',
  };

  const result = await validate(
    data,
    {
      email: 'required|email',
      password: 'required|min:8|max:72',
      site_name: 'required|max:255',
      site_url: 'nullable|max:2048',
    },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);
  if (!setupToken) return forbidden('A valid one-time setup token is required');

  const digest = await tokenDigest(setupToken);
  const state = await readInstallState(c.env);
  if (
    !state ||
    state.completed !== 0 ||
    !state.setup_token_hash ||
    state.setup_token_expires_at === null ||
    state.setup_token_expires_at <= Math.floor(Date.now() / 1000) ||
    !hashEquals(state.setup_token_hash, digest)
  ) {
    return forbidden('The setup token is invalid or expired');
  }

  // getOption 仍复用现有选项服务，确保与普通注册的初始积分语义一致。
  let initialScore = 0;
  try {
    initialScore = Number(await getOption(c.env, 'user_initial_score', '0')) || 0;
  } catch {
    initialScore = 0;
  }

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const passwordHash = await hashPassword(method, String(data.password), salt);
  const createdAt = now();
  const completionMarker = `${createdAt}:${randomHex(16)}`;
  const tokenHash = digest;
  const email = String(data.email);
  const nickname = String(data.nickname ?? email.split('@')[0] ?? email).slice(0, 255);
  const ip = c.get('ip');

  // D1 batch 在 Cloudflare 语义下是事务。先条件更新 install_state，
  // 再用同一个 marker 插入用户；错误 token/重复提交时插入为 0 行。
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE install_state
       SET completed = 1, completed_at = ?, setup_token_expires_at = NULL, setup_token_hash = ?
       WHERE id = 1 AND completed = 0 AND setup_token_hash = ?
         AND setup_token_expires_at > ? AND NOT EXISTS (SELECT 1 FROM users)`,
    ).bind(completionMarker, tokenHash, tokenHash, Math.floor(Date.now() / 1000)),
    c.env.DB.prepare(
      `INSERT INTO users (
        email, nickname, score, avatar, password, ip, permission,
        last_sign_at, register_at, verified, verification_token
      )
      SELECT ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ''
      WHERE EXISTS (
        SELECT 1 FROM install_state
        WHERE id = 1 AND completed = 1 AND completed_at = ? AND setup_token_hash = ?
      ) AND NOT EXISTS (SELECT 1 FROM users)`,
    ).bind(
      email,
      nickname,
      initialScore,
      passwordHash,
      ip,
      PERMISSION.SUPER_ADMIN,
      formatDateTime(new Date(Date.now() - 86400000)),
      createdAt,
      completionMarker,
      tokenHash,
    ),
    c.env.DB.prepare(
      `UPDATE install_state SET setup_token_hash = NULL
       WHERE id = 1 AND completed = 1 AND completed_at = ? AND setup_token_hash = ?`,
    ).bind(completionMarker, tokenHash),
  ]);

  const userInsertChanges = results[1]?.meta.changes ?? 0;
  if (userInsertChanges !== 1) {
    return forbidden('Setup has already been completed or the setup token is invalid');
  }

  // 选项服务负责 D1 upsert 和 KV 缓存刷新；状态/用户已由上面的事务提交。
  await setOptions(c.env, {
    site_name: String(data.site_name),
    site_url: String(data.site_url ?? ''),
  });

  return jsonData({
    completed: true,
    user: { email, nickname, permission: PERMISSION.SUPER_ADMIN },
    site_name: String(data.site_name),
    site_url: String(data.site_url ?? ''),
  }, 'Setup completed');
});
