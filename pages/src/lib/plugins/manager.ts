/**
 * 插件运行时管理器 (镜像 App\Services\PluginManager)。
 *
 * 平台约束: Workers 打包是静态的,无法在运行时 import 任意插件代码。
 * 因此插件采用「构建期打包 + D1 控制启用」:
 *   - scripts/gen-bundled.mjs 扫描 plugins/ 目录,生成 bundled/index.ts (静态 import 映射)
 *   - 运行期只加载 D1 plugin_manifests 中 enabled=1 的插件
 *   - 新安装/更新插件需重新构建部署;启用/禁用/配置即时生效
 */

import { createEventBus, EventBus } from './events';
import { createFilter, Filter } from './filter';
import { createRouteRegistry, RouteRegistry, createPluginRouter, RouterRegistrar } from './registry';
import { json } from '@/lib/server/response';
import { randomHex } from '@/lib/server/types';

/** 菜单项 (对应 config/menu.php 结构) */
export interface MenuItem {
  title: string;
  link?: string;
  icon: string;
  'new-tab'?: boolean;
  /** 特殊项标识 (如插件配置分组 'plugin-configs') */
  id?: string;
  children?: MenuItem[];
}

export interface PluginRuntime {
  eventBus: EventBus;
  filter: Filter;
  registry: RouteRegistry;
  loaded: { name: string; version: string }[];
  booted: boolean;
  boot(env: Env): Promise<void>;
  isEnabled(name: string): boolean;
}

const runtime: PluginRuntime = {
  eventBus: createEventBus(),
  filter: createFilter(),
  registry: createRouteRegistry(),
  loaded: [],
  booted: false,
  isEnabled(name) {
    return this.loaded.some((p) => p.name === name);
  },
  async boot(env) {
    if (this.booted) return;
    this.booted = true;

    // 启用清单来自 D1 (安装/启用操作写库;构建期打包保证 bootstrap.js 存在)
    const { results } = await env.DB.prepare(
      'SELECT name, manifest_json, enabled FROM plugin_manifests WHERE enabled = 1',
    ).all<{ name: string; manifest_json: string; enabled: number }>();
    const enabled = (results as { name: string; manifest_json: string; enabled: number }[])
      .filter((row) => row.enabled === 1)
      .map((row) => {
        try {
          return { name: row.name, manifest: JSON.parse(row.manifest_json) as Record<string, unknown> };
        } catch {
          return null;
        }
      })
      .filter((row): row is { name: string; manifest: Record<string, unknown> } => row !== null);

    // 构建期打包的模块映射 (scripts/gen-bundled.mjs 生成)
    const { bundledPlugins } = await import('./bundled');

    for (const { name, manifest } of enabled) {
      const loader = bundledPlugins[name];
      if (!loader) {
        // 包未随本次构建打包 (未重新部署),记录但不中断
        console.warn(`[plugins] "${name}" enabled but not bundled in this build`);
        continue;
      }
      try {
        const mod = await loader();
        const api = createPluginApi(this, env, name, manifest);
        const fn =
          (mod as { bootstrap?: unknown }).bootstrap ??
          ((mod as { default?: { bootstrap?: unknown } }).default?.bootstrap ??
            (mod as { default?: unknown }).default);
        if (typeof fn !== 'function') {
          throw new Error(`bootstrap is not a function`);
        }
        await (fn as (api: unknown) => unknown)(api);
        this.loaded.push({ name, version: String(manifest.version ?? '') });
      } catch (error) {
        console.error(`[plugins] "${name}" boot failed:`, error);
        // 对应 PluginBootFailed 事件
        await this.eventBus.dispatch('plugin.boot-failed', { name, error });
      }
    }
  },
};

export function getRuntime(): PluginRuntime {
  return runtime;
}

/** 菜单便捷修改 (镜像 Hook::addMenuItem: 注册 configure.menu 监听,按 position 插入) */
function insertMenuItem(list: MenuItem[], position: number, item: MenuItem): void {
  list.splice(Math.max(0, Math.min(position, list.length)), 0, item);
}

/** 渲染菜单 (镜像 SideMenuComposer: 基础菜单副本 + configure.menu 事件修改) */
export async function renderMenu(
  category: 'user' | 'admin' | 'explore',
  baseMenu: Record<'user' | 'admin' | 'explore', MenuItem[]>,
): Promise<MenuItem[]> {
  const menu: Record<'user' | 'admin' | 'explore', MenuItem[]> = {
    user: [...baseMenu.user],
    admin: [...baseMenu.admin],
    explore: [...baseMenu.explore],
  };
  await runtime.eventBus.dispatch('configure.menu', {
    category,
    menu,
    addItem: (item: MenuItem, position = 0) => insertMenuItem(menu[category], position, item),
  });
  return menu[category];
}

