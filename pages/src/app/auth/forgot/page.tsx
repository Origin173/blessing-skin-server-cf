/**
 * 忘记密码页 (对照 auth/base.twig + forgot.twig):
 *   login-box-msg (auth.forgot.message) + <ForgotForm />
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { ForgotForm } from '@/components/auth/ForgotForm';

export const dynamic = 'force-dynamic';

export default async function ForgotPage() {
  const { ctx, site } = await getPageData();
  const locale = ctx.locale;

  return (
    <Shell ctx={ctx} site={site} variant="auth" path="auth/forgot">
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">{await t('auth.forgot.message', {}, { locale })}</p>

            <ForgotForm requireCaptcha={false} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
