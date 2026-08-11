/**
 * 顶栏 navbar (对照 shared/header.twig)。
 * home variant 的 navbar 由首页组件自行渲染 (对照 home.twig)。
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import type { AppContext } from '@/lib/server/context';
import { LanguagesDropdown } from './LanguagesDropdown';
import { UserMenu } from './UserMenu';
import { DarkModeButton } from './DarkModeButton';
import { NotificationsContainer } from './NotificationsContainer';

interface HeaderProps {
  ctx: AppContext;
  siteName: string;
  navbarColor: string;
  colorMode: string;
  darkMode: boolean;
  variant: 'explore' | 'user' | 'admin';
  locales: { id: string; name: string }[];
  /** 用户菜单项 (对照 UserMenuComposer) */
  userMenu: { label: string; link?: string; divider?: boolean }[];
}

export async function Header({
  ctx,
  siteName,
  navbarColor,
  colorMode,
  darkMode,
  variant,
  locales,
  userMenu,
}: HeaderProps) {
  const user = ctx.user;
  const isAdmin = user ? user.permission >= 1 : false;
  const isTopNav = variant === 'explore';

  // 预计算翻译 (JSX 中不可 await)
  const [
    labelSkinlib,
    labelMyCloset,
    labelUploadNewSkin,
    labelAnonymous,
    labelLogin,
    labelLogout,
  ] = await Promise.all([
    t('general.skinlib', {}, { locale: ctx.locale }),
    t('general.my-closet', {}, { locale: ctx.locale }),
    t('skinlib.general.upload-new-skin', {}, { locale: ctx.locale }),
    t('general.anonymous', {}, { locale: ctx.locale }),
    t('general.login', {}, { locale: ctx.locale }),
    t('general.logout', {}, { locale: ctx.locale }),
  ]);

  return (
    <nav
      className={`main-header navbar navbar-expand navbar-${navbarColor} navbar-${colorMode}${
        isTopNav ? ' ml-0' : ''
      }`}
    >
      <ul className="navbar-nav">
        {variant !== 'explore' && (
          <li className="nav-item">
            <a className="nav-link" data-widget="pushmenu" href="#" role="button">
              <i className="fas fa-bars" />
            </a>
          </li>
        )}
        {isTopNav && (
          <li className="nav-item d-none d-sm-inline-block">
            <Link href="/" className="nav-link">
              {siteName}
            </Link>
          </li>
        )}
        {isTopNav && (
          <>
            <li className="nav-item active">
              <Link href="/skinlib" className="nav-link">
                {labelSkinlib}
              </Link>
            </li>
            {user && (
              <li className="nav-item">
                <Link href="/user/closet" className="nav-link">
                  {labelMyCloset}
                </Link>
              </li>
            )}
          </>
        )}
      </ul>

      <ul className="navbar-nav ml-auto">
        {isTopNav && user && (
          <li className="nav-item">
            <Link href="/skinlib/upload" className="nav-link">
              <i className="fas fa-upload" aria-hidden="true" />
              &nbsp;
              <span className="d-none d-sm-inline">{labelUploadNewSkin}</span>
            </Link>
          </li>
        )}
        {isTopNav && <LanguagesDropdown current={locales.find((l) => l.id === ctx.locale)?.name ?? ''} langs={locales} />}
        {user && <DarkModeButton darkMode={darkMode} />}
        {user && <NotificationsContainer />}
        {user ? (
          <UserMenu
            uid={user.uid}
            nickname={user.nickname}
            email={user.email}
            isAdmin={isAdmin}
            menu={userMenu}
            logoutLabel={labelLogout}
          />
        ) : isTopNav ? (
          <li className="nav-item">
            <Link href="/auth/login" className="nav-link">
              <i className="fas fa-user" />
              <span className="d-none d-sm-inline">{labelAnonymous}</span>
            </Link>
          </li>
        ) : (
          <li className="nav-item">
            <Link href="/auth/login" className="nav-link">
              <i className="icon fas fa-sign-in-alt" />
              {` ${labelLogin}`}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
