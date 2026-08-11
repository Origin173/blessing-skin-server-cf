/**
 * 插件说明页 (对照 admin/plugin/readme.twig): README 内容
 */
import { redirect, notFound } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminPluginReadmePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/plugins/manage');
  }

  const row = await env.DB.prepare('SELECT readme FROM plugin_manifests WHERE name = ? LIMIT 1')
    .bind(name)
    .first<{ readme: string | null }>();
  if (!row) notFound();

  const readme = row.readme ?? '（无说明）';

  return (
    <Shell ctx={ctx} site={site} variant="admin" path={`admin/plugins/readme/${name}`}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{name} - 说明</h3>
        </div>
        <div className="card-body">
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{readme}</pre>
        </div>
      </div>
    </Shell>
  );
}
