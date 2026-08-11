/**
 * 运行状态页 (对照 admin/status.twig + widgets/status/*):
 *   系统信息表 (CF 环境适配) + 已启用插件表
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { getRuntime } from '@/lib/plugins/manager';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminStatusPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/status');
  }

  await getRuntime().boot(env);

  const detail: Record<string, Record<string, string>> = {
    bs: {
      version: '6.0.2 (Cloudflare Pages)',
      env: 'workerd',
      commit: 'nextjs',
    },
    server: {
      name: 'Cloudflare Workers',
      php: '—',
      web: 'Workers',
      os: 'workerd',
    },
    db: {
      type: 'D1 (SQLite)',
    },
  };

  const plugins = getRuntime().loaded;

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/status">
      <div className="row">
        <div className="col-md-6">
          <div className="card card-info">
            <div className="card-header">
              <h3 className="card-title">信息</h3>
            </div>
            <div className="card-body">
              <table className="table table-bordered table-striped">
                <tbody>
                  {Object.entries(detail).map(([category, info]) => (
                    <>
                      <tr key={category}>
                        <th colSpan={2}>
                          {category === 'bs' ? 'Blessing Skin' : category === 'server' ? '服务器' : '数据库'}
                        </th>
                      </tr>
                      {Object.entries(info).map(([key, value]) => (
                        <tr key={key}>
                          <td>
                            {category === 'bs'
                              ? key === 'version'
                                ? '版本'
                                : key === 'env'
                                  ? '应用环境'
                                  : key
                              : key === 'name'
                                ? '名称'
                                : key === 'type'
                                  ? '服务器类型'
                                  : key}
                          </td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card card-green">
            <div className="card-header">
              <h3 className="card-title">已开启的插件 ({plugins.length})</h3>
            </div>
            <div className="card-body">
              <table className="table table-bordered table-striped">
                <tbody>
                  {plugins.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center">
                        暂无
                      </td>
                    </tr>
                  )}
                  {plugins.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>{p.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
