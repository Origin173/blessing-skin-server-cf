/**
 * 认证路由,对应 AuthController + routes/web.php 的 auth 前缀。
 * 过滤器/事件钩子 (插件系统) 已按计划移除。
 */

import { CompatRouter, CompatContext } from '@/lib/server/compat';
import {
  requireGuest,
  requireAuth,
  rejectBanned,
  requireEmailFilled,
  AppVariables,
} from '@/lib/server/guards';
import { json, jsonData, jsonError, forbidden, jsonValidationError } from '@/lib/server/response';
import { validate, Rule } from '@/lib/server/validate';
import { option, boolOption } from '@/lib/server/options';
import { verifyPassword, hashPassword } from '@/lib/server/ciphers';
import { createSession, destroySession, sessionCookie, clearSessionCookie, SessionData } from '@/lib/server/session';
import { validateCaptcha, captchaResponse } from '@/lib/server/captcha';
import { validatePlayerName } from '@/lib/server/player-name';
import { temporarySignedUrl, hasValidSignature } from '@/lib/server/signed-url';
import { sha1hex } from '@/lib/server/hash';
import { now, formatDateTime, UserRow, PlayerRow, PERMISSION } from '@/lib/server/types';
import { readBody } from './helpers';

const LOGIN_FAIL_TTL = 3600; // 1 小时
const MAIL_TTL = 3600;

export const authRoutes = new CompatRouter();

/**
 * 确保访客已有会话 (对应 Laravel web 中间件组:每个请求都会启动会话)。
 * 无会话时创建匿名会话;返回 [sessionId, setCookieHeader | null]。
 */
async function ensureSession(
  c: CompatContext,
): Promise<[string | null, string | null]> {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    return [sessionId, null];
  }
  const { id } = await createSession(c.env, 0, false);
  const secure = new URL(c.req.url).protocol === 'https:';
  return [id, sessionCookie(id, false, secure)];
}

// ---------- 登录 ----------

authRoutes.get('/login', requireGuest, async (c) => {
  const ip = c.get('ip');
  const failsKey = `login_fails:${await sha1hex(ip)}`;
  const loginFails = Number((await c.env.KV_SKIN.get(failsKey)) ?? 0);

  const [, setCookie] = await ensureSession(c);
  const res = jsonData({
    csrf: c.get('session')?.csrf ?? null,
    extra: {
      tooManyFails: loginFails > 3,
      recaptcha: await option(c.env, 'recaptcha_sitekey'),
      invisible: (await boolOption(c.env, 'recaptcha_invisible')) as boolean,
    },
  });
  if (setCookie) res.headers.set('Set-Cookie', setCookie);
  return res;
});

authRoutes.post('/login', requireGuest, async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const session = c.get('session');

  const result = await validate(
    body,
    {
      identification: 'required',
      password: 'required|min:6|max:32',
    },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const identification = String(body.identification ?? '');
  const password = String(body.password ?? '');

  // 登录失败 >3 次需要验证码
  const ip = c.get('ip');
  const failsKey = `login_fails:${await sha1hex(ip)}`;
  const loginFails = Number((await c.env.KV_SKIN.get(failsKey)) ?? 0);
  if (loginFails > 3) {
    const captchaOk = await validateCaptcha(c.env, c.get('sessionId') ?? '', c.get('session'), String(body.captcha ?? ''));
    if (!captchaOk) {
      const message = await trans('validation.captcha');
      return jsonValidationError({ captcha: [message] });
    }
  }

  // 身份类型:邮箱或玩家名
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identification);
  let user: UserRow | null = null;
  if (isEmail) {
    const { results } = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .bind(identification)
      .all<UserRow>();
    user = results[0] ?? null;
  } else {
    const { results } = await c.env.DB.prepare('SELECT * FROM players WHERE name = ? LIMIT 1')
      .bind(identification)
      .all<PlayerRow>();
    if (results[0]) {
      const userRes = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
        .bind(results[0].uid)
        .first<UserRow>();
      user = userRes ?? null;
    }
  }

  if (!user) {
    return jsonError(await trans('auth.validation.user'), 2);
  }

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const ok = await verifyPassword(method, password, user.password, salt);
  if (!ok) {
    const fails = loginFails + 1;
    await c.env.KV_SKIN.put(failsKey, String(fails), { expirationTtl: LOGIN_FAIL_TTL });
    return jsonError(await trans('auth.validation.password'), 1, {
      login_fails: fails,
    });
  }

  // 登录成功
  await c.env.KV_SKIN.delete(failsKey);
  const remember = body.keep === true || body.keep === 'true' || body.keep === '1';
  const { id, data } = await createSession(c.env, user.uid, remember);
  const secure = new URL(c.req.url).protocol === 'https:';

  const res = json(await trans('auth.login.success'), 0, {
    redirectTo: '/user',
  });
  res.headers.set('Set-Cookie', sessionCookie(id, remember, secure));
  return res;
});

