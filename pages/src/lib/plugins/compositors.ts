/**
 * 渲染注入收集 (对应原版 View Composers):
 *   HeadComposer / FootComposer / UserPanelComposer / SideMenuComposer
 * 在 RSC 页面渲染时调用,收集插件钩子注入的 head/foot 内容与菜单/徽章。
 */

import { getRuntime } from '@/lib/plugins/manager';

export interface HeadAssets {
  /** <head> 注入 HTML (rendering.header 事件 contents) */
  extraHead: string[];
  /** link 标签 (filter head_links,含插件 addStyleFileToPage) */
  links: Record<string, string>[];
  /** script 标签 (filter scripts,含插件 addScriptFileToPage) */
  scripts: Record<string, string>[];
  /** inline css (原 inline_css 选项) */
  inlineCss: string;
  /** inline js (原 inline_js 选项) */
  inlineJs: string;
}

export interface FootAssets {
  /** </body> 前注入 HTML (rendering.footer 事件 contents) */
  extraFoot: string[];
}

/** 收集 <head> 注入 (对应 HeadComposer) */
export async function collectHead(path: string): Promise<HeadAssets> {
  const rt = getRuntime();

  // RenderingHeader 事件
  const contents: string[] = [];
  await rt.eventBus.dispatch('rendering.header', {
    contents,
    addContent: (content: string) => contents.push(content),
  });

  // head_links / scripts 过滤器
  const links = await rt.filter.apply<Record<string, string>[]>('head_links', [], [path]);
  const scripts = await rt.filter.apply<Record<string, string>[]>('scripts', [], [path]);

  return {
    extraHead: contents,
    links,
    scripts,
    inlineCss: '',
    inlineJs: '',
  };
}

/** 收集 </body> 前注入 (对应 FootComposer) */
export async function collectFoot(): Promise<FootAssets> {
  const rt = getRuntime();
  const contents: string[] = [];
  await rt.eventBus.dispatch('rendering.footer', {
    contents,
    addContent: (content: string) => contents.push(content),
  });
  return { extraFoot: contents };
}

/** 用户面板徽章 (对应 UserPanelComposer / RenderingBadges) */
export async function collectBadges(): Promise<{ text: string; color: string }[]> {
  const rt = getRuntime();
  const badges: { text: string; color: string }[] = [];
  await rt.eventBus.dispatch('rendering.badges', { badges });
  return badges;
}
