/**
 * 首页 (对照 home.twig + 现有 SPA 版 Home.tsx):
 *   - hp-wrapper 全屏背景 (fixed_bg → #fixed-bg 固定层)
 *   - navbar fixed-top (navbar-{navbar_color} navbar-{color_mode} + transparent)
 *     [皮肤库] [语言切换] [登录/用户菜单]
 *   - splash: 站点名 + 描述 + 主按钮 (已登录 → 用户中心 / 未登录 → 注册)
 *   - #intro: 三大特性 (多角色/分享/永久免费, index.features.*)
 *   - #footer-wrap: 简介 (index.introduction) + 开始使用
 *   - #copyright: 版权 (with-intro / without-intro)
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { renderCopyright } from '@/lib/server/site';
import { Shell } from '@/components/layout/Shell';
import { LanguagesDropdown } from '@/components/layout/LanguagesDropdown';
import { HomeTransparentNav } from '@/components/home/HomeTransparentNav';

const FEATURES = ['first', 'second', 'third'] as const;

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { ctx, site } = await getPageData();
  const user = ctx.user;
  const locale = ctx.locale;
  const copyrightHtml = await renderCopyright(ctx.env, ctx, site);

  // 预计算翻译 (JSX 中不可 await)
  const [
    labelSkinlib,
    labelLogin,
    labelRegister,
    labelUserCenter,
    labelFeaturesTitle,
    featureIcons,
    featureNames,
    featureDescs,
    labelIntroduction,
    labelStart,
  ] = await Promise.all([
    t('general.skinlib', {}, { locale }),
    t('general.login', {}, { locale }),
    t('general.register', {}, { locale }),
    t('general.user-center', {}, { locale }),
    t('index.features.title', {}, { locale }),
    Promise.all(FEATURES.map((f) => t(`index.features.${f}.icon`, {}, { locale }))),
    Promise.all(FEATURES.map((f) => t(`index.features.${f}.name`, {}, { locale }))),
    Promise.all(FEATURES.map((f) => t(`index.features.${f}.desc`, {}, { locale }))),
    t('index.introduction', { sitename: site.siteName }, { locale }),
    t('index.start', {}, { locale }),
  ]);

  const navbarClasses = [
    'navbar navbar-expand fixed-top',
    `navbar-${site.navbarColor}`,
    `navbar-${site.colorMode}`,
    'ml-0',
    site.transparentNavbar ? 'transparent' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Shell ctx={ctx} site={site} variant="home" path="">
      <HomeTransparentNav enabled={site.transparentNavbar} />

      <div
        className="hp-wrapper"
        style={site.fixedBg ? undefined : { backgroundImage: `url('${site.homePicUrl}')` }}
      >
        {site.fixedBg && (
          <div id="fixed-bg" style={{ backgroundImage: `url('${site.homePicUrl}')` }} />
        )}

        <nav className={navbarClasses}>
          <div className="container">
            <div className="navbar-header">
              <Link href="/" className="navbar-brand">
                {site.siteName}
              </Link>
            </div>

            <div className="navbar-custom-menu">
              <ul className="nav navbar-nav">
                <li className="nav-item">
                  <Link href="/skinlib" className="nav-link">
                    {labelSkinlib}
                  </Link>
                </li>

                <LanguagesDropdown current={''} langs={[]} />

                {user ? (
                  <li className="nav-item dropdown user-menu">
                    <a href="/user" className="nav-link d-flex align-items-center">
                      <img
                        src={`/avatar/user/${user.uid}?size=36&png`}
                        className="bs-avatar mr-2"
                        alt="User Image"
                      />
                      <span className="d-none d-md-inline d-sm-block" data-mark="nickname">
                        {user.nickname || user.email}
                      </span>
                    </a>
                  </li>
                ) : (
                  <li className="nav-item">
                    <Link href="/auth/login" className="nav-link">
                      <i className="icon fas fa-sign-in-alt" />
                      {labelLogin}
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </nav>

        <div className="container">
          <div className="splash">
            <h1 className="splash-head">{site.siteName}</h1>
            <p className="splash-subhead">{site.siteDescription}</p>
            <p>
              {user ? (
                <Link href="/user" className="main-button">
                  {labelUserCenter}
                </Link>
              ) : (
                <Link href="/auth/register" className="main-button">
                  {labelRegister}
                </Link>
              )}
            </p>
          </div>
        </div>

        {site.hideIntro && (
          <div id="copyright" className="without-intro">
            <div className="container">
              <div dangerouslySetInnerHTML={{ __html: copyrightHtml }} />
            </div>
          </div>
        )}
      </div>

      {!site.hideIntro && (
        <>
          <div id="intro">
            <div className="container">
              <div className="text-center">
                <h1>{labelFeaturesTitle}</h1>
                <br />
                <br />
                <div className="container-lg">
                  <div className="row">
                    {FEATURES.map((item, i) => (
                      <div className="col-lg" key={item}>
                        <i className={`fas ${featureIcons[i]} mb-3`} aria-hidden="true" />
                        <h3>{featureNames[i]}</h3>
                        <p dangerouslySetInnerHTML={{ __html: featureDescs[i] }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <br />
            </div>
          </div>

          <div id="footer-wrap">
            <div className="container">
              <div className="row">
                <div className="col-lg-6 mb-2">{labelIntroduction}</div>
                <div className="col-lg-4" />
                <div className="col-lg-2 d-flex justify-content-center align-items-center">
                  <Link href="/auth/register" className="main-button">
                    {labelStart}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div id="copyright" className="with-intro">
            <div className="container">
              <div dangerouslySetInnerHTML={{ __html: copyrightHtml }} />
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
