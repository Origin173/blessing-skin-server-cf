import { handleCompat } from '@/lib/server/compat-route';
import { updateRoutes } from '@/lib/server/routes/update';

export const dynamic = 'force-dynamic';

async function h(request: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  // updateRoutes 内部路径相对 /admin/update (如 /check)
  return handleCompat(updateRoutes, request, [path]);
}
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
export const PATCH = h;
