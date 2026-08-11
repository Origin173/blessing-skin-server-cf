/**
 * 侧边栏 (对照 shared/sidebar.twig + user-panel.twig + side-menu-item.twig)。
 * 菜单由 Shell 传入 (renderMenu 已合并插件 configure.menu 事件结果)。
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import type { AppContext } from '@/lib/server/context';
import type { MenuItem } from '@/lib/plugins/manager';
import { transformMenu } from '@/lib/server/menu';

interface SidebarProps {
  ctx: AppContext;
  siteName: string;
  sidebarColor: string;
  scope: 'user' | 'admin';
  /** 当前路由路径 (如 'user/closet'),由页面组件传入 (RSC 无法直接获取 request URL) */
  currentPath: string;
  /** 已合并插件菜单的菜单项 (renderMenu 结果) */
  items: MenuItem[];
  badges: { text: string; color: string }[];
}

interface RenderedItem extends MenuItem {
  active?: boolean;
  classes?: string[];
  children?: RenderedItem[];
}

async function SideMenuItemView({
  item,
  locale,
}: {
  item: RenderedItem;
  locale: string;
}) {
  const active = item.active ? 'active' : '';
  const classes = item.classes ?? [];

  if (item.children) {
    return (
      <li className={`nav-item ${classes.join(' ')}`}>
        <a className={`nav-link ${active}`} href="#">
          <i className={`nav-icon fas ${item.icon}`} />
          <p className="ml-1">
            {await t(item.title, {}, { locale })}
            <i className="right fas fa-angle-left" />
          </p>
        </a>
        <ul className="nav nav-treeview">
          {item.children.map((child) => (
            <SideMenuItemView item={child} key={child.title} locale={locale} />
          ))}
        </ul>
      </li>
    );
  }

  const link = item.link ?? '#';
  const iconKind = item.icon === 'fa-circle' ? 'far' : 'fas';
  const external = item['new-tab'];
  const cls = `nav-link ${active}`;
  const inner = (
    <>
      <i className={`nav-icon ${iconKind} ${item.icon}`} />
      <p className="ml-1">{await t(item.title, {}, { locale })}</p>
    </>
  );

  return (
    <li className={`nav-item ${classes.join(' ')}`}>
      {external ? (
        <a href={`/${link}`} className={cls} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      ) : (
        <Link href={`/${link}`} className={cls}>
          {inner}
        </Link>
      )}
    </li>
  );
}

export async function Sidebar({
  ctx,
  siteName,
  sidebarColor,
  scope,
  currentPath,
  items,
  badges,
}: SidebarProps) {
  const locale = ctx.locale;
  const user = ctx.user;
  const isAdmin = user ? user.permission >= 1 : false;

  // active 计算 (SideMenuComposer::transform)
  const all: RenderedItem[] = transformMenu(items, currentPath);

  return (
    <aside className={`main-sidebar sidebar-${sidebarColor} elevation-3`}>
      <Link href="/" className="brand-link text-center">
        <span className="brand-text font-weight-light">{siteName}</span>
      </Link>
      <div className="sidebar">
        {/* user-panel (对照 shared/user-panel.twig) */}
        <div className={`user-panel mt-3 mb-3 ${badges.length > 0 ? 'pb-2' : ''}`}>
          <div className="d-flex">
            <div className="image">
              <picture>
                <img
                  src={`/avatar/user/${user!.uid}?size=45&png`}
                  className="bs-avatar"
                  alt="User Image"
                />
              </picture>
            </div>
            <div className="info">
              <a className="d-block" data-mark="nickname">
                {user!.nickname || user!.email}
              </a>
            </div>
          </div>
          {badges.length > 0 && (
            <div className="mt-3 ml-2 mr-2 d-flex flex-wrap">
              {badges.map((badge, i) => (
                <span className={`badge bg-${badge.color} mb-1 mr-2`} key={i}>
                  {badge.text}
                </span>
              ))}
            </div>
          )}
        </div>
        <nav className="mt-2">
          <ul
            className="nav nav-pills nav-sidebar flex-column nav-child-indent"
            data-widget="treeview"
            role="menu"
          >
            {scope === 'user' ? (
              <>
                <li className="nav-header">{await t('general.user-center', {}, { locale })}</li>
                {all.map((item) => (
                  <SideMenuItemView item={item} key={item.title} locale={locale} />
                ))}
                <li className="nav-header">{await t('general.explore', {}, { locale })}</li>
                <li className="nav-item">
                  <Link href="/skinlib" className="nav-link">
                    <i className="nav-icon fas fa-archive" />
                    <p>{await t('general.skinlib', {}, { locale })}</p>
                  </Link>
                </li>
                {isAdmin && (
                  <>
                    <li className="nav-header">{await t('general.manage', {}, { locale })}</li>
                    <li className="nav-item">
                      <Link href="/admin" className="nav-link">
                        <i className="nav-icon fas fa-cog" />
                        <p>{await t('general.admin-panel', {}, { locale })}</p>
                      </Link>
                    </li>
                  </>
                )}
              </>
            ) : (
              <>
                <li className="nav-header">{await t('general.admin-panel', {}, { locale })}</li>
                {all.map((item) => (
                  <SideMenuItemView item={item} key={item.title} locale={locale} />
                ))}
                <li className="nav-header">{await t('general.back', {}, { locale })}</li>
                <li className="nav-item">
                  <Link href="/user" className="nav-link">
                    <i className="nav-icon fas fa-user" />
                    &nbsp;
                    <p>{await t('general.user-center', {}, { locale })}</p>
                  </Link>
                </li>
                <li className="nav-item">
                  <Link href="/skinlib" className="nav-link">
                    <i className="nav-icon fas fa-archive" />
                    &nbsp;
                    <p>{await t('general.skinlib', {}, { locale })}</p>
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
