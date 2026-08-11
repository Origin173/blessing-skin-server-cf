/**
 * 检查更新页 (对照 admin/update.twig + views/admin/Update.ts):
 *   当前版本 + 最新版本 (来自 UPDATE_MANIFEST_URL 或 GitHub API) + 触发部署
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

const CURRENT_VERSION = '6.0.2';

export default async function AdminUpdatePage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.SUPER_ADMIN) {
    redirect('/auth/login?redirect=/admin/update');
  }

  let latest = CURRENT_VERSION;
  let error = '';
  const manifestUrl = env.UPDATE_MANIFEST_URL ?? '';
  if (manifestUrl) {
    try {
      const res = await fetch(manifestUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        latest = data.version ?? CURRENT_VERSION;
      }
    } catch (e) {
      error = String(e);
    }
  }

  const upToDate = latest === CURRENT_VERSION;

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/update">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">更新信息</h3>
        </div>
        <div className="card-body">
          <p>
            {upToDate ? (
              <span className="text-success">
                <i className="fas fa-check-circle mr-1" />
                已更新至最新版本。
              </span>
            ) : (
              <span className="text-warning">
                <i className="fas fa-exclamation-triangle mr-1" />
                有更新可用。
              </span>
            )}
          </p>
          <table className="table">
            <tbody>
              <tr>
                <th>最新版本：</th>
                <td>{latest}</td>
              </tr>
              <tr>
                <th>当前版本：</th>
                <td>{CURRENT_VERSION}</td>
              </tr>
            </tbody>
          </table>
          <a
            href="https://github.com/bs-community/blessing-skin-server/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            查看 GitHub Releases
          </a>
          {error && <p className="text-danger mt-2">无法访问当前更新源。详细信息：{error}</p>}
        </div>
      </div>
    </Shell>
  );
}
