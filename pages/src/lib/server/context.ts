/**
 * 认证上下文 (去 Hono 化的 auth.ts),对应原站 middleware 组:
 *   web 组 (session+csrf) / authorize 组 (auth:web → RejectBannedUser →
 *   EnsureEmailFilled) / guest / role / verified
 *
 * 两种使用形态:
 *   - Route Handler: loadRequestContext(env, request) + withWeb()/requireAuth() 等守卫
 *   - RSC 页面:     loadPageContext(env, cookieHeader) (由 next/headers 提供 cookie)
 */

import { getSession, verifyCsrf, getCookie, SessionData } from './session';
import { detectLocale, t } from './i18n';
import { getOption } from './options';
import { PERMISSION, UserRow } from './types';
import { clientIp } from './ip';

export interface AppContext {
  env: Env;
  request: Request;
  session: SessionData | null;
  sessionId: string | null;
  user: UserRow | null;
  locale: string;
  /** 按请求语言翻译 */
  trans: (key: string, params?: Record<string, string | number>) => Promise<string>;
  /** 客户端 IP (CF-Connecting-IP) */
  ip: string;
}

/** 会话 + 用户 + 语言装载 (对应 sessionMiddleware) */
export async function loadRequestContext(env: Env, request: Request): Promise<AppContext> {
  const sessionId = request.headers.get('cookie')?.match(/(?:^|;\s*)BS_SESSION=([^;]+)/)?.[1] ?? null;
  const session = sessionId ? await getSession(env, request) : null;

  let user: UserRow | null = null;
  if (session) {
    if (session.uid !== 0) {
      // uid=0 为匿名会话 (验证码等),不查用户
      const { results } = await env.DB.prepare('SELECT * FROM users WHERE uid = ?')
        .bind(session.uid)
        .all<UserRow>();
      user = results[0] ?? null;
      if (!user) {
        // 用户不存在 (已删除),清会话
        await env.KV_SKIN.delete(`session:${sessionId}`);
      }
    }
  }

  const locale = detectLocale(request, getCookie(request, 'locale'));

  return {
    env,
    request,
    session,
    sessionId: session ? sessionId : null,
    user,
    locale,
    trans: (key, params) => t(key, params, { locale }),
    ip: clientIp(request),
  };
}

/** RSC 页面上下文 (由 next/headers 提供 cookie,复用同一装载逻辑) */
export async function loadPageContext(
  env: Env,
  cookieHeader: string | null,
): Promise<AppContext> {
  const request = new Request('http://local/', {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  return loadRequestContext(env, request);
}

/**
 * Route Handler 包装: 会话 + CSRF 校验 (对应 web 中间件组)。
 * 非安全方法 CSRF 失败返回 419 (对应 VerifyCsrfToken)。
 */
export async function withWeb(
  env: Env,
  request: Request,
  handler: (ctx: AppContext) => Promise<Response>,
): Promise<Response> {
  const ctx = await loadRequestContext(env, request);
  const ok = await verifyCsrf(request, ctx.session);
  if (!ok) {
    return new Response(JSON.stringify({ code: 1, message: 'CSRF token mismatch' }), {
      status: 419,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return handler(ctx);
}

/**
 * 登录要求。失败返回 401 响应 (带 X-Login-Required 头,前端拦截跳登录页),成功返回 null。
 */
export async function requireAuth(ctx: AppContext): Promise<Response | null> {
  if (!ctx.user) {
    const message = await ctx.trans('auth.check.anonymous');
    const res = Response.json({ code: 1, message }, { status: 401 });
    res.headers.set('X-Login-Required', '1');
    return res;
  }
  return null;
}

/** 访客要求 (登录后不可访问登录/注册页),对应 RedirectIfAuthenticated */
export async function requireGuest(ctx: AppContext): Promise<Response | null> {
  if (ctx.user) {
    return Response.json({ code: 1, message: 'already logged in' }, { status: 403 });
  }
  return null;
}

/** 封禁拦截 (除登出外),对应 RejectBannedUser */
export async function rejectBanned(ctx: AppContext): Promise<Response | null> {
  const { user, request } = ctx;
  if (user && user.permission === PERMISSION.BANNED && new URL(request.url).pathname !== '/auth/logout') {
    return Response.json({ code: -1, message: await ctx.trans('auth.check.banned') }, { status: 403 });
  }
  return null;
}

/** 角色要求,对应 CheckRole (permission >= 目标) */
export async function requireRole(ctx: AppContext, min: number): Promise<Response | null> {
  if (!ctx.user) {
    const res = Response.json({ code: 1, message: 'unauthorized' }, { status: 401 });
    res.headers.set('X-Login-Required', '1');
    return res;
  }
  if (ctx.user.permission < min) {
    return Response.json({ code: 1, message: await ctx.trans('auth.check.admin') }, { status: 403 });
  }
  return null;
}

/** 邮箱验证要求,对应 CheckUserVerified */
export async function requireVerified(ctx: AppContext): Promise<Response | null> {
  const user = ctx.user;
  const requireVerification = (await getOption(ctx.env, 'require_verification')) === true;
  if (requireVerification && user && !user.verified) {
    return Response.json({ code: 1, message: await ctx.trans('auth.check.verified') }, { status: 403 });
  }
  return null;
}

/** 邮箱绑定要求,对应 EnsureEmailFilled */
export async function requireEmailFilled(ctx: AppContext): Promise<Response | null> {
  const user = ctx.user;
  if (!user) return null;
  const path = new URL(ctx.request.url).pathname;
  if (user.email !== '' && path === '/auth/bind') {
    return Response.json({ code: 1, message: '' }, { status: 403 });
  }
  if (user.email === '' && path !== '/auth/bind') {
    return Response.json({ code: 1, message: 'email required' }, { status: 403 });
  }
  return null;
}
