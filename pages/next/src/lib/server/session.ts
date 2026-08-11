/**
 * 会话管理,对应 Laravel session (cookie BS_SESSION) + VerifyCsrfToken。
 * - 会话数据存 KV (key: session:{id}),cookie 只存会话 ID
 * - 生命周期 120 分钟 (remember-me 5 年),滑动续期
 * - CSRF: 会话内随机 token,非安全方法校验 X-CSRF-TOKEN 头或 _token 表单字段
 */

import { randomHex } from './types';

export const SESSION_COOKIE = 'BS_SESSION';
export const SESSION_LIFETIME = 120 * 60; // 120 min
export const REMEMBER_LIFETIME = 5 * 365 * 24 * 3600; // 5 年 (Laravel remember token 语义)

export interface SessionData {
  uid: number;
  csrf: string;
  remember: boolean;
  /** 验证码短语 (与原站 session('captcha') 对应) */
  captcha?: string;
  last_activity: number;
}

export function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get('cookie');
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return map;
}

export function getCookie(request: Request, name: string): string | null {
  return parseCookies(request).get(name) ?? null;
}

function kvKey(id: string): string {
  return `session:${id}`;
}

/** 从请求解析会话 (并滑动续期) */
export async function getSession(env: Env, request: Request): Promise<SessionData | null> {
  const id = getCookie(request, SESSION_COOKIE);
  if (!id) return null;

  const raw = await env.KV_SKIN.get(kvKey(id));
  if (!raw) return null;

  let data: SessionData;
  try {
    data = JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }

  const lifetime = data.remember ? REMEMBER_LIFETIME : SESSION_LIFETIME;
  const now = Math.floor(Date.now() / 1000);
  if (now - data.last_activity > lifetime) {
    await env.KV_SKIN.delete(kvKey(id));
    return null;
  }

  // 滑动续期
  data.last_activity = now;
  await env.KV_SKIN.put(kvKey(id), JSON.stringify(data), { expirationTtl: lifetime });

  return data;
}

/** 创建会话,返回 { id, data } */
export async function createSession(
  env: Env,
  uid: number,
  remember: boolean,
): Promise<{ id: string; data: SessionData }> {
  const id = randomHex(40);
  const data: SessionData = {
    uid,
    csrf: randomHex(40),
    remember,
    last_activity: Math.floor(Date.now() / 1000),
  };
  const lifetime = remember ? REMEMBER_LIFETIME : SESSION_LIFETIME;
  await env.KV_SKIN.put(kvKey(id), JSON.stringify(data), { expirationTtl: lifetime });
  return { id, data };
}

/** 更新会话数据 (captcha 等) */
export async function updateSession(env: Env, id: string, data: SessionData): Promise<void> {
  const lifetime = data.remember ? REMEMBER_LIFETIME : SESSION_LIFETIME;
  await env.KV_SKIN.put(kvKey(id), JSON.stringify(data), { expirationTtl: lifetime });
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const id = getCookie(request, SESSION_COOKIE);
  if (id) {
    await env.KV_SKIN.delete(kvKey(id));
  }
}

/** 设置会话 cookie (Set-Cookie 头) */
export function sessionCookie(id: string, remember: boolean, secure: boolean): string {
  const maxAge = remember ? REMEMBER_LIFETIME : SESSION_LIFETIME;
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=;`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=0`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF 校验 (对应 VerifyCsrfToken):
 * 非安全方法必须携带与会话匹配的 token (X-CSRF-TOKEN 头或 _token 字段)
 */
export async function verifyCsrf(request: Request, session: SessionData | null): Promise<boolean> {
  const method = request.method.toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return true;
  if (!session) return false;

  const headerToken = request.headers.get('x-csrf-token');
  if (headerToken) {
    return headerToken === session.csrf;
  }

  // 表单字段 _token (JSON body 或 form)
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.clone().json();
      return (body as Record<string, unknown>)?._token === session.csrf;
    } catch {
      return false;
    }
  }
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.clone().formData();
    return form.get('_token') === session.csrf;
  }
  return false;
}
