import { handleCompat } from '@/lib/server/compat-route';
import { skinlibRoutes } from '@/lib/server/routes/skinlib';

export const dynamic = 'force-dynamic';

async function h(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  // skinlibRoutes 内部路径含 /skinlib 前缀
  return handleCompat(skinlibRoutes, request, ['skinlib', ...path]);
}
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
export const PATCH = h;
