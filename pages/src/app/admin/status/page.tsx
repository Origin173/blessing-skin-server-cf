/**
 * 运行状态页 (对照 admin/status.twig + widgets/status/*):
 *   系统信息表 (CF 环境适配) + 已启用插件表
 *   文案全部走 t('admin.status.*') 动态 key (与原版 trans("admin.status.#{category}.#{key}") 一致)
 */
import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { t } from '@/lib/server/i18n';
import { getRuntime } from '@/lib/plugins/manager';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminStatusPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/status');
  }

  const locale = ctx.locale;

  // detail 结构与原版 adminStatus() 的 categories 一致 (bs/server/db)
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

  // 预计算动态 key 翻译 (key 集合固定, RSC 中不可在 JSX 内 await)
  const labels: Record<string, string> = {};
  const [labelInfo, labelPlugins] = await Promise.all([
    t('admin.status.info', {}, { locale }),
    t('admin.status.plugins', { amount: 0 }, { locale }),
  ]);
  for (const [cat, info] of Object.entries(detail)) {
    labels[`${cat}.name`] = await t(`admin.status.${cat}.name`, {}, { locale });
    for (const key of Object.keys(info)) {
      labels[`${cat}.${key}`] = await t(`admin.status.${cat}.${key}`, {}, { locale });
    }
  }

  const plugins = getRuntime().loaded;

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/status">
      <div className="row">
        <div className="col-md-6">
          <div className="card card-info">
            <div className="card-header">
              <h3 className="card-title">{labelInfo}</h3>
            </div>
            <div className="card-body">
              <table className="table table-bordered table-striped">
                <tbody>
                  {Object.entries(detail).map(([category, info]) => (
                    <Fragment key={category}>
                      <tr>
                        <th colSpan={2}>{labels[`${category}.name`]}</th>
                      </tr>
                      {Object.entries(info).map(([key, value]) => (
                        <tr key={key}>
                          <td>{labels[`${category}.${key}`]}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card card-green">
            <div className="card-header">
              <h3 className="card-title">{labelPlugins.replace(':amount', String(plugins.length))}</h3>
            </div>
            <div className="card-body">
              <table className="table table-bordered table-striped">
                <tbody>
                  {plugins.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center">
                        —
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
