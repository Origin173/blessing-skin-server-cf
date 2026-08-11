/**
 * 举报管理页 (对照 admin/reports.twig): <AdminReports />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { AdminReports } from '@/components/admin/AdminReports';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/reports');
  }

  const { results } = await env.DB.prepare(
    `SELECT r.id, r.tid, r.uploader, r.reporter, r.reason, r.status, r.report_at, u.nickname AS reporter_nickname
     FROM reports r JOIN users u ON u.uid = r.reporter ORDER BY r.report_at DESC LIMIT 100`,
  ).all<{
    id: number;
    tid: number;
    uploader: number;
    reporter: number;
    reason: string;
    status: number;
    report_at: string;
    reporter_nickname: string;
  }>();

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/reports">
      <AdminReports initial={results as never} />
    </Shell>
  );
}
