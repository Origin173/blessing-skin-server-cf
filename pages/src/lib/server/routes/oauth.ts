/**
 * OAuth2 端点 (Passport 等价): /oauth/token, /oauth/authorize,
 * /oauth/clients, /oauth/tokens, /oauth/personal-access-tokens, /oauth/scopes。
 * 挂载于 /oauth 前缀,无 CSRF (token 端点),authorize 需要会话。
 */

import { CompatRouter } from '@/lib/server/compat';
import { CompatFormData } from '@/lib/server/multipart';
import { AppVariables } from '@/lib/server/guards';
import { jsonData, jsonError } from '@/lib/server/response';
import {
  findClient,
  verifyClientSecret,
  createAccessToken,
  createRefreshToken,
  createAuthCode,
  findAccessToken,
  isValidAccessToken,
  revokeAccessToken,
  tokenScopes,
  DEFAULT_SCOPES,
  ACCESS_TOKEN_TTL,
  AuthCode,
  RefreshToken,
  OAuthClient,
  AccessToken,
} from '@/lib/server/oauth';
import { verifyPassword } from '@/lib/server/ciphers';
import { requireAuth, requireVerified } from '@/lib/server/guards';
import { randomHex, now, UserRow } from '@/lib/server/types';
import { readBody } from './helpers';

export const oauthRoutes = new CompatRouter();

// ---------- Token 端点 (对应 Passport::token) ----------

oauthRoutes.post('/token', async (c) => {
  // 兼容 form-encoded (标准 OAuth2) 与 JSON body (Passport 亦接受)
  const contentType = c.req.header('content-type') ?? '';
  let form: CompatFormData;
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // parseMultipart 只处理 multipart;urlencoded 走 readBody 解析
    const body = await readBody(c);
    form = new CompatFormData(
      Object.entries(body).map(([key, value]) => [key, String(value)]),
    );
  } else {
    try {
      form = await c.req.formData();
    } catch {
      const body = await readBody(c);
      form = new CompatFormData(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      );
    }
  }
  const grantType = String(form.get('grant_type') ?? '');

  const clientId = Number(form.get('client_id'));
  const clientSecret = String(form.get('client_secret') ?? '');
  const client = await findClient(c.env, clientId);
  if (!client || !(await verifyClientSecret(c.env, client, clientSecret))) {
    return c.json({ error: 'invalid_client', message: 'Client authentication failed' }, 401);
  }

  switch (grantType) {
    case 'authorization_code':
      return grantAuthorizationCode(c, form, client);

    case 'refresh_token':
      return grantRefreshToken(c, form, client);

    case 'password':
      return grantPassword(c, form, client);

    case 'client_credentials':
      return grantClientCredentials(c, form, client);

    default:
      return c.json({ error: 'unsupported_grant_type' }, 400);
  }
});

async function issueTokenResponse(
  env: Env,
  clientId: number,
  userId: number | null,
  scopes: string[],
  withRefresh: boolean,
): Promise<Response> {
  const access = await createAccessToken(env, { userId, clientId, scopes });
  const body: Record<string, unknown> = {
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    access_token: access.id,
    scope: scopes.join(' '),
  };
  if (withRefresh) {
    const refresh = await createRefreshToken(env, access.id);
    body.refresh_token = refresh.id;
  }
  return Response.json(body);
}