/** 构造 bootstrap.js 的 API 参数 (docs/02-plugin-sdk.md §4) */
export function createPluginApi(
  rt: PluginRuntime,
  env: Env,
  name: string,
  manifest: Record<string, unknown>,
) {
  const version = String(manifest.version ?? '');

  const api = {
    event: {
      on: (eventName: string, handler: any) => rt.eventBus.on(eventName, handler),
      once: (eventName: string, handler: any) => rt.eventBus.once(eventName, handler),
      off: (eventName: string, handler: any) => rt.eventBus.off(eventName, handler),
    },

    hook: {
      addMenuItem: (category: 'user' | 'admin' | 'explore', position: number, item: MenuItem) => {
        // 镜像 Hook::addMenuItem: 注册 configure.menu 事件监听,渲染时按 position 插入
        rt.eventBus.on(
          'configure.menu',
          (payload: { category: string; menu: Record<string, MenuItem[]> }) => {
            if (payload.category !== category) return;
            const list = payload.menu[category];
            if (list) insertMenuItem(list, position, item);
          },
        );
      },
      addRoute: (register: (router: RouterRegistrar) => void) => {
        register(createPluginRouter(rt.registry));
      },
      addStyleFileToPage: (urls: string[], pages: string[] = ['*']) => {
        rt.filter.add('head_links', (links: any[], currentPath: string) => {
          if (pathMatches(pages, currentPath)) {
            for (const href of urls) {
              links.push({ rel: 'stylesheet', href, crossorigin: 'anonymous' });
            }
          }
          return links;
        });
      },
      addScriptFileToPage: (urls: string[], pages: string[] = ['*']) => {
        rt.filter.add('scripts', (scripts: any[], currentPath: string) => {
          if (pathMatches(pages, currentPath)) {
            for (const src of urls) {
              scripts.push({ src, crossorigin: 'anonymous' });
            }
          }
          return scripts;
        });
      },
      sendNotification: async (users: number[], title: string, content = '') => {
        // 对应 Notifications\SiteMessage: notifications 表 type='App\\Notifications\\SiteMessage'
        const data = JSON.stringify({ title, content });
        const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
        for (const uid of users) {
          await env.DB.prepare(
            `INSERT INTO notifications (id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at)
             VALUES (?, 'App\\Notifications\\SiteMessage', 'App\\Models\\User', ?, ?, NULL, ?, ?)`,
          )
            .bind(randomHex(16), uid, data, nowStr, nowStr)
            .run();
        }
      },
    },

    filter: {
      add: <T>(filterName: string, transform: any) => rt.filter.add<T>(filterName, transform),
      apply: <T>(filterName: string, init: T, args: any[] = []) =>
        rt.filter.apply<T>(filterName, init, args),
    },

    option: {
      get: (key: string, defaultValue: unknown = null) =>
        import('@/lib/server/options').then(({ getOption }) => getOption(env, key, defaultValue)),
      set: async (key: string, value: unknown) => {
        const { setOption } = await import('@/lib/server/options');
        await setOption(env, key, String(value));
      },
    },

    config: {
      get: async () => {
        const row = await env.DB.prepare('SELECT config_json FROM plugin_configs WHERE plugin_name = ?')
          .bind(name)
          .first<{ config_json: string }>();
        try {
          return row ? (JSON.parse(row.config_json) as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      },
    },

    logger: {
      debug: (msg: string) => console.debug(`[plugins/${name}] ${msg}`),
      info: (msg: string) => console.info(`[plugins/${name}] ${msg}`),
      warn: (msg: string) => console.warn(`[plugins/${name}] ${msg}`),
      error: (msg: string) => console.error(`[plugins/${name}] ${msg}`),
    },

    asset: (relativeUri: string) =>
      `/plugins/${name}/assets/${relativeUri.replace(/^\/+/, '')}?v=${version}`,
  };

  return api;
}

export type PluginApi = ReturnType<typeof createPluginApi>;

/** 当前路径匹配 (对应 request()->is($page),支持 * 通配) */
function pathMatches(pages: string[], path = '/') {
  return pages.some((pattern) => {
    if (pattern === '*') return true;
    const regex = new RegExp(
      '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '/?$',
      'i',
    );
    return regex.test(path);
  });
}

/** Route Handler 包装: 构造插件路由请求上下文 */
export function createPluginRequest(
  request: Request,
  params: Record<string, string>,
  session: unknown,
  user: unknown,
): any {
  return {
    url: new URL(request.url),
    method: request.method,
    headers: request.headers,
    params,
    body: async () => {
      try {
        return (await request.clone().json()) as Record<string, unknown>;
      } catch {
        return {};
      }
    },
    session,
    user,
    json: (data: unknown, status = 200) => {
      if (typeof data === 'object' && data !== null && !('code' in data)) {
        return json('', 1, data);
      }
      return Response.json(data, { status });
    },
    redirect: (to: string, status = 302) => Response.redirect(to, status),
  };
}
