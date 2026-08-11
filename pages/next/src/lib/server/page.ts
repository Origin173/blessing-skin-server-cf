/**
 * RSC 页面数据装载: Cloudflare env + 会话 + 插件 boot + 站点数据。
 * 所有页面组件调用 getPageData() 获取渲染数据。
 */

import { cookies } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { loadPageContext, AppContext } from './context';
import { getRuntime } from '@/lib/plugins/manager';
import { loadSiteData, SiteData } from './site';

export interface PageData {
  env: Env;
  ctx: AppContext;
  site: SiteData;
}

export async function getPageData(): Promise<PageData> {
  const { env } = await getCloudflareContext({ async: true });
  const cookieHeader = (await cookies()).toString() || null;
  const ctx = await loadPageContext(env as unknown as Env, cookieHeader);
  await getRuntime().boot(env as unknown as Env);
  const site = await loadSiteData(env as unknown as Env, ctx);
  return { env: env as unknown as Env, ctx, site };
}