async function grantAuthorizationCode(
  c: { env: Env; json: (body: unknown, status?: number) => Response },
  form: CompatFormData,
  client: OAuthClient,
): Promise<Response> {
  const code = String(form.get('code') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');

  const authCode = await c.env.DB.prepare('SELECT * FROM oauth_auth_codes WHERE id = ? LIMIT 1')
    .bind(code)
    .first<AuthCode>();
  if (!authCode || authCode.revoked || authCode.client_id !== client.id) {
    return c.json({ error: 'invalid_grant' }, 400);
  }
  if (authCode.expires_at && authCode.expires_at < now()) {
    return c.json({ error: 'invalid_grant' }, 400);
  }
  if (client.redirect && redirectUri !== client.redirect) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // 一次性使用
  await c.env.DB.prepare('UPDATE oauth_auth_codes SET revoked = 1 WHERE id = ?').bind(code).run();

  const scopes = JSON.parse(authCode.scopes) as string[];
  return issueTokenResponse(c.env, client.id, authCode.user_id, scopes, true);
}

async function grantRefreshToken(
  c: { env: Env; json: (body: unknown, status?: number) => Response },
  form: CompatFormData,
  client: OAuthClient,
): Promise<Response> {
  const refreshToken = String(form.get('refresh_token') ?? '');

  const refresh = await c.env.DB.prepare('SELECT * FROM oauth_refresh_tokens WHERE id = ? LIMIT 1')
    .bind(refreshToken)
    .first<RefreshToken>();
  if (!refresh || refresh.revoked) {
    return c.json({ error: 'invalid_grant' }, 400);
  }
  if (refresh.expires_at && refresh.expires_at < now()) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  const access = await c.env.DB.prepare('SELECT * FROM oauth_access_tokens WHERE id = ? LIMIT 1')
    .bind(refresh.access_token_id)
    .first<AccessToken>();
  if (!access || access.client_id !== client.id || access.revoked) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // 轮换: 撤销旧 refresh + 旧 access
  await revokeAccessToken(c.env, access.id);

  return issueTokenResponse(c.env, client.id, access.user_id, JSON.parse(access.scopes), true);
}

async function grantPassword(
  c: { env: Env; json: (body: unknown, status?: number) => Response },
  form: CompatFormData,
  client: OAuthClient,
): Promise<Response> {
  if (!client.password_client) {
    return c.json({ error: 'unauthorized_client' }, 400);
  }

  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(username)
    .first<UserRow>();
  if (!user) {
    return c.json({ error: 'invalid_grant' }, 400);
  }
  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  if (!(await verifyPassword(method, password, user.password, salt))) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  const scopes = String(form.get('scope') ?? '')
    .split(' ')
    .filter(Boolean);
  return issueTokenResponse(c.env, client.id, user.uid, scopes, true);
}

async function grantClientCredentials(
  c: { env: Env; json: (body: unknown, status?: number) => Response },
  form: CompatFormData,
  client: OAuthClient,
): Promise<Response> {
  const scopes = String(form.get('scope') ?? '')
    .split(' ')
    .filter(Boolean);
  return issueTokenResponse(c.env, client.id, null, scopes, false);
}

// ---------- Authorize (授权页 + 同意) ----------

oauthRoutes.get('/authorize', requireAuth, async (c) => {
  const url = new URL(c.req.url);
  const clientId = Number(url.searchParams.get('client_id'));
  const client = await findClient(c.env, clientId);
  if (!client || client.revoked || client.personal_access_client) {
    return c.json({ error: 'invalid_client' }, 400);
  }

  const scopes = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);
  return jsonData({
    client: { id: client.id, name: client.name },
    scopes: scopes.map((s) => ({ name: s, description: DEFAULT_SCOPES[s] ?? s })),
    state: url.searchParams.get('state'),
    redirectUri: url.searchParams.get('redirect_uri'),
  });
});

oauthRoutes.post('/authorize', requireAuth, requireVerified, async (c) => {
  // 兼容 JSON body (SPA) 与 form-encoded (Passport 默认)
  const form = await readBody(c);
  const user = c.get('user')!;
  const clientId = Number(form.client_id);
  const client = await findClient(c.env, clientId);
  if (!client || client.revoked || client.personal_access_client) {
    return c.json({ error: 'invalid_client' }, 400);
  }

  const scopes = String(form.scope ?? '').split(' ').filter(Boolean);
  const state = String(form.state ?? '');
  const redirectUri = String(form.redirect_uri ?? client.redirect);

  if (form.approve !== true && String(form.approve) !== 'true') {
    // 拒绝授权
    const separator = redirectUri.includes('?') ? '&' : '?';
    return Response.redirect(`${redirectUri}${separator}error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ''}`, 302);
  }

  const code = await createAuthCode(c.env, user.uid, client.id, scopes);
  const separator = redirectUri.includes('?') ? '&' : '?';
  const location = `${redirectUri}${separator}code=${code.id}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
  return Response.redirect(location, 302);
});

// ---------- 客户端管理 (用户 OAuth 管理页) ----------

oauthRoutes.get('/clients', requireAuth, async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, secret, redirect, personal_access_client, password_client, revoked, created_at, updated_at FROM oauth_clients WHERE user_id = ?',
  )
    .bind(user.uid)
    .all();
  return c.json(results);
});

oauthRoutes.post('/clients', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await readBody(c);
  const name = String(body.name ?? '');
  const redirect = String(body.redirect ?? '');
  const secret = randomHex(40);
  const createdAt = now();

  const res = await c.env.DB.prepare(
    `INSERT INTO oauth_clients (user_id, name, secret, provider, redirect, personal_access_client, password_client, revoked, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 0, 0, 0, ?, ?)`,
  )
    .bind(user.uid, name, secret, redirect, createdAt, createdAt)
    .run();

  return c.json({
    id: Number(res.meta.last_row_id),
    name,
    secret,
    redirect,
    personal_access_client: false,
    password_client: false,
    revoked: false,
  }, 201);
});

oauthRoutes.put('/clients/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const client = await findClient(c.env, id);
  if (!client || client.user_id !== user.uid) {
    return c.json({ error: 'invalid_client' }, 404);
  }
  const body = await readBody(c);
  await c.env.DB.prepare('UPDATE oauth_clients SET name = ?, redirect = ?, updated_at = ? WHERE id = ?')
    .bind(String(body.name ?? client.name), String(body.redirect ?? client.redirect), now(), id)
    .run();
  return c.json({ id, name: body.name ?? client.name, redirect: body.redirect ?? client.redirect });
});

oauthRoutes.delete('/clients/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const client = await findClient(c.env, id);
  if (!client || client.user_id !== user.uid) {
    return c.json({ error: 'invalid_client' }, 404);
  }
  await c.env.DB.prepare('UPDATE oauth_clients SET revoked = 1, updated_at = ? WHERE id = ?')
    .bind(now(), id)
    .run();
  return c.json({});
});

// ---------- 已签发 token 管理 ----------

oauthRoutes.get('/tokens', requireAuth, async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.scopes, t.revoked, t.created_at, t.expires_at, c.name AS client_name
     FROM oauth_access_tokens t JOIN oauth_clients c ON c.id = t.client_id
     WHERE t.user_id = ? AND t.client_id != 0 AND c.personal_access_client = 0
     ORDER BY t.created_at DESC`,
  )
    .bind(user.uid)
    .all();
  return c.json(results);
});