// ---------- 登出 ----------

authRoutes.post('/logout', requireAuth, rejectBanned, async (c) => {
  const trans = c.get('trans');
  await destroySession(c.env, c.req.raw);
  const secure = new URL(c.req.url).protocol === 'https:';
  const res = json(await trans('auth.logout.success'), 0);
  res.headers.set('Set-Cookie', clearSessionCookie(secure));
  return res;
});

// ---------- 注册 ----------

authRoutes.get('/register', requireGuest, async (c) => {
  const [, setCookie] = await ensureSession(c);
  const res = jsonData({
    csrf: c.get('session')?.csrf ?? null,
    extra: {
      player: (await boolOption(c.env, 'register_with_player_name')) as boolean,
      recaptcha: await option(c.env, 'recaptcha_sitekey'),
      invisible: (await boolOption(c.env, 'recaptcha_invisible')) as boolean,
    },
  });
  if (setCookie) res.headers.set('Set-Cookie', setCookie);
  return res;
});

authRoutes.post('/register', requireGuest, async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const session = c.get('session');

  const registerWithPlayerName = (await boolOption(c.env, 'register_with_player_name')) as boolean;

  const nameRuleConfig = String(await option(c.env, 'player_name_rule'));
  const customRegexp = String(await option(c.env, 'custom_player_name_regexp'));
  const rules: Record<string, string | Rule[]> = {
    email: 'required|email|unique:users',
    password: 'required|min:8|max:32',
    captcha: 'required',
  };
  if (registerWithPlayerName) {
    rules.player_name = [
      'required',
      `min:${await option(c.env, 'player_name_length_min')}`,
      `max:${await option(c.env, 'player_name_length_max')}`,
      {
        kind: 'custom',
        name: `user.player.player-name-rule.${nameRuleConfig}`,
        test: (value: unknown) =>
          validatePlayerName(String(value), { rule: nameRuleConfig, customRegexp }),
      },
    ];
  } else {
    rules.nickname = 'required|max:255';
  }

  const result = await validate(
    body,
    rules,
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  // 验证码
  const captchaOk = await validateCaptcha(
    c.env,
    c.get('sessionId') ?? '',
    c.get('session'),
    String(body.captcha ?? ''),
  );
  if (!captchaOk) {
    return jsonValidationError({ captcha: [await trans('validation.captcha')] });
  }

  const playerName = body.player_name ? String(body.player_name) : null;
  if (registerWithPlayerName && playerName) {
    const { results } = await c.env.DB.prepare('SELECT pid FROM players WHERE name = ? LIMIT 1')
      .bind(playerName)
      .all();
    if (results.length > 0) {
      return jsonError(await trans('user.player.add.repeated'), 1);
    }
  }

  // 同 IP 注册数限制
  const ip = c.get('ip');
  const regsPerIp = Number(await option(c.env, 'regs_per_ip'));
  const ipCount = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE ip = ?')
    .bind(ip)
    .first<{ c: number }>();
  if ((ipCount?.c ?? 0) >= regsPerIp) {
    return jsonError(
      await trans('auth.register.max', { regs: regsPerIp }),
      1,
    );
  }

  const nickname = registerWithPlayerName && playerName ? playerName : String(body.nickname ?? '');
  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const hashed = await hashPassword(method, String(body.password), salt);
  const nowStr = now();

  const userRes = await c.env.DB.prepare(
    `INSERT INTO users (email, nickname, score, avatar, password, ip, permission, last_sign_at, register_at, verified, verification_token)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 0, '')`,
  )
    .bind(
      String(body.email),
      nickname,
      Number(await option(c.env, 'user_initial_score')),
      hashed,
      ip,
      PERMISSION.NORMAL,
      formatDateTime(new Date(Date.now() - 86400000)), // last_sign_at = 昨天
      nowStr,
    )
    .run();
  const uid = Number(userRes.meta.last_row_id);

  if (registerWithPlayerName && playerName) {
    await c.env.DB.prepare(
      `INSERT INTO players (uid, name, tid_skin, tid_cape, last_modified) VALUES (?, ?, 0, 0, ?)`,
    )
      .bind(uid, playerName, nowStr)
      .run();
  }

  // 自动登录
  const { id, data } = await createSession(c.env, uid, false);
  const secure = new URL(c.req.url).protocol === 'https:';
  const res = json(await trans('auth.register.success'), 0);
  res.headers.set('Set-Cookie', sessionCookie(id, false, secure));
  return res;
});

