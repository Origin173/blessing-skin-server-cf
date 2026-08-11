/**
 * 多语言管理页 (对照 admin/i18n.twig): <AdminTranslations />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { AdminTranslations } from '@/components/admin/AdminTranslations';

export const dynamic = 'force-dynamic';

export default async function AdminI18nPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/i18n');
  }

  const { results } = await env.DB.prepare(
    'SELECT id, group_name AS "group", "key", text FROM language_lines ORDER BY group_name, "key" LIMIT 200',
  ).all<{ id: number; group: string; key: string; text: string }>();

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/i18n">
      <AdminTranslations initial={results as never} />
    </Shell>
  );
}
