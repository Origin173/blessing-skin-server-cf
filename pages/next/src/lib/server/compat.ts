/**
 * Hono 兼容适配层: 让 pages/functions/routes/*.ts 的既有实现几乎原样迁移到 Next.js。
 *
 * 将 Hono 的 Context 形态映射到本项目 AppContext:
 *   - c.get('session'|'user'|'trans'|'locale'|'ip'|'sessionId') → ctx 对应字段
 *   - c.env → ctx.env
 *   - c.req.raw/path/method/header/headers/param/query/json/formData/url → request + params
 *   - c.json(obj, status?) → Response.json
 *   - 中间件链 (mw, handler) 语义与 Hono 一致
 */

import type { AppContext } from './context';
import { jsonError } from './response';

export type CompatHandler = (c: CompatContext) => Response | Promise<Response>;
export type CompatMiddleware = (
  c: CompatContext,
  next: () => Promise<Response | void>,
) => Response | Promise<Response | void> | void;

/** 兼容 c.req (Hono Request 形态) */
export class CompatRequest {
  raw: Request;
  params: Record<string, string>;

  constructor(raw: Request, params: Record<string, string>) {
    this.raw = raw;
    this.params = params;
  }

  get url(): string {
    return this.raw.url;
  }

  get path(): string {
    return new URL(this.raw.url).pathname;
  }

  get method(): string {
    return this.raw.method;
  }

  get headers(): Headers {
    return this.raw.headers;
  }

  header(name: string): string | undefined {
    return this.raw.headers.get(name) ?? undefined;
  }

  param(name: string): string | undefined {
    return this.params[name];
  }

  query(name: string): string | undefined {
    return new URL(this.raw.url).searchParams.get(name) ?? undefined;
  }

  json(): Promise<unknown> {
    return this.raw.json();
  }

  formData(): Promise<import('./multipart').CompatFormData> {
    // OpenNext 的 Request.formData() 在 workerd 上崩溃 (File.path),手动解析
    return import('./multipart').then(async ({ parseMultipart }) => {
      const fd = await parseMultipart(this.raw);
      console.log('[compat-formData]', JSON.stringify([...fd.entries()].map(([k, v]) => [k, typeof v])));
      return fd;
    });
  }

  text(): Promise<string> {
    return this.raw.text();
  }
}

/** 兼容 Hono Context */
export class CompatContext {
  env: Env;
  req: CompatRequest;
  /** 原始 AppContext (守卫函数使用) */
  ctx: AppContext;
  private vars: Map<string, unknown>;

  constructor(ctx: AppContext, params: Record<string, string> = {}) {
    this.env = ctx.env;
    this.ctx = ctx;
    this.req = new CompatRequest(ctx.request, params);
    this.vars = new Map<string, unknown>([
      ['session', ctx.session],
      ['sessionId', ctx.sessionId],
      ['user', ctx.user],
      ['locale', ctx.locale],
      ['trans', ctx.trans],
      ['ip', ctx.ip],
    ]);
  }

  get(key: 'trans'): (key: string, params?: Record<string, string | number>) => Promise<string>;
  get(key: 'session'): import('./session').SessionData | null;
  get(key: 'sessionId'): string | null;
  get(key: 'user'): import('./types').UserRow | null;
  get(key: 'locale'): string;
  get(key: 'ip'): string;
  get<T = unknown>(key: string): T;
  get(key: string): unknown {
    return this.vars.get(key);
  }

  set(key: string, value: unknown): void {
    this.vars.set(key, value);
  }

  /** 对应 Hono c.json(object, status?) */
  json(object: unknown, status?: number): Response {
    return Response.json(object, status ? { status } : undefined);
  }

