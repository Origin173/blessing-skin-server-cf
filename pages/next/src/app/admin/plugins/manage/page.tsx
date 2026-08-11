/**
 * 插件管理页 (对照 admin/plugins.twig + 原版 PluginsManagement):
 *   插件列表 (名称/版本/作者/描述/依赖/状态) + 启用/禁用/配置/删除/上传
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { PluginsManager } from '@/components/admin/PluginsManager';

export const dynamic = 'force-dynamic';

export default async function AdminPluginsPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/plugins/manage');
  }

  const { results } = await env.DB.prepare(
    'SELECT name, manifest_json, enabled, source, installed_at FROM plugin_manifests ORDER BY name',
  ).all<{ name: string; manifest_json: string; enabled: number; source: string; installed_at: string }>();

  const plugins = (results as { name: string; manifest_json: string; enabled: number; source: string; installed_at: string }[])
    .map((row) => {
      try {
        return { name: row.name, manifest: JSON.parse(row.manifest_json) as Record<string, unknown>, enabled: row.enabled === 1, source: row.source };
      } catch {
        return null;
      }
    })
    .filter((p): p is { name: string; manifest: Record<string, unknown>; enabled: boolean; source: string } => p !== null);

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/plugins/manage">
      <PluginsManager
        initial={plugins}
        isSuperAdmin={ctx.user.permission >= PERMISSION.SUPER_ADMIN}
      />
    </Shell>
  );
}
