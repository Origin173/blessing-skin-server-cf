/**
 * 根级动态路由: {player}.json (CustomSkinAPI) + 插件路由统一分发。
 * 匹配顺序: 静态页面 (page.tsx) 优先 → 本处先查玩家 JSON,再查插件路由注册表。
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getRuntime, createPluginRequest } from '@/lib/plugins/manager';
import { loadRequestContext } from '@/lib/server/context';
import { jsonError } from '@/lib/server/response';
import { servePlayerJson } from '@/lib/server/routes/static';
import type { PlayerRow } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

async function dispatch(request: Request, segments: string[]) {
  const { env } = await getCloudflareContext({ async: true });
  const pathname = `/${segments.join('/')}`;

  // {player}.json (CustomSkinAPI) — 显式正则匹配,避免吞掉其他单段路径
  if (request.method === 'GET') {
    const match = pathname.match(/^\/([^/]+)\.json$/);
    const cslMatch = pathname.match(/^\/csl\/([^/]+)\.json$/);
    const playerName = match?.[1] ?? cslMatch?.[1];
    if (playerName) {
      const player = await (env as unknown as Env).DB.prepare('SELECT * FROM players WHERE name = ? LIMIT 1')
        .bind(playerName)
        .first<PlayerRow>();
      if (player) {
        return servePlayerJson(env as unknown as Env, player);
      }
    }
  }

  await getRuntime().boot(env as unknown as Env);

  const matched = getRuntime().registry.match(request.method, pathname);
  if (!matched) {
    return jsonError('Not Found');
  }

  const appCtx = await loadRequestContext(env as unknown as Env, request);
  const pluginReq = createPluginRequest(request, matched.params, appCtx.session, appCtx.user);
  return matched.handler(pluginReq);
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  return dispatch(request, [path]);
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