// ---------- 验证码 ----------

authRoutes.get('/captcha', async (c) => {
  const session = c.get('session');
  const sessionId = c.get('sessionId');
  if (!session || !sessionId) {
    // 需要先有会话 (验证码短语存于会话)
    const { id, data } = await createSession(c.env, 0, false);
    const secure = new URL(c.req.url).protocol === 'https:';
    const res = await captchaResponse(c.env, id, data);
    res.headers.set('Set-Cookie', sessionCookie(id, false, secure));
    return res;
  }
  return captchaResponse(c.env, sessionId, session);
});

// ---------- 忘记密码 ----------

authRoutes.get('/forgot', requireGuest, async (c) => {
  const [, setCookie] = await ensureSession(c);
  const res = jsonData({
    csrf: c.get('session')?.csrf ?? null,
    extra: {
      recaptcha: await option(c.env, 'recaptcha_sitekey'),
      invisible: (await boolOption(c.env, 'recaptcha_invisible')) as boolean,
      disabled: !c.env.RESEND_API_KEY,
    },
  });
  if (setCookie) res.headers.set('Set-Cookie', setCookie);
  return res;
});

authRoutes.post('/forgot', requireGuest, async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const session = c.get('session');

  if (!c.env.RESEND_API_KEY) {
    return jsonError(await trans('auth.forgot.disabled'), 1);
  }

  const result = await validate(
    body,
    { email: 'required|email', captcha: 'required' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const captchaOk = await validateCaptcha(
    c.env,
    c.get('sessionId') ?? '',
    session ?? undefined as unknown as SessionData,
    String(body.captcha ?? ''),
  );
  if (!captchaOk) {
    return jsonValidationError({ captcha: [await trans('validation.captcha')] });
  }

  // 180 秒每 IP 邮件限流
  const ip = c.get('ip');
  const lastMailKey = `last_mail:${await sha1hex(ip)}`;
  const lastMail = Number((await c.env.KV_SKIN.get(lastMailKey)) ?? 0);
  const remain = 180 + lastMail - Math.floor(Date.now() / 1000);
  if (remain > 0) {
    return jsonError(await trans('auth.forgot.frequent-mail'), 2);
  }

  const email = String(body.email);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<UserRow>();
  if (!user) {
    return jsonError(await trans('auth.forgot.unregistered'), 1);
  }

  // 生成签名 URL (1 小时有效)
  const key = c.env.APP_KEY ?? '';
  const url = await temporarySignedUrl(
    key,
    '/auth/reset/{uid}',
    { uid: user.uid },
    {},
    Math.floor(Date.now() / 1000) + 3600,
  );

  // 发送邮件 (Phase 4 完善;此处仅返回 URL 供开发测试)
  const siteName = String(await option(c.env, 'site_name'));
  const mailResult = await sendMail(c.env, email, {
    subject: `[${siteName}] ${await trans('auth.forgot.reset')}`,
    html: await trans('auth.forgot.mail.reset', { url: url }),
  });
  if (!mailResult.ok) {
    return jsonError(await trans('auth.forgot.failed', { msg: mailResult.error ?? '' }), 2);
  }

  await c.env.KV_SKIN.put(lastMailKey, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: MAIL_TTL,
  });

  return json(await trans('auth.forgot.success'), 0, { url });
});

