/**
 * 用户管理页 (对照 admin/users.twig): <AdminUsers />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { AdminUsers } from '@/components/admin/AdminUsers';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/users');
  }

  const { results } = await env.DB.prepare(
    'SELECT uid, email, nickname, score, permission, verified, register_at FROM users ORDER BY uid LIMIT 100',
  ).all<{ uid: number; email: string; nickname: string; score: number; permission: number; verified: number; register_at: string }>();

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/users">
      <AdminUsers initial={results as never} currentUid={ctx.user.uid} />
    </Shell>
  );
}
