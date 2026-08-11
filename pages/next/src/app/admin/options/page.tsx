/**
 * 站点选项页 (options): <AdminOptions page="options" />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { OPTION_PAGES } from '@/lib/server/routes/admin';
import { Shell } from '@/components/layout/Shell';
import { AdminOptions } from '@/components/admin/AdminOptions';

export const dynamic = 'force-dynamic';

export default async function AdminOptionsPage() {
  const { ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/options');
  }

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/options">
      <AdminOptions page="options" groups={OPTION_PAGES['options'] ?? []} />
    </Shell>
  );
}
