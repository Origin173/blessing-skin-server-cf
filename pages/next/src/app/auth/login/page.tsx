/**
 * 登录页 (对照 auth/base.twig + auth/rows/login/*.twig):
 *   login-box > login-logo (site_name → 首页) > card > login-card-body
 *     - session msg (alert-warning,原 session_pull('msg'))
 *     - login-box-msg (auth.login.message)
 *     - <LoginForm /> (原 <main> React 挂载点)
 *     - registration-link (mt-3, auth.register-link)
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getOption } from '@/lib/server/options';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { LoginForm } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  // 登录失败次数过多 → 显示验证码 (对应 session tooManyFails)
  // P0: 先占位,完整逻辑在 P1 auth 路由迁移时接通
  const tooManyFails = false;
  const recaptchaSitekey = String((await getOption(env, 'recaptcha_sitekey')) ?? '');

  return (
    <Shell ctx={ctx} site={site} variant="auth" path="auth/login">
      <div className="login-box">
        <div className="login-logo">
          <Link href="/">{site.siteName}</Link>
        </div>

        <div className="card">
          <div className="card-body login-card-body">
            <p className="login-box-msg">{await t('auth.login.message', {}, { locale })}</p>

            <LoginForm
              tooManyFails={tooManyFails}
              recaptchaSitekey={recaptchaSitekey}
              forgotLink="/auth/forgot"
            />

            <div className="mt-3">
              <Link href="/auth/register">{await t('auth.register-link', {}, { locale })}</Link>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
