'use client';

/**
 * 布局客户端行为 (对应原版 scripts/app.ts + admin-lte jQuery 插件):
 *   - body class 管理 (hold-transition + variant)
 *   - admin-lte 初始化 (pushmenu/treeview/dropdown) + tooltip
 * 挂载在 wrapper 外层,所有页面共用。
 */
import React, { useEffect, useRef } from 'react';

export function LayoutClient({
  variant,
  darkMode,
}: {
  variant: 'home' | 'auth' | 'explore' | 'user' | 'admin';
  darkMode?: boolean;
}) {
  const inited = useRef(false);

  useEffect(() => {
    // body class (原版模板在服务端设置,SPA 由 Layout.tsx 在客户端设置)
    const variantClass: Record<string, string> = {
      home: 'layout-top-nav',
      auth: 'login-page',
      explore: 'layout-top-nav',
      user: 'sidebar-mini',
      admin: 'sidebar-mini',
    };
    document.body.className = `hold-transition ${variantClass[variant]}`;
    document.body.classList.toggle('dark-mode', Boolean(darkMode));

    // admin-lte jQuery 插件 (与 web/src/scripts/app.ts 的 import 'admin-lte' 等价)
    if (!inited.current) {
      inited.current = true;
      (async () => {
        try {
          const $ = (await import('jquery')).default;
          (window as any).$ = (window as any).jQuery = $;
          // bootstrap bundle (内联 popper) 提供 $.fn.tooltip 等 jQuery 插件 (admin-lte 依赖)
          await import('bootstrap/dist/js/bootstrap.bundle');
          await import('admin-lte');
          ($ as any)('[data-toggle="tooltip"]').tooltip();
        } catch (error) {
          console.error('admin-lte init failed:', error);
        }
      })();
    }

    return () => {
      // 不清理 body class: 路由切换时由新 variant 覆盖
    };
  }, [variant, darkMode]);

  return null;
}
