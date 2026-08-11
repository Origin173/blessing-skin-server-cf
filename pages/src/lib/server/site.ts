/**
 * 站点数据装载 (对照原版 View Composers 与 config/options.php):
 *   HeadComposer / FootComposer / UserPanelComposer / HomeController
 * 所有页面共享的渲染数据在此一次性装载。
 */

import { getOption } from './options';
import { t } from './i18n';
import { AppContext } from './context';

/** config/options.php 默认值 */
const OPTION_DEFAULTS: Record<string, unknown> = {
  site_url: '',
  site_name: 'Blessing Skin',
  site_description: 'Open-source PHP Minecraft Skin Hosting Service',
  home_pic_url: './app/bg.webp',
  custom_css: '',
  custom_js: '',
  copyright_prefer: '0',
  copyright_text: '',
  favicon_url: 'app/favicon.ico',
  meta_keywords: '',
  meta_description: '',
  meta_extras: '',
  cdn_address: '',
  transparent_navbar: 'false',
  fixed_bg: 'false',
  hide_intro: 'false',
  navbar_color: 'cyan',
  sidebar_color: 'dark-maroon',
  color_mode: 'light',
};

const THEME_COLORS: Record<string, string> = {
  primary: '#007bff',
  secondary: '#6c757d',
  success: '#28a745',
  warning: '#ffc107',
  danger: '#dc3545',
  navy: '#001f3f',
  olive: '#3d9970',
  lime: '#01ff70',
  fuchsia: '#f012be',
  maroon: '#d81b60',
  indigo: '#6610f2',
  purple: '#6f42c1',
  pink: '#e83e8c',
  orange: '#fd7e14',
  teal: '#20c997',
  cyan: '#17a2b8',
  gray: '#6c757d',
};

export const COPYRIGHT_TEXTS = [
  'Powered with ❤ by Blessing Skin Server.',
  'Powered by Blessing Skin Server.',
  'Proudly powered by Blessing Skin Server.',
  '由 Blessing Skin Server 强力驱动。',
  '采用 Blessing Skin Server 搭建。',
  '使用 Blessing Skin Server 稳定运行。',
  '自豪地采用 Blessing Skin Server。',
];

