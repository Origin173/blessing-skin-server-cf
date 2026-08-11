/**
 * 重置密码页 (对照 auth/base.twig + reset.twig):
 *   login-box-msg (auth.reset.message, 含用户名) + <ResetForm />
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { ResetForm } from '@/components/auth/ResetForm';
import type { UserRow } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

export default async function ResetPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  // 查询用户 (显示重置对象;签名校验由 POST 端点执行)
  const user = await env.DB.prepare('SELECT nickname FROM users WHERE uid = ? LIMIT 1')
    .bind(Number(uid))
    .first<Pick<UserRow, 'nickname'>>();
  const username = user?.nickname ?? '';

  return (
    <Shell ctx={ctx} site={site} variant="auth" path={`auth/reset/${uid}`}>
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">
              {await t('auth.reset.message', { username }, { locale })}
            </p>

            <ResetForm uid={uid} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
