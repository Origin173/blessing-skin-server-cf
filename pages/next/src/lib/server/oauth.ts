/**
 * OAuth2 (Laravel Passport 等价) — 纯 Token 表实现。
 * Passport v11 的 access token 是随机字符串 (非 JWT),存于 oauth_access_tokens。
 * 支持 grant: authorization_code / refresh_token / password / client_credentials,
 * 以及 personal access tokens (客户端自用)。
 */

import { randomHex, now } from './types';

export const ACCESS_TOKEN_TTL = 365 * 24 * 3600; // 1 年 (Passport 默认)
export const REFRESH_TOKEN_TTL = 365 * 24 * 3600;
export const AUTH_CODE_TTL = 600; // 10 分钟

export interface OAuthClient {
  id: number;
  user_id: number | null;
  name: string;
  secret: string | null;
  provider: string | null;
  redirect: string;
  personal_access_client: number;
  password_client: number;
  revoked: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AccessToken {
  id: string;
  user_id: number | null;
  client_id: number;
  name: string | null;
  scopes: string; // JSON array
  revoked: number;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

export interface RefreshToken {
  id: string;
  access_token_id: string;
  revoked: number;
  expires_at: string | null;
}

export interface AuthCode {
  id: string;
  user_id: number;
  client_id: number;
  scopes: string;
  revoked: number;
  expires_at: string | null;
}

// ---------- scope 定义 (对应 AuthServiceProvider 的默认 scopes) ----------

export const DEFAULT_SCOPES: Record<string, string> = {
  'User.Read': 'Read user info',
  'Notification.Read': 'Read notifications',
  'Notification.ReadWrite': 'Read and write notifications',
  'Player.Read': 'Read players',
  'Player.ReadWrite': 'Read and write players',
  'Closet.Read': 'Read closet',
  // 原站拼写错误 (Closet.ReadWrtie),迁移时保留以兼容既有客户端
  'Closet.ReadWrtie': 'Read closet (legacy typo)',
  'Closet.ReadWrite': 'Read and write closet',
  'UsersManagement.Read': 'Read users (admin)',
  'UsersManagement.ReadWrite': 'Read and write users (admin)',
  'PlayersManagement.Read': 'Read players (admin)',
  'PlayersManagement.ReadWrite': 'Read and write players (admin)',
  'ClosetManagement.Read': 'Read closet (admin)',
  'ClosetManagement.ReadWrite': 'Read and write closet (admin)',
  'ReportsManagement.Read': 'Read reports (admin)',
  'ReportsManagement.ReadWrite': 'Read and write reports (admin)',
};

// ---------- client ----------

export async function findClient(env: Env, id: number): Promise<OAuthClient | null> {
  const client = await env.DB.prepare('SELECT * FROM oauth_clients WHERE id = ? LIMIT 1')
    .bind(id)
    .first<OAuthClient>();
  return client ?? null;
}

export async function verifyClientSecret(
  env: Env,
  client: OAuthClient,
  secret: string | null,
): Promise<boolean> {
  if (client.revoked) return false;
  if (client.personal_access_client) {
    // personal access client 不校验 secret (Passport 行为)
    return true;
  }
  return client.secret !== null && secret !== null && client.secret === secret;
}

// ---------- token 签发 ----------

export async function createAccessToken(
  env: Env,
  params: {
    userId: number | null;
    clientId: number;
    scopes: string[];
    name?: string | null;
    ttl?: number;
  },
): Promise<AccessToken> {
  const id = randomHex(40);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + (params.ttl ?? ACCESS_TOKEN_TTL) * 1000);
  const row: AccessToken = {
    id,
    user_id: params.userId,
    client_id: params.clientId,
    name: params.name ?? null,
    scopes: JSON.stringify(params.scopes),
    revoked: 0,
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: formatSql(expiresAt),
  };
  await env.DB.prepare(
    `INSERT INTO oauth_access_tokens (id, user_id, client_id, name, scopes, revoked, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(row.id, row.user_id, row.client_id, row.name, row.scopes, row.created_at, row.updated_at, row.expires_at)
    .run();
  return row;
}

export async function createRefreshToken(
  env: Env,
  accessTokenId: string,
): Promise<RefreshToken> {
  const id = randomHex(100);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
  const row: RefreshToken = {
    id,
    access_token_id: accessTokenId,
    revoked: 0,
    expires_at: formatSql(expiresAt),
  };
  await env.DB.prepare(
    `INSERT INTO oauth_refresh_tokens (id, access_token_id, revoked, expires_at) VALUES (?, ?, 0, ?)`,
  )
    .bind(id, accessTokenId, row.expires_at)
    .run();
  return row;
}

export async function createAuthCode(
  env: Env,
  userId: number,
  clientId: number,
  scopes: string[],
): Promise<AuthCode> {
  const id = randomHex(40);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL * 1000);
  await env.DB.prepare(
    `INSERT INTO oauth_auth_codes (id, user_id, client_id, scopes, revoked, expires_at) VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, userId, clientId, JSON.stringify(scopes), formatSql(expiresAt))
    .run();
  return {
    id,
    user_id: userId,
    client_id: clientId,
    scopes: JSON.stringify(scopes),
    revoked: 0,
    expires_at: formatSql(expiresAt),
  };
}

// ---------- token 校验 ----------

export async function findAccessToken(env: Env, id: string): Promise<AccessToken | null> {
  const token = await env.DB.prepare('SELECT * FROM oauth_access_tokens WHERE id = ? LIMIT 1')
    .bind(id)
    .first<AccessToken>();
  return token ?? null;
}

export async function isValidAccessToken(env: Env, token: AccessToken): Promise<boolean> {
  if (token.revoked) return false;
  if (token.expires_at && token.expires_at < now()) return false;
  return true;
}

export function tokenScopes(token: AccessToken): string[] {
  try {
    return JSON.parse(token.scopes) as string[];
  } catch {
    return [];
  }
}

export async function revokeAccessToken(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE oauth_access_tokens SET revoked = 1 WHERE id = ?').bind(id).run();
  await env.DB.prepare('UPDATE oauth_refresh_tokens SET revoked = 1 WHERE access_token_id = ?')
    .bind(id)
    .run();
}

/** Bearer token 认证: 从 Authorization 头解析并校验 */
export async function authenticateBearer(env: Env, request: Request): Promise<{
  token: AccessToken;
  scopes: string[];
} | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const id = header.slice(7).trim();
  const token = await findAccessToken(env, id);
  if (!token) return null;
  if (!(await isValidAccessToken(env, token))) return null;
  return { token, scopes: tokenScopes(token) };
}

// ---------- 工具 ----------

function formatSql(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
