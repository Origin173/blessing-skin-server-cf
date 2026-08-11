/**
 * 我的衣柜页 (对照 user/closet.twig): <ClosetManager />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { ClosetManager } from '@/components/user/ClosetManager';

export const dynamic = 'force-dynamic';

export default async function ClosetPage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user/closet');
  }

  const { results: items } = await env.DB.prepare(
    `SELECT c.texture_tid AS tid, c.item_name, t.type
     FROM user_closet c JOIN textures t ON t.tid = c.texture_tid
     WHERE c.user_uid = ?`,
  )
    .bind(ctx.user.uid)
    .all<{ tid: number; item_name: string | null; type: string }>();

  const { results: players } = await env.DB.prepare(
    'SELECT pid, name FROM players WHERE uid = ?',
  )
    .bind(ctx.user.uid)
    .all<{ pid: number; name: string }>();

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user/closet">
      <ClosetManager
        initial={items as { tid: number; item_name: string | null; type: string }[]}
        players={players as { pid: number; name: string }[]}
      />
    </Shell>
  );
}
