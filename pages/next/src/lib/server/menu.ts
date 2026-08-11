/**
 * 侧边栏菜单 (移植 config/menu.php + SideMenuComposer)。
 * 插件通过 configure.menu 事件修改菜单;渲染时按 category 读取。
 */

import type { MenuItem } from '@/lib/plugins/manager';

/** config/menu.php */
export const MENU: Record<'user' | 'admin' | 'explore', MenuItem[]> = {
  user: [
    { title: 'general.dashboard', link: 'user', icon: 'fa-tachometer-alt' },
    { title: 'general.my-closet', link: 'user/closet', icon: 'fa-star' },
    { title: 'general.player-manage', link: 'user/player', icon: 'fa-users' },
    { title: 'general.my-reports', link: 'user/reports', icon: 'fa-flag' },
    { title: 'general.profile', link: 'user/profile', icon: 'fa-user' },
    {
      title: 'general.developer',
      icon: 'fa-code-branch',
      children: [
        { title: 'general.oauth-manage', link: 'user/oauth/manage', icon: 'fa-feather-alt' },
      ],
    },
  ],
  admin: [
    { title: 'general.dashboard', link: 'admin', icon: 'fa-tachometer-alt' },
    { title: 'general.user-manage', link: 'admin/users', icon: 'fa-users' },
    { title: 'general.player-manage', link: 'admin/players', icon: 'fa-gamepad' },
    { title: 'general.report-manage', link: 'admin/reports', icon: 'fa-flag' },
    { title: 'general.customize', link: 'admin/customize', icon: 'fa-paint-brush' },
    { title: 'general.i18n', link: 'admin/i18n', icon: 'fa-globe' },
    { title: 'general.score-options', link: 'admin/score', icon: 'fa-credit-card' },
    { title: 'general.options', link: 'admin/options', icon: 'fa-cog' },
    { title: 'general.res-options', link: 'admin/resource', icon: 'fa-atom' },
    { title: 'general.status', link: 'admin/status', icon: 'fa-battery-three-quarters' },
    { title: 'general.plugin-manage', link: 'admin/plugins/manage', icon: 'fa-plug' },
    { title: 'general.plugin-market', link: 'admin/plugins/market', icon: 'fa-shopping-bag' },
    { title: 'general.plugin-configs', id: 'plugin-configs', icon: 'fa-cogs', children: [] },
    { title: 'general.check-update', link: 'admin/update', icon: 'fa-arrow-up' },
  ],
  explore: [{ title: 'general.skinlib', link: 'skinlib', icon: 'fa-archive' }],
};

/** SideMenuComposer::transform (active 计算 + 子菜单递归) */
export function transformMenu(
  items: MenuItem[],
  path: string,
): (MenuItem & { active?: boolean; classes?: string[] })[] {
  return items.map((item) => {
    let isActive = item.link ? pathIs(path, item.link) : false;
    const children = item.children ? transformMenu(item.children, path) : undefined;
    if (children) {
      for (const child of children) {
        if (child.active) {
          isActive = true;
          break;
        }
      }
    }
    return {
      ...item,
      children,
      active: isActive,
      classes: isActive ? ['active', 'menu-open'] : [],
    };
  });
}

/** 近似 Laravel request->is */
function pathIs(path: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '/?$',
    'i',
  );
  return regex.test(path);
}