  text(text: string, status?: number): Response {
    return new Response(text, {
      status: status ?? 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  /** 对应 Hono c.html */
  html(html: string, status?: number): Response {
    return new Response(html, {
      status: status ?? 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  /** 对应 Hono c.body (原始响应体) */
  body(data: BodyInit | null, status?: number, headers?: HeadersInit): Response {
    return new Response(data, { status: status ?? 200, headers });
  }
}

interface RouteEntry {
  method: string;
  segments: string[];
  mws: CompatMiddleware[];
  handler: CompatHandler;
}

function normalizePath(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

/** 路由注册表 (路径语法: :param 与尾部 * 通配) */
export class CompatRouter {
  private entries: RouteEntry[] = [];
  private globalMws: CompatMiddleware[] = [];

  /** 全局中间件 (对应 app.use('*', ...));路径参数当前忽略,全部路径生效 */
  use(path: string, ...mws: CompatMiddleware[]) {
    this.globalMws.push(...mws);
  }

  get(path: string, handler: CompatHandler): void;
  get(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  get(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('GET', path, handlers);
  }
  post(path: string, handler: CompatHandler): void;
  post(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  post(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('POST', path, handlers);
  }
  put(path: string, handler: CompatHandler): void;
  put(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  put(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('PUT', path, handlers);
  }
  delete(path: string, handler: CompatHandler): void;
  delete(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  delete(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('DELETE', path, handlers);
  }
  patch(path: string, handler: CompatHandler): void;
  patch(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  patch(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('PATCH', path, handlers);
  }
  any(path: string, handler: CompatHandler): void;
  any(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  any(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('ANY', path, handlers);
  }
  all(path: string, handler: CompatHandler): void;
  all(path: string, ...handlers: [CompatMiddleware, ...CompatMiddleware[], CompatHandler]): void;
  all(path: string, ...handlers: (CompatMiddleware | CompatHandler)[]) {
    this.register('ANY', path, handlers);
  }

  private register(method: string, path: string, handlers: (CompatMiddleware | CompatHandler)[]) {
    const mws = handlers.slice(0, -1) as CompatMiddleware[];
    const handler = handlers[handlers.length - 1] as CompatHandler;
    this.entries.push({ method, segments: normalizePath(path), mws, handler });
  }

  /** 匹配并执行;无匹配返回 null */
  async run(ctx: AppContext, request: Request, pathname: string): Promise<Response | null> {
    const matched = this.match(request.method, pathname);
    if (!matched) return null;

    const c = new CompatContext(ctx, matched.params);
    const mws = [...this.globalMws, ...matched.mws];
    return runChain(mws, matched.handler, c);
  }

  /** 匹配 (method, pathname),返回中间件链与路径参数 */
  match(method: string, pathname: string) {
    const target = normalizePath(pathname);
    const upper = method.toUpperCase();

    for (const entry of this.entries) {
      if (entry.method !== 'ANY' && entry.method !== upper) continue;

      // 根通配:匹配任意路径
      if (entry.segments.length === 1 && entry.segments[0] === '*') {
        return { mws: entry.mws, handler: entry.handler, params: {} };
      }

      // 尾部通配 (如 /user/*) 匹配前缀
      const lastIsWildcard = entry.segments[entry.segments.length - 1] === '*';
      const minSegments = lastIsWildcard ? entry.segments.length - 1 : entry.segments.length;
      if (
        target.length < minSegments ||
        (!lastIsWildcard && target.length !== entry.segments.length)
      ) {
        continue;
      }

      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < minSegments; i++) {
        const seg = entry.segments[i];
        if (seg === '*') continue;
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = target[i];
        } else if (seg !== target[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { mws: entry.mws, handler: entry.handler, params };
    }
    return null;
  }
}

/** 执行中间件链 (Hono next 语义) */
async function runChain(
  mws: CompatMiddleware[],
  handler: CompatHandler,
  c: CompatContext,
): Promise<Response> {
  let i = 0;
  const next = async (): Promise<Response | void> => {
    const mw = mws[i++];
    if (mw) {
      const r = await mw(c, next as never);
      if (r instanceof Response) return r;
      // 中间件未返回响应 → 继续链
      return undefined;
    }
    return undefined;
  };

  const early = await next();
  if (early instanceof Response) return early;
  return handler(c);
}

/**
 * 生成 catch-all Route Handler (供 app/xxx/[[...path]]/route.ts 使用)。
 * 会话装载 (对应 Hono sessionMiddleware) 已由 loadRequestContext 完成。
 */
export async function dispatchCompat(
  router: CompatRouter,
  request: Request,
  segments: string[],
  ctx: AppContext,
): Promise<Response> {
  const pathname = `/${segments.join('/')}`;
  const res = await router.run(ctx, request, pathname);
  if (res) return res;
  return jsonError('Not Found');
}
