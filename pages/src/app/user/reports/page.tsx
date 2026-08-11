/**
 * 我的举报页 (对照 user/report.twig): SSR 表格 (tid/原因/状态/时间)
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import type { ReportRow } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

const STATUS = ['正在处理', '处理完成', '已被拒绝'];

export default async function UserReportsPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user/reports');
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM reports WHERE reporter = ? ORDER BY report_at DESC LIMIT 10',
  )
    .bind(ctx.user.uid)
    .all<ReportRow>();
  const reports = results as ReportRow[];

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user/reports">
      <div className="card">
        <div className="card-body p-0">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>材质 ID</th>
                <th>举报原因</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center">
                    暂无举报记录
                  </td>
                </tr>
              )}
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    {report.tid}&nbsp;
                    <Link href={`/skinlib/show/${report.tid}`} target="_blank">
                      <i className="fas fa-share" />
                    </Link>
                  </td>
                  <td>{report.reason}</td>
                  <td>{STATUS[report.status] ?? '未知'}</td>
                  <td>{report.report_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
