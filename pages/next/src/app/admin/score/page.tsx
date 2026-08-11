/**
 * 站点选项页 (score): <AdminOptions page="score" />
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
    redirect('/auth/login?redirect=/admin/score');
  }

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/score">
      <AdminOptions page="score" groups={OPTION_PAGES['score'] ?? []} />
    </Shell>
  );
}
