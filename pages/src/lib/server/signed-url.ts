/**
 * 签名 URL (密码重置 / 邮箱验证),对应 Laravel URL::temporarySignedRoute
 * + Request::hasValidSignature(false) — 相对 URL 语义。
 *
 * 算法: signature = base64url( HMAC-SHA256(APP_KEY, `${path}?${query}`) )
 *   - query 覆盖除 signature 外的全部参数 (含 expires)
 *   - 参数按 key 排序 (与 Laravel ksort 一致)
 * 旧站邮件链接兼容:若 APP_KEY 与原站 .env 一致,旧链接 (1 小时有效期内) 仍可验证。
 */

import { hashEquals } from './ciphers';

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
  return base64urlEncode(new Uint8Array(sig));
}

/** 生成签名 URL。pathParams 中的值替换路径占位符 {name},其余进 query */
export async function temporarySignedUrl(
  key: string,
  pathTemplate: string,
  pathParams: Record<string, string | number>,
  queryParams: Record<string, string | number>,
  expiresAt: number,
): Promise<string> {
  const params: Record<string, string | number> = {
    ...pathParams,
    ...queryParams,
    expires: expiresAt,
  };

  let path = pathTemplate;
  const query: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (path.includes(`{${name}}`)) {
      path = path.replace(`{${name}}`, String(value));
    } else {
      query[name] = value;
    }
  }

  const sortedKeys = Object.keys(query).sort();
  const qs = sortedKeys.map((k) => `${k}=${encodeURIComponent(String(query[k]!))}`).join('&');
  const url = `${path}?${qs}`;

  const signature = await hmacSha256(key, url);
  return `${url}&signature=${signature}`;
}

/** 校验签名 URL (相对路径语义)。expires 过期或签名不符返回 false */
export async function hasValidSignature(
  key: string,
  path: string,
  query: URLSearchParams,
  now = Date.now(),
): Promise<boolean> {
  const signature = query.get('signature');
  if (!signature) return false;

  const expires = Number(query.get('expires') ?? 0);
  if (!expires || expires * 1000 < now) return false;

  const q = new URLSearchParams(query);
  q.delete('signature');
  const qs = q.toString();
  const url = qs ? `${path}?${qs}` : path;

  const expected = await hmacSha256(key, url);
  return hashEquals(expected, signature);
}
