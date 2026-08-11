/**
 * 根级动态路由 (多段): {player}.json (CustomSkinAPI) + 插件路由统一分发。
 * 静态页面优先,未命中页面的路径落到此处。
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

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string; rest: string[] }> },
) {
  const { path, rest } = await ctx.params;
  return dispatch(request, [path, ...rest]);
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
