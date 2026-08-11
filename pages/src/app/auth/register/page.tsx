/**
 * 注册页 (对照 auth/base.twig + auth/rows/register/*.twig):
 *   login-box > login-logo > card > login-card-body
 *     - login-box-msg (auth.register.message, 含 sitename)
 *     - <RegistrationForm /> (原 <main> React 挂载点)
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { boolOption } from '@/lib/server/options';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { RegistrationForm } from '@/components/auth/RegistrationForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;
  const requirePlayer = (await boolOption(env, 'register_with_player_name')) === true;

  return (
    <Shell ctx={ctx} site={site} variant="auth" path="auth/register">
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">
              {await t('auth.register.message', { sitename: site.siteName }, { locale })}
            </p>

            <RegistrationForm requirePlayer={requirePlayer} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
