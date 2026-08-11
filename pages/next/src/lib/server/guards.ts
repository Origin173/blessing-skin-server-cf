/**
 * Hono 兼容守卫中间件 (包装 context.ts 的守卫函数,签名对齐原 lib/auth.ts)。
 * 用法与 Hono 版一致: router.get('/x', requireGuest, handler)
 */
import type { CompatMiddleware } from './compat';
import {
  requireAuth as authGuard,
  requireGuest as guestGuard,
  rejectBanned as bannedGuard,
  requireRole as roleGuard,
  requireVerified as verifiedGuard,
  requireEmailFilled as emailFilledGuard,
} from './context';

export const requireAuth: CompatMiddleware = async (c, next) => {
  const res = await authGuard(c.ctx);
  if (res) return res;
  return next();
};

export const requireGuest: CompatMiddleware = async (c, next) => {
  const res = await guestGuard(c.ctx);
  if (res) return res;
  return next();
};

export const rejectBanned: CompatMiddleware = async (c, next) => {
  const res = await bannedGuard(c.ctx);
  if (res) return res;
  return next();
};

export function requireRole(min: number): CompatMiddleware {
  return async (c, next) => {
    const res = await roleGuard(c.ctx, min);
    if (res) return res;
    return next();
  };
}

export const requireVerified: CompatMiddleware = async (c, next) => {
  const res = await verifiedGuard(c.ctx);
  if (res) return res;
  return next();
};

export const requireEmailFilled: CompatMiddleware = async (c, next) => {
  const res = await emailFilledGuard(c.ctx);
  if (res) return res;
  return next();
};

/** CSRF 校验中间件 (非安全方法,对应 VerifyCsrfToken;失败 419) */
export const csrfMiddleware: CompatMiddleware = async (c, next) => {
  const { verifyCsrf } = await import('./session');
  const ok = await verifyCsrf(c.ctx.request, c.ctx.session);
  if (!ok) {
    return new Response(JSON.stringify({ code: 1, message: 'CSRF token mismatch' }), {
      status: 419,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return next();
};

/** 兼容 AppVariables 类型占位 (迁移代码的类型标注用) */
export type AppVariables = Record<string, never>;
