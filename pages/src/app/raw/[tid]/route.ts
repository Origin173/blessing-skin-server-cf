import { handleCompat } from '@/lib/server/compat-route';
import { staticRoutes } from '@/lib/server/routes/static';

export const dynamic = 'force-dynamic';
async function h(request: Request, ctx: { params: Promise<{ tid: string }> }) {
  const { tid } = await ctx.params;
  return handleCompat(staticRoutes, request, ['raw', tid]);
}
export const GET = h;