/** 可选语言 (对应 config/locales.php,过滤 alias) */
export const LOCALES: { id: string; name: string }[] = [
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

const LOCALE_NAMES: Record<string, string> = Object.fromEntries(
  LOCALES.map((l) => [l.id, l.name]),
);

async function opt(env: Env, key: string, def?: unknown): Promise<unknown> {
  return getOption(env, key, def ?? OPTION_DEFAULTS[key] ?? null);
}

/** 本地化选项 (原 option_localized:语言覆盖的选项值) */
async function optLocalized(env: Env, ctx: AppContext, key: string): Promise<unknown> {
  // 本地化选项存于 {key}__{locale} (OptionsController::localize 语义)
  const localized = await getOption(env, `${key}__${ctx.locale}`, null);
  if (localized !== null) return localized;
  return opt(env, key);
}

export interface SiteData {
  siteName: string;
  siteDescription: string;
  siteUrl: string;
  navbarColor: string;
  sidebarColor: string;
  colorMode: string;
  themeColor: string;
  favicon: string;
  seo: { keywords: string; description: string; extra: string };
  cdnAddress: string;
  customCss: string;
  customJs: string;
  copyrightPrefer: number;
  copyrightText: string;
  homePicUrl: string;
  transparentNavbar: boolean;
  fixedBg: boolean;
  hideIntro: boolean;
  /** 用户面板数据 (对应 UserPanelComposer) */
  userPanel: {
    avatar: string;
    avatarPng: string;
    badges: { text: string; color: string }[];
  } | null;
}

/** 装载全站共享数据 (每请求一次) */
export async function loadSiteData(env: Env, ctx: AppContext): Promise<SiteData> {
  const [siteName, siteDescription, siteUrl, navbarColor, sidebarColor, colorMode, faviconRaw, customCss, customJs, copyrightPrefer, copyrightText, homePicUrl, transparentNavbar, fixedBg, hideIntro] =
    await Promise.all([
      optLocalized(env, ctx, 'site_name'),
      optLocalized(env, ctx, 'site_description'),
      opt(env, 'site_url'),
      opt(env, 'navbar_color'),
      opt(env, 'sidebar_color'),
      opt(env, 'color_mode'),
      opt(env, 'favicon_url'),
      opt(env, 'custom_css'),
      opt(env, 'custom_js'),
      opt(env, 'copyright_prefer'),
      optLocalized(env, ctx, 'copyright_text'),
      opt(env, 'home_pic_url'),
      opt(env, 'transparent_navbar'),
      opt(env, 'fixed_bg'),
      opt(env, 'hide_intro'),
    ]);

  // theme-color 映射 (HeadComposer::applyThemeColor)
  const themeColor = THEME_COLORS[String(navbarColor)] ?? THEME_COLORS.cyan;

  // favicon (HeadComposer::addFavicon)
  const faviconRawStr = String(faviconRaw ?? '');
  const favicon = faviconRawStr.startsWith('http') ? faviconRawStr : `/${faviconRawStr}`;

  // 用户面板 (UserPanelComposer)
  let userPanel: SiteData['userPanel'] = null;
  if (ctx.user) {
    const { collectBadges } = await import('@/lib/plugins/compositors');
    const avatarBase = `/avatar/user/${ctx.user.uid}?size=45`;
    const badges = await collectBadges();
    if (ctx.user.permission >= 1) {
      badges.unshift({ text: 'STAFF', color: 'primary' });
    }
    userPanel = {
      avatar: avatarBase,
      avatarPng: `${avatarBase}&png`,
      badges,
    };
  }

  return {
    siteName: String(siteName ?? 'Blessing Skin'),
    siteDescription: String(siteDescription ?? ''),
    siteUrl: String(siteUrl ?? ''),
    navbarColor: String(navbarColor ?? 'cyan'),
    sidebarColor: String(sidebarColor ?? 'dark-maroon'),
    colorMode: String(colorMode ?? 'light'),
    themeColor,
    favicon,
    seo: {
      keywords: String((await opt(env, 'meta_keywords')) ?? ''),
      description: String((await opt(env, 'meta_description')) ?? ''),
      extra: String((await opt(env, 'meta_extras')) ?? ''),
    },
    cdnAddress: String((await opt(env, 'cdn_address')) ?? ''),
    customCss: String(customCss ?? ''),
    customJs: String(customJs ?? ''),
    copyrightPrefer: Number(copyrightPrefer ?? 0),
    copyrightText: String(copyrightText ?? ''),
    homePicUrl: String(homePicUrl ?? OPTION_DEFAULTS.home_pic_url),
    transparentNavbar: transparentNavbar === true || transparentNavbar === 'true',
    fixedBg: fixedBg === true || fixedBg === 'true',
    hideIntro: hideIntro === true || hideIntro === 'true',
    userPanel,
  };
}

/** 版权文本 (对应 shared/copyright.twig) */
export async function renderCopyright(
  env: Env,
  ctx: AppContext,
  site: SiteData,
): Promise<string> {
  const repo = 'https://github.com/bs-community/blessing-skin-server';
  const base = COPYRIGHT_TEXTS[site.copyrightPrefer] ?? COPYRIGHT_TEXTS[0];
  const official = `<div id="copyright-text" class="float-right d-none d-sm-inline">${base.replace(
    'Blessing Skin Server.',
    `<a href="${repo}" target="_blank">Blessing Skin Server</a>.`,
  )}</div>`;

  const custom = site.copyrightText
    ? site.copyrightText
        .replaceAll('{site_name}', site.siteName)
        .replaceAll('{site_url}', site.siteUrl)
        .replaceAll('{year}', String(new Date().getFullYear()))
    : '';
  return official + (custom ? `<div>${custom}</div>` : '');
}

/** 翻译辅助 (服务端) */
export async function trans(
  env: Env,
  ctx: AppContext,
  key: string,
  params?: Record<string, string | number>,
): Promise<string> {
  return t(key, params, { locale: ctx.locale });
}
