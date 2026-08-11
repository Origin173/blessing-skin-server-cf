/**
 * 插件路由注册表 (镜像 ConfigureRoutes 事件 + Laravel 路由语法)。
 * 插件通过 hook.addRoute() / configure.routes 事件注册;
 * Next.js 侧由 app/api/plugins/[[...path]]/route.ts 统一分发。
 *
 * path 语法: '/user/stats'、'/user/stats/:id'、'/user/*' (尾部通配)
 */

export type PluginRouteHandler = (req: PluginRequest) => Promise<Response> | Response;

export interface PluginRequest {
  url: URL;
  method: string;
  headers: Headers;
  params: Record<string, string>;
  body: () => Promise<Record<string, unknown>>;
  /** 已装载会话 (若经过 withWeb) */
  session: unknown;
  /** 已认证用户 */
  user: unknown;
  json: (data: unknown, status?: number) => Response;
  redirect: (to: string, status?: number) => Response;
}

export interface RouterRegistrar {
  get(path: string, handler: PluginRouteHandler): void;
  post(path: string, handler: PluginRouteHandler): void;
  put(path: string, handler: PluginRouteHandler): void;
  delete(path: string, handler: PluginRouteHandler): void;
  any(path: string, handler: PluginRouteHandler): void;
  group(prefix: string, register: (router: RouterRegistrar) => void): void;
}

export interface RouteEntry {
  method: string;
  segments: string[];
  handler: PluginRouteHandler;
}

export interface RouteRegistry {
  register(method: string, path: string, handler: PluginRouteHandler): void;
  /** 匹配 (method, pathname),返回 handler 与路径参数;无匹配返回 null */
  match(
    method: string,
    pathname: string,
  ): { handler: PluginRouteHandler; params: Record<string, string> } | null;
  routes(): RouteEntry[];
}

function normalizePath(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

export function createRouteRegistry(): RouteRegistry {
  const entries: RouteEntry[] = [];

  function register(method: string, path: string, handler: PluginRouteHandler): void {
    entries.push({ method: method.toUpperCase(), segments: normalizePath(path), handler });
  }

  function match(method: string, pathname: string) {
    const target = normalizePath(pathname);
    const upper = method.toUpperCase();

    for (const entry of entries) {
      if (entry.method !== 'ANY' && entry.method !== upper) continue;

      // 根通配:匹配任意路径
      if (entry.segments.length === 1 && entry.segments[0] === '*') {
        return { handler: entry.handler, params: {} };
      }

      // 尾部通配 (如 /user/*) 匹配前缀
      const lastIsWildcard = entry.segments[entry.segments.length - 1] === '*';
      const minSegments = lastIsWildcard ? entry.segments.length - 1 : entry.segments.length;
      if (target.length < minSegments || (!lastIsWildcard && target.length !== entry.segments.length)) {
        continue;
      }

      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < minSegments; i++) {
        const seg = entry.segments[i];
        if (seg === '*') continue;
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = target[i];
        } else if (seg !== target[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: entry.handler, params };
    }
    return null;
  }

  return { register, match, routes: () => entries };
}

/** 给插件的 RouterRegistrar (绑定到某个注册表,支持前缀/嵌套 group) */
export function createPluginRouter(
  registry: RouteRegistry,
  prefix = '',
): RouterRegistrar {
  const reg = (method: string) => (path: string, handler: PluginRouteHandler) =>
    registry.register(method, `${prefix}${path}`, handler);

  const router: RouterRegistrar = {
    get: reg('GET'),
    post: reg('POST'),
    put: reg('PUT'),
    delete: reg('DELETE'),
    any: reg('ANY'),
    group(subPrefix, inner) {
      inner(createPluginRouter(registry, `${prefix}${subPrefix}`));
    },
  };
  return router;
}
