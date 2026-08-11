import { handleCompat } from '@/lib/server/compat-route';
import { staticRoutes } from '@/lib/server/routes/static';

export const dynamic = 'force-dynamic';

async function h(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  // staticRoutes 内部路径含 /csl 前缀
  return handleCompat(staticRoutes, request, ['csl', ...path]);
}
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
export const PATCH = h;
