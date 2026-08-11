/**
 * 密码哈希,对应 app/Services/Cipher/ 的 9 种算法。
 * 由 env.PWD_METHOD 选择 (与原站 config/secure.php 一致),SALT 用于加盐变体。
 *
 * 实现说明 (不用 WASM,兼容 workerd 的 WASM 限制):
 *   - BCRYPT / PHP_PASSWORD_HASH → bcryptjs (纯 JS,生成 $2a$ 前缀,与 PHP 互通)
 *   - MD5 / SALTED2MD5 → 自写纯 JS MD5
 *   - SHA256/512 → WebCrypto
 *   - ARGON2I → 无纯 JS 可行实现 (workerd 禁运行时 WASM),抛错提示改用其他算法
 */

import * as bcrypt from 'bcryptjs';
import { md5 as md5Js } from './md5';

export type CipherName =
  | 'BCRYPT'
  | 'ARGON2I'
  | 'PHP_PASSWORD_HASH'
  | 'MD5'
  | 'SALTED2MD5'
  | 'SHA256'
  | 'SALTED2SHA256'
  | 'SHA512'
  | 'SALTED2SHA512';

/** 与原站 hash_equals 一致的常数时间比较 */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function shaHex(algorithm: 'SHA-256' | 'SHA-512', data: string): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function argon2Unsupported(): never {
  throw new Error(
    'ARGON2I 密码算法在当前环境 (Cloudflare Workers) 不可用,请在配置中将 PWD_METHOD 改为 BCRYPT',
  );
}

/** 生成哈希 (注册 / 改密),对应 BaseCipher::hash + SALTED 变体 */
export async function hashPassword(method: string, password: string, salt: string): Promise<string> {
  switch (method) {
    case 'BCRYPT':
      return bcrypt.hash(password, 10);
    case 'PHP_PASSWORD_HASH':
      // PHP 8.x PASSWORD_DEFAULT = bcrypt
      return bcrypt.hash(password, 10);
    case 'ARGON2I':
      return argon2Unsupported();
    case 'MD5':
      return md5Js(password);
    case 'SALTED2MD5':
      return md5Js(md5Js(password) + salt);
    case 'SHA256':
      return shaHex('SHA-256', password);
    case 'SALTED2SHA256':
      return shaHex('SHA-256', (await shaHex('SHA-256', password)) + salt);
    case 'SHA512':
      return shaHex('SHA-512', password);
    case 'SALTED2SHA512':
      return shaHex('SHA-512', (await shaHex('SHA-512', password)) + salt);
    default:
      throw new Error(`Unknown PWD_METHOD: ${method}`);
  }
}

/** 校验密码,对应 HasPassword::verifyPassword */
export async function verifyPassword(
  method: string,
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  switch (method) {
    case 'BCRYPT':
    case 'PHP_PASSWORD_HASH':
      return bcrypt.compare(password, hash);
    case 'ARGON2I':
      return argon2Unsupported();
    case 'MD5':
      return hashEquals(md5Js(password), hash);
    case 'SALTED2MD5':
      return hashEquals(md5Js(md5Js(password) + salt), hash);
    case 'SHA256':
      return hashEquals(await shaHex('SHA-256', password), hash);
    case 'SALTED2SHA256':
      return hashEquals(await shaHex('SHA-256', (await shaHex('SHA-256', password)) + salt), hash);
    case 'SHA512':
      return hashEquals(await shaHex('SHA-512', password), hash);
    case 'SALTED2SHA512':
      return hashEquals(await shaHex('SHA-512', (await shaHex('SHA-512', password)) + salt), hash);
    default:
      throw new Error(`Unknown PWD_METHOD: ${method}`);
  }
}
