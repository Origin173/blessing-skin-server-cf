/**
 * catch-all Route Handler 通用分发:
 *   - 装载 Cloudflare env (OpenNext)
 *   - boot 插件运行时
 *   - 装载会话 (loadRequestContext)
 *   - 交给 CompatRouter 按 method+path 匹配执行
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { loadRequestContext } from './context';
import { getRuntime } from '@/lib/plugins/manager';
import { CompatRouter, dispatchCompat } from './compat';

export async function handleCompat(
  router: CompatRouter,
  request: Request,
  segments: string[],
): Promise<Response> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    await getRuntime().boot(env as unknown as Env);
    const ctx = await loadRequestContext(env as unknown as Env, request);
    try {
      return await dispatchCompat(router, request, segments, ctx);
    } catch (error) {
      console.error('[compat] handler error:', error);
      console.error((error as Error)?.stack);
      return Response.json({ code: 1, message: 'Internal Server Error' }, { status: 500 });
    }
  } catch (error) {
    console.error('[compat] setup error:', error);
    console.error((error as Error)?.stack);
    return Response.json({ code: 1, message: 'Internal Server Error' }, { status: 500 });
  }
}

/** 生成全方法处理器 (GET/POST/PUT/DELETE/PATCH) */
export function makeHandlers(router: CompatRouter) {
  const h = async (request: Request, ctx: { params: Promise<{ path?: string[] }> }) => {
    try {
      const { path = [] } = await ctx.params;
      return await handleCompat(router, request, path);
    } catch (error) {
      console.error('[route] fatal:', error, (error as Error)?.stack);
      return Response.json({ code: 1, message: 'Internal Server Error' }, { status: 500 });
    }
  };
  return { GET: h, POST: h, PUT: h, DELETE: h, PATCH: h };
}

/** 生成仅非安全方法处理器 (GET 留给 RSC 页面) */
export function makeMutationHandlers(router: CompatRouter) {
  const h = async (request: Request, ctx: { params: Promise<{ path?: string[] }> }) => {
    try {
      const { path = [] } = await ctx.params;
      return await handleCompat(router, request, path);
    } catch (error) {
      console.error('[route] fatal:', error, (error as Error)?.stack);
      return Response.json({ code: 1, message: 'Internal Server Error' }, { status: 500 });
    }
  };
  return { POST: h, PUT: h, DELETE: h, PATCH: h };
}
