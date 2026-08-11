import { handleCompat } from '@/lib/server/compat-route';
import { staticRoutes } from '@/lib/server/routes/static';

export const dynamic = 'force-dynamic';
async function h(request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  return handleCompat(staticRoutes, request, ['textures', hash]);
}
export const GET = h;

