/**
 * 邮箱验证页 (对照 auth/base.twig + verify.twig):
 *   login-box-msg (auth.bind.message) + <VerifyForm />
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { VerifyForm } from '@/components/auth/VerifyForm';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const { ctx, site } = await getPageData();
  const locale = ctx.locale;

  return (
    <Shell ctx={ctx} site={site} variant="auth" path={`auth/verify/${uid}`}>
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">{await t('auth.bind.message', {}, { locale })}</p>

            <VerifyForm uid={uid} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
