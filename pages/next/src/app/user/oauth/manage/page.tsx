/**
 * OAuth2 应用管理页 (对照 user/oauth.twig): <OAuthManage />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { OAuthManage } from '@/components/user/OAuthManage';

export const dynamic = 'force-dynamic';

interface ClientRow {
  id: number;
  name: string;
  redirect: string;
  secret?: string;
}

export default async function OAuthManagePage() {
  const { env, ctx, site } = await getPageData();

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user/oauth/manage');
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, redirect, secret FROM oauth_clients WHERE user_id = ? AND personal_access_client = 0`,
  )
    .bind(ctx.user.uid)
    .all<ClientRow>();
  const clients = (results as ClientRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    redirect: c.redirect,
    secret: c.secret ?? '',
  }));

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user/oauth/manage">
      <OAuthManage initial={clients} />
    </Shell>
  );
}
