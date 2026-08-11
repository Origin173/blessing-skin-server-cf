/**
 * 页面外壳 (组合布局,对照 base.twig 家族):
 *   - head 注入: csrf meta / blessing 全局 / 插件 rendering.header + head_links + scripts / custom css-js
 *     (平台差异: Next.js 管理 <head>,注入内容渲染于 body 顶部,前端脚本均按 id/name 查找,行为一致)
 *   - auth: login-box (对照 auth/base.twig)
 *   - explore/user/admin: wrapper (header + sidebar + content + footer)
 *   - home: 首页自带完整结构 (对照 home.twig)
 */
import React from 'react';
import { t, loadBundle } from '@/lib/server/i18n';
import type { AppContext } from '@/lib/server/context';
import type { SiteData } from '@/lib/server/site';
import { MENU } from '@/lib/server/menu';
import { getRuntime, renderMenu, MenuItem } from '@/lib/plugins/manager';
import { collectHead, collectFoot } from '@/lib/plugins/compositors';
import { LayoutClient } from './LayoutClient';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { UserMenu } from './UserMenu';

export type LayoutVariant = 'home' | 'auth' | 'explore' | 'user' | 'admin';

const LOCALES: { id: string; name: string }[] = [
  { id: 'zh_CN', name: '中文 (简体)' },
  { id: 'zh_TW', name: '中文 (正體)' },
  { id: 'en', name: 'English' },
  { id: 'es_ES', name: 'Español' },
  { id: 'ru_RU', name: 'Русский язык' },
  { id: 'de_DE', name: 'Deutsch' },
  { id: 'fr_FR', name: 'Français' },
  { id: 'it_IT', name: 'Italiano' },
  { id: 'ja_JP', name: '日本語' },
  { id: 'ko_KR', name: '한국어' },
  { id: 'nl_NL', name: 'Nederlands' },
  { id: 'pt_PT', name: 'Português' },
  { id: 'el_GR', name: 'Ελληνικά' },
];

const APP_VERSION = '6.0.2'; // config('app.version')

interface HeadInjectProps {
  ctx: AppContext;
  site: SiteData;
  /** 当前路径 (如 'auth/login') */
  path: string;
  darkMode: boolean;
}

