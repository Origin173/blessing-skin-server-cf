/**
 * 角色管理页 (对照 user/player.twig): <PlayersManager />
 */
import { redirect } from 'next/navigation';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { PlayersManager } from '@/components/user/PlayersManager';

export const dynamic = 'force-dynamic';

export default async function PlayerPage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user/player');
  }

  const { results: players } = await env.DB.prepare(
    'SELECT pid, name, tid_skin, tid_cape FROM players WHERE uid = ? ORDER BY pid',
  )
    .bind(ctx.user.uid)
    .all<{ pid: number; name: string; tid_skin: number; tid_cape: number }>();

  const { results: closet } = await env.DB.prepare(
    `SELECT c.texture_tid AS tid, c.item_name, t.type
     FROM user_closet c JOIN textures t ON t.tid = c.texture_tid
     WHERE c.user_uid = ?`,
  )
    .bind(ctx.user.uid)
    .all<{ tid: number; item_name: string | null; type: string }>();

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user/player">
      <PlayersManager
        initial={players as { pid: number; name: string; tid_skin: number; tid_cape: number }[]}
        closetItems={closet as { tid: number; item_name: string | null; type: string }[]}
      />
    </Shell>
  );
}
