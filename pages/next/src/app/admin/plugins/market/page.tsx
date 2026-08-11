/**
 * 插件市场页 (对照 admin/market.twig): <PluginsMarket />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { PluginsMarket } from '@/components/admin/PluginsMarket';

export const dynamic = 'force-dynamic';

export default async function AdminPluginsMarketPage() {
  const { ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/plugins/market');
  }

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/plugins/market">
      <PluginsMarket />
    </Shell>
  );
}
