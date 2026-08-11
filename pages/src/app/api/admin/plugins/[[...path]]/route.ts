import { handleCompat } from '@/lib/server/compat-route';
import { pluginRoutes } from '@/lib/server/routes/plugins';

export const dynamic = 'force-dynamic';

async function h(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  // pluginRoutes 内部路径含 /plugins 前缀
  return handleCompat(pluginRoutes, request, ['plugins', ...path]);
}
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
export const PATCH = h;
