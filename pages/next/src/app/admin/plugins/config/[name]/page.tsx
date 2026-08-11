/**
 * 插件配置页 (SDK §6: config-schema.json 自动渲染表单):
 *   读取插件 config-schema.json → 渲染字段 → 保存到 plugin_configs
 */
import { redirect, notFound } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { PluginConfigForm } from '@/components/admin/PluginConfigForm';

export const dynamic = 'force-dynamic';

interface ConfigSchema {
  fields?: {
    key: string;
    label: string;
    type: 'boolean' | 'string' | 'number' | 'select' | 'textarea' | 'secret';
    default?: unknown;
    hint?: string;
    options?: { value: string; label: string }[];
  }[];
}

export default async function AdminPluginConfigPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/plugins/manage');
  }

  const row = await env.DB.prepare('SELECT manifest_json FROM plugin_manifests WHERE name = ? LIMIT 1')
    .bind(name)
    .first<{ manifest_json: string }>();
  if (!row) notFound();

  let schema: ConfigSchema = { fields: [] };
  try {
    const manifest = JSON.parse(row.manifest_json) as Record<string, unknown>;
    if (typeof manifest['config-schema'] === 'string') {
      schema = JSON.parse(manifest['config-schema'] as string) as ConfigSchema;
    }
  } catch {
    schema = { fields: [] };
  }

  const configRow = await env.DB.prepare('SELECT config_json FROM plugin_configs WHERE plugin_name = ?')
    .bind(name)
    .first<{ config_json: string }>();
  let values: Record<string, unknown> = {};
  try {
    values = configRow ? (JSON.parse(configRow.config_json) as Record<string, unknown>) : {};
  } catch {}

  return (
    <Shell ctx={ctx} site={site} variant="admin" path={`admin/plugins/config/${name}`}>
      <PluginConfigForm pluginName={name} schema={schema} values={values} />
    </Shell>
  );
}
