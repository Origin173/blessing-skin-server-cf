/**
 * 角色管理 (管理后台, 对照 admin/players.twig):
 *   表格 (PID/名称/拥有者/皮肤/披风/修改时间) + 改名/换主人/换材质/删除
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { AdminPlayers } from '@/components/admin/AdminPlayers';

export const dynamic = 'force-dynamic';

export default async function AdminPlayersPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin/players');
  }

  const { results } = await env.DB.prepare(
    `SELECT p.pid, p.name, p.uid, p.tid_skin, p.tid_cape, p.last_modified, u.nickname
     FROM players p JOIN users u ON u.uid = p.uid ORDER BY p.pid LIMIT 100`,
  ).all<{
    pid: number;
    name: string;
    uid: number;
    tid_skin: number;
    tid_cape: number;
    last_modified: string;
    nickname: string;
  }>();

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin/players">
      <AdminPlayers initial={results as never} />
    </Shell>
  );
}
