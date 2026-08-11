/**
 * 邮箱绑定页 (对照 auth/base.twig + bind.twig):
 *   login-box-msg (auth.bind.message) + <BindForm />
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { BindForm } from '@/components/auth/BindForm';

export const dynamic = 'force-dynamic';

export default async function BindPage() {
  const { ctx, site } = await getPageData();
  const locale = ctx.locale;

  return (
    <Shell ctx={ctx} site={site} variant="auth" path="auth/bind">
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">{await t('auth.bind.message', {}, { locale })}</p>

            <BindForm />
          </div>
        </div>
      </div>
    </Shell>
  );
}