// ---------- 重置密码 ----------

authRoutes.get('/reset/:uid', requireGuest, async (c) => {
  const uid = c.req.param('uid');
  const key = c.env.APP_KEY ?? '';
  const valid = await hasValidSignature(key, c.req.path, new URL(c.req.url).searchParams);
  if (!valid) {
    return forbidden(await c.get('trans')('auth.reset.invalid'));
  }
  return jsonData({ user: Number(uid) });
});

authRoutes.post('/reset/:uid', requireGuest, async (c) => {
  const trans = c.get('trans');
  const uid = Number(c.req.param('uid'));
  const key = c.env.APP_KEY ?? '';
  const valid = await hasValidSignature(key, c.req.path, new URL(c.req.url).searchParams);
  if (!valid) {
    return forbidden(await trans('auth.reset.invalid'));
  }

  const body = await readBody(c);
  const result = await validate(
    body,
    { password: 'required|min:8|max:32' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(uid)
    .first<UserRow>();
  if (!user) {
    return forbidden(await trans('auth.reset.invalid'));
  }

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const hashed = await hashPassword(method, String(body.password), salt);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE uid = ?')
    .bind(hashed, uid)
    .run();

  return json(await trans('auth.reset.success'), 0);
});

// ---------- 绑定邮箱 ----------

authRoutes.post('/bind', requireAuth, requireEmailFilled, async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const user = c.get('user')!;

  const result = await validate(
    body,
    { email: 'required|email|unique:users' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  await c.env.DB.prepare('UPDATE users SET email = ? WHERE uid = ?')
    .bind(String(body.email), user.uid)
    .run();

  return json('', 0);
});

// ---------- 邮箱验证 ----------

authRoutes.get('/verify/:uid', async (c) => {
  if (!(await boolOption(c.env, 'require_verification'))) {
    return jsonError(await c.get('trans')('user.verification.disabled'), 1);
  }
  const key = c.env.APP_KEY ?? '';
  const valid = await hasValidSignature(key, c.req.path, new URL(c.req.url).searchParams);
  if (!valid) {
    return forbidden(await c.get('trans')('auth.verify.invalid'));
  }
  return jsonData({});
});

authRoutes.post('/verify/:uid', async (c) => {
  const trans = c.get('trans');
  const uid = Number(c.req.param('uid'));
  const key = c.env.APP_KEY ?? '';
  const valid = await hasValidSignature(key, c.req.path, new URL(c.req.url).searchParams);
  if (!valid) {
    return forbidden(await trans('auth.verify.invalid'));
  }

  const body = await readBody(c);
  const result = await validate(body, { email: 'required|email' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(uid)
    .first<UserRow>();
  if (!user) {
    return forbidden(await trans('auth.verify.invalid'));
  }
  if (user.email !== String(body.email)) {
    return jsonError(await trans('auth.verify.not-matched'), 1);
  }

  await c.env.DB.prepare('UPDATE users SET verified = 1 WHERE uid = ?').bind(uid).run();
  return json('', 0);
});

// ---------- 邮件发送 (Resend;SMTP 支持见 Phase 4) ----------

interface MailResult {
  ok: boolean;
  error?: string;
}

export async function sendMail(
  env: Env,
  to: string,
  mail: { subject: string; html: string },
): Promise<MailResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'MAIL_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM_ADDRESS ? `${env.MAIL_FROM_NAME ?? 'Blessing Skin'} <${env.MAIL_FROM_ADDRESS}>` : undefined,
        to: [to],
        subject: mail.subject,
        html: mail.html,
        headers: { 'Auto-Submitted': 'auto-generated' },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