/** head 注入 (对应 HeadComposer + FootComposer 的注入内容,渲染于 body 顶部) */
async function HeadInject({ ctx, site, path, darkMode }: HeadInjectProps) {
  const { extraHead, links, scripts, inlineCss, inlineJs } = await collectHead(path);
  const { extraFoot } = await collectFoot();

  // 前端 i18n (对齐原版 blessing.i18n = trans('front-end')):
  // 注入完整 flat 语言包, client 组件用 src/lib/client-i18n.ts 的 t() 读取
  const i18nBundle = await loadBundle(ctx.locale);

  const blessing: Record<string, unknown> = {
    version: APP_VERSION,
    locale: ctx.locale,
    base_url: '/',
    site_name: site.siteName,
    route: path,
    user: ctx.user
      ? {
          uid: ctx.user.uid,
          email: ctx.user.email,
          nickname: ctx.user.nickname,
          avatar: ctx.user.avatar,
          score: ctx.user.score,
          permission: ctx.user.permission,
          locale: ctx.user.locale,
          verified: ctx.user.verified === 1,
        }
      : null,
  };

  return (
    <>
      <meta name="csrf-token" content={ctx.session?.csrf ?? ''} />
      <meta name="theme-color" content={site.themeColor} />
      <meta name="keywords" content={site.seo.keywords} />
      <meta name="description" content={site.seo.description} />
      {site.seo.extra && <meta name="generator" content={site.seo.extra} />}
      {extraHead.map((html, i) => (
        <div key={`extra-head-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      {links.map((link, i) => (
        <link key={`link-${i}`} {...link} />
      ))}
      <script
        dangerouslySetInnerHTML={{ __html: `window.blessing = ${JSON.stringify(blessing)};` }}
      />
      <script
        dangerouslySetInnerHTML={{ __html: `window.__I18N = ${JSON.stringify(i18nBundle)};` }}
      />
      {scripts.map((script, i) => (
        <script key={`script-${i}`} {...script} />
      ))}
      {inlineCss && <style dangerouslySetInnerHTML={{ __html: inlineCss }} />}
      {inlineJs && <script dangerouslySetInnerHTML={{ __html: inlineJs }} />}
      {extraFoot.map((html, i) => (
        <div key={`extra-foot-${i}`} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
    </>
  );
}

interface ShellProps {
  ctx: AppContext;
  site: SiteData;
  variant: LayoutVariant;
  /** 当前路由路径 (如 'user/closet'),用于菜单 active 与 head route */
  path: string;
  children: React.ReactNode;
}

export async function Shell({ ctx, site, variant, path, children }: ShellProps) {
  const user = ctx.user;
  const darkMode = user ? user.is_dark_mode === 1 : false;
  const locale = ctx.locale;

  // 用户面板徽章 (UserPanelComposer: STAFF + 插件 RenderingBadges)
  const badges = user ? site.userPanel?.badges ?? [] : [];

  // 用户下拉菜单 (UserMenuComposer)
  const userMenu: { label: string; link?: string; divider?: boolean }[] = [];
  if (user) {
    userMenu.push(
      { label: await t('general.user-center', {}, { locale }), link: '/user' },
      { label: await t('general.profile', {}, { locale }), link: '/user/profile' },
    );
    if (user.permission >= 1) {
      userMenu.push(
        { label: '', divider: true },
        { label: await t('general.admin-panel', {}, { locale }), link: '/admin' },
        { label: await t('general.user-manage', {}, { locale }), link: '/admin/users' },
        { label: await t('general.report-manage', {}, { locale }), link: '/admin/reports' },
        { label: 'Web CLI', link: '#launch-cli' },
      );
    }
    const { filter } = getRuntime();
    const filtered = await filter.apply('user_menu', [...userMenu], [user]);
    userMenu.length = 0;
    userMenu.push(...filtered);
  }

  // 插件菜单 (configure.menu 事件在渲染时生效,镜像原版)
  const isAdminScope = variant === 'admin';
  const scope = isAdminScope ? 'admin' : 'user';
  const menuForScope = await renderMenu(scope, MENU);

  // ---- auth variant: login-box (auth/base.twig) ----
  if (variant === 'auth') {
    return (
      <>
        <HeadInject ctx={ctx} site={site} path={path} darkMode={darkMode} />
        <LayoutClient variant="auth" darkMode={darkMode} />
        {children}
      </>
    );
  }

  // ---- home variant: 首页自带完整结构 (home.twig) ----
  if (variant === 'home') {
    return (
      <>
        <HeadInject ctx={ctx} site={site} path={path} darkMode={darkMode} />
        <LayoutClient variant="home" darkMode={darkMode} />
        {children}
      </>
    );
  }

  const isTopNav = variant === 'explore';
  const menuItems = menuForScope;

  return (
    <>
      <HeadInject ctx={ctx} site={site} path={path} darkMode={darkMode} />
      <LayoutClient variant={variant} darkMode={darkMode} />
      <div className="wrapper">
        <Header
          ctx={ctx}
          siteName={site.siteName}
          navbarColor={site.navbarColor}
          colorMode={site.colorMode}
          darkMode={darkMode}
          variant={variant}
          locales={LOCALES}
          userMenu={userMenu}
        />

        {(variant === 'user' || variant === 'admin') && (
          <Sidebar
            ctx={ctx}
            siteName={site.siteName}
            sidebarColor={site.sidebarColor}
            scope={scope as 'user' | 'admin'}
            currentPath={path}
            items={menuForScope}
            badges={badges}
          />
        )}

        <div className="content-wrapper">
          {(variant === 'user' || variant === 'admin') && (
            <div className="content-header">
              <div className="container-fluid">
                <div className="d-flex justify-content-between flex-wrap">
                  <div>
                    <h1 className="m-0">{/* 页面标题由 view 自身渲染 */}</h1>
                  </div>
                  <div>
                    <div className="breadcrumb" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <section className="content">
            <div className="container-fluid">
              <div id="previewer" />
              {children}
            </div>
          </section>
        </div>

        <Footer ctx={ctx} site={site} />
      </div>
    </>
  );
}