oauthRoutes.delete('/tokens/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id') ?? '';
  const token = await c.env.DB.prepare('SELECT * FROM oauth_access_tokens WHERE id = ? LIMIT 1')
    .bind(id)
    .first();
  if (!token || token.user_id !== user.uid) {
    return c.json({ error: 'invalid_token' }, 404);
  }
  await revokeAccessToken(c.env, id);
  return c.json({});
});

// ---------- Personal Access Tokens ----------

oauthRoutes.get('/personal-access-tokens', requireAuth, async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.scopes, t.revoked, t.created_at, t.expires_at
     FROM oauth_access_tokens t
     JOIN oauth_clients c ON c.id = t.client_id
     WHERE t.user_id = ? AND c.personal_access_client = 1`,
  )
    .bind(user.uid)
    .all();
  return c.json(results);
});

oauthRoutes.post('/personal-access-tokens', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await readBody(c);
  const name = String(body.name ?? '');

  // 获取该用户的 personal access client (没有则创建)
  let client = await c.env.DB.prepare(
    `SELECT c.* FROM oauth_personal_access_clients pac
     JOIN oauth_clients c ON c.id = pac.client_id
     WHERE pac.client_id IN (SELECT id FROM oauth_clients WHERE user_id = ? AND personal_access_client = 1)
     LIMIT 1`,
  )
    .bind(user.uid)
    .first<OAuthClient>();

  if (!client) {
    const createdAt = now();
    const res = await c.env.DB.prepare(
      `INSERT INTO oauth_clients (user_id, name, secret, provider, redirect, personal_access_client, password_client, revoked, created_at, updated_at)
       VALUES (?, 'Blessing Skin Personal Access Client', ?, NULL, '', 1, 0, 0, ?, ?)`,
    )
      .bind(user.uid, randomHex(40), createdAt, createdAt)
      .run();
    const clientId = Number(res.meta.last_row_id);
    await c.env.DB.prepare(
      `INSERT INTO oauth_personal_access_clients (client_id, created_at, updated_at) VALUES (?, ?, ?)`,
    )
      .bind(clientId, createdAt, createdAt)
      .run();
    client = await findClient(c.env, clientId);
  }

  const scopes = Array.isArray(body.scopes) ? (body.scopes as string[]) : [];
  const access = await createAccessToken(c.env, {
    userId: user.uid,
    clientId: client!.id,
    scopes,
    name,
  });

  return c.json(
    {
      id: access.id,
      name,
      scopes: access.scopes,
      revoked: false,
      created_at: access.created_at,
      updated_at: access.updated_at,
      expires_at: access.expires_at,
      accessToken: access.id,
    },
    201,
  );
});

oauthRoutes.delete('/personal-access-tokens/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id') ?? '';
  const token = await findAccessToken(c.env, id);
  if (!token || token.user_id !== user.uid) {
    return c.json({ error: 'invalid_token' }, 404);
  }
  await revokeAccessToken(c.env, id);
  return c.json({});
});

// ---------- Scopes 列表 ----------

oauthRoutes.get('/scopes', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT name, description FROM scopes').all();
  const dbScopes = Object.fromEntries(results.map((r) => [r.name, r.description]));
  return c.json({ ...dbScopes, ...DEFAULT_SCOPES });
});
