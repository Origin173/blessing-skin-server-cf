# 插件 SDK 设计（兼容原版 PHP 插件）

> 目标：**格式 + API 语义兼容**原版 Blessing Skin 插件。
> - 插件包格式（zip + package.json）与原版完全一致；
> - 事件、Hook、Filter 三套 API 镜像原版（`App\Events\*`、`Blessing\Hook`、`Blessing\Filter`），同名同签名；
> - PHP 代码无法在 Workers 运行，老插件按本文档迁移指南用 JS 重写入口（`bootstrap.php` → `bootstrap.js`），
>   其余资源（语言包、前端资产、README）原样保留。

## 1. 插件包格式

与原版 zip 包一致（原版 `PluginManager::all()` 扫描 `package.json` 的目录）：

```
my-plugin/
├── package.json          # manifest,字段与原版完全一致
├── bootstrap.js          # 入口 (原版为 bootstrap.php),ESM
├── config-schema.json    # 可选:配置表单 schema (原版为 Blade 视图)
├── lang/                 # 可选:语言包 {locale}.json (原版 lang/)
├── assets/               # 可选:前端静态资产,服务在 /plugins/{name}/assets/*
└── README.md             # 可选:详情页展示 (原版 readme.md)
```

`package.json` 字段（对齐原版 `Plugin::getManifestAttr` 使用到的键）：

```jsonc
{
  "name": "my-plugin",          // 必填,唯一标识 (原版同)
  "version": "1.0.0",           // 必填,语义化版本
  "author": "Author Name",
  "description": "...",
  "require": {                  // 依赖:核心版本/其他插件 (原版 Composer Semver 语义)
    "blessing-skin-server": "^6.0.0",
    "php": ">=8.1"
  },
  "conflicts": { "other-plugin": "*" },
  "entry": "bootstrap.js"       // 默认值即 bootstrap.js,可省
}
```

> 兼容策略：`php` / `blessing-skin-server` 的 `require` 字段照常解析
> （`blessing-skin-server` 映射到当前平台版本 `6.0.2-compat`），避免老包因依赖校验被拒。

## 2. 运行时模型

```
Worker 启动时:
  PluginManager.boot()
    ├── 读取 D1 plugin_manifests 表 (enabled=1)
    ├── 校验依赖 (Semver,镜像 PluginManager::getUnsatisfied/getConflicts)
    ├── 动态 import() 各插件 bootstrap.js (ESM,同进程沙箱)
    │     └── bootstrap({ event, hook, filter, option, route, logger, asset })
    └── 注册生命周期钩子 (对应 registerLifecycleHooks)

请求时:
  RSC/Route Handler 通过 events.dispatch(name, payload) 触发钩子
    ├── rendering.header / rendering.footer → 收集注入 HTML
    ├── configure.menu / configure.routes → 变更菜单/路由表
    └── user.* / player.* / texture.* → 业务事件
```

- 插件代码与主程序运行在**同一 Worker 沙箱**（Workers 无进程隔离），因此 SDK 约定：插件只经
  过 SDK 参数访问能力，不直接触碰 `process`、文件系统（不存在）、网络（受限出站）。
- 每个插件一个独立 `import()` 作用域，异常被 PluginManager 捕获并记录审计，不拖垮主程序
  （对应 `PluginBootFailed` 事件与 `NotifyFailedPlugin` 通知）。

## 3. 事件镜像表

源：`app/Events/*.php`（构造签名见下表"payload"）。事件名采用 kebab-case 字符串。

| 原版事件类 | JS SDK 事件名 | payload（镜像原版构造参数） | 触发点（对照原版） |
|---|---|---|---|
| `ConfigureRoutes` | `'configure.routes'` | `{ router }` — 路由注册器 | `RouteServiceProvider::boot` 同位置 |
| `ConfigureAdminMenu` | `'configure.menu'` | `{ category: 'admin', menu: array, addItem(item, position) }` | `SideMenuComposer` 渲染前 |
| `ConfigureUserMenu` | `'configure.menu'` | `{ category: 'user', ... }` | 同上 |
| `ConfigureExploreMenu` | `'configure.menu'` | `{ category: 'explore', ... }` | 同上 |
| `RenderingHeader` | `'rendering.header'` | `{ contents: string[], addContent(html) }` | `HeadComposer::compose` 同位置（RSC `<head>` 前） |
| `RenderingFooter` | `'rendering.footer'` | `{ contents: string[], addContent(html) }` | `FootComposer` 同位置 |
| `RenderingBadges` | `'rendering.badges'` | `{ badges: { text, color }[] }` | `UserPanelComposer` 同位置（用户面板徽章） |
| `UserTryToLogin` | `'user.try-login'` | `{ identification, authType }` | `AuthController::handleLogin` 前 |
| `UserAuthenticated` | `'user.authenticated'` | `{ user }` | `UserAuthenticated` 触发点 |
| `UserLoggedIn` | `'user.logged-in'` | `{ user }` | 登录成功后 |
| `UserRegistered` | `'user.registered'` | `{ user }` | 注册成功后 |
| `UserProfileUpdated` | `'user.profile-updated'` | `{ type, user }` | `UserController::handleProfile` 内 |
| `PlayerWillBeAdded` | `'player.will-add'` | `{ name }` | `PlayerController::add` 校验前 |
| `PlayerWasAdded` | `'player.added'` | `{ player }` | 添加成功后 |
| `PlayerWillBeDeleted` | `'player.will-delete'` | `{ player }` | 删除前 |
| `PlayerWasDeleted` | `'player.deleted'` | `{ name }` | 删除后 |
| `PlayerRetrieved` | `'player.retrieved'` | `{ player }` | `TextureController::json` 取回玩家时 |
| `PlayerProfileUpdated` | `'player.profile-updated'` | `{ player }` | 纹理变更后 |
| `TextureDeleting` | `'texture.deleting'` | `{ texture }` | `SkinlibController::delete` 前 |
| `PluginWasEnabled` | `'plugin.enabled'` | `{ manifest }` | 启用后 |
| `PluginWasDisabled` | `'plugin.disabled'` | `{ manifest }` | 禁用后 |
| `PluginWasDeleted` | `'plugin.deleted'` | `{ manifest }` | 卸载后 |
| `PluginBootFailed` | `'plugin.boot-failed'` | `{ name, error }` | bootstrap 抛错时 |

**签名对齐说明**：原版菜单事件通过引用传数组（`array &$menu`）修改；JS 版 payload 的
`menu` 为可变更数组，`addItem` 便捷方法等价于 `Hook::addMenuItem` 的插入语义（按 position 插入）。

## 4. bootstrap.js 入口 API

镜像 `Blessing\Hook` 门面（`app/Services/Hook.php`）与 `Blessing\Filter`：

```ts
export function bootstrap(api: PluginAPI): void | Promise<void>

interface PluginAPI {
  /** 事件注册 (镜像 Laravel Event::listen) */
  event: {
    on(name: string, handler: (payload: any) => void | Promise<void>): void;
    once(name: string, handler): void;
    off(name: string, handler): void;
  };

  /** 镜像 Blessing\Hook 静态方法 */
  hook: {
    addMenuItem(
      category: 'user' | 'admin' | 'explore',
      position: number,
      item: { title: string; link: string; icon: string; 'new-tab'?: boolean },
    ): void;

    addRoute(register: (router: RouterRegistrar) => void): void;

    addStyleFileToPage(urls: string[], pages?: string[]): void;  // 默认 ['*']
    addScriptFileToPage(urls: string[], pages?: string[]): void; // 默认 ['*']

    sendNotification(
      users: number[],
      title: string,
      content?: string,
    ): Promise<void>; // 镜像 Notifications\SiteMessage
  };

  /** 镜像 Blessing\Filter (值变换管线) */
  filter: {
    add<T>(name: string, transform: (value: T, ...args: any[]) => T): void;
    apply<T>(name: string, init: T, args?: any[]): Promise<T>;
  };

  /** 镜像 option() helper 与 App\Services\Option */
  option: {
    get(key: string, default?: unknown): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    localized(key: string): Promise<unknown>;
  };

  /** 配置读取 (plugin_configs 表,只读快照) */
  config: {
    get(): Promise<Record<string, unknown>>;
  };

  /** 日志 (带插件名前缀,进 Workers 日志) */
  logger: { debug(msg: string): void; info(msg: string): void; warn(msg: string): void; error(msg: string): void };

  /** 资产 URL 生成,镜像 Plugin::assets() */
  asset(relativeUri: string): string; // /plugins/{name}/assets/{uri}?v={version}
}
```

**路由注册器**（`configure.routes` 与 `hook.addRoute` 共用）：

```ts
interface RouterRegistrar {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
  any(path: string, handler: RouteHandler): void;
  group(prefix: string, register: (router: RouterRegistrar) => void): void;
}

interface RouteHandler {
  (req: PluginRequest): Promise<Response> | Response;
}

interface PluginRequest {
  url: URL;
  method: string;
  headers: Headers;
  params: Record<string, string>;      // 路径参数 (对应 Laravel 路由参数)
  body: () => Promise<Record<string, unknown>>;  // JSON body
  session: Session | null;             // 已装载会话 (若经过 withWeb)
  user: UserRow | null;                // 已认证用户
  json(data: unknown, status?: number): Response;      // 镜像 json() helper
  redirect(to: string, status?: number): Response;
}
```

插件路由注册进**运行时注册表**，由 Next.js 的 `src/app/api/plugins/[[...path]]/route.ts`
统一分发（注册表按 `method + path` 匹配，`params` 按 `:param` 语法捕获，与原版 Laravel 路由语法一致）。

## 5. 前端注入（RenderingHeader / RenderingFooter）

原版通过 View Composer 在 `shared/head.twig` / `shared/foot.twig` 注入。新版等价物：

- RSC 页面渲染时调用 `composers.collectHead()` / `collectFoot()`，内部 dispatch
  `rendering.header` / `rendering.footer`，将 `contents` 依次 `dangerouslySetInnerHTML` 注入
  `<head>` 与 `</body>` 前（与 Twig `{% for content in contents %}{{ content|raw }}{% endfor %}` 同构）。
- `Hook::addStyleFileToPage` / `addScriptFileToPage` 的 `pages` 匹配语义
  （`request()->is($page)`，支持 `*` 通配）在 `collectHead` 内按当前路径实现，输出与原版一致的
  `<link rel="stylesheet">` / `<script src>` 标签数组。
- 插件资产 URL 由 `asset()` 生成，指向 `/plugins/{name}/assets/*` 静态路由
  （从 R2 插件包存储读取，带 `?v={version}` 缓存破坏参数——对应原版 `Plugin::assets()`）。

## 6. 配置页（config-schema.json）

原版：插件提供 Blade 视图渲染任意表单，POST 到 `/admin/plugins/config/{name}`。
新版：**JSON Schema 自动渲染 + 校验 + 存取**，覆盖原版 95% 场景（开关/文本/下拉/多选/文本域/密码）；
高级场景（联动校验、自定义 UI）预留 `component` 字段指向插件 assets 内编译后的 React 组件
（在配置页动态挂载，`asset()` 获取 URL）。

```jsonc
{
  "$schema": "https://blessing.skin/schemas/config-schema-v1.json",
  "fields": [
    {
      "key": "enable_thing",          // 存储键 (plugin_configs.config_json)
      "label": "twig.plugin.my-plugin.enable_thing",  // 语言包 key 或字面量
      "type": "boolean",              // boolean|string|number|select|textarea|secret
      "default": true,
      "hint": "可选说明 (语言 key)"
    },
    {
      "key": "mode",
      "label": "模式",
      "type": "select",
      "options": [ { "value": "a", "label": "A" }, { "value": "b", "label": "B" } ],
      "default": "a"
    },
    {
      "key": "token",
      "label": "Token",
      "type": "secret",               // 密码框,存库时加密 (复用 ciphers.ts)
      "default": ""
    }
  ]
}
```

- 服务端按 schema 校验（镜像 Laravel validator 规则映射：required/email/min/max/...），
  错误返回 `{ code: 1, message, errors }`（与现有验证错误格式一致）。
- 存储：`plugin_configs` 表（migration 0004 已有），bootstrap.js 通过 `api.config.get()` 读取。
- `views/admin/PluginsManagement` 的"配置"按钮（原版 `SideMenuComposer` 中
  `$plugin->hasConfig()` 才显示）→ 新版 `hasConfig = package.json 或 config-schema.json 存在`。
- 配置页路由 `/admin/plugins/config/{name}` 对齐原版；多语言翻译键约定
  `twig.plugin.{name}.{key}`（原版插件翻译惯例）。

## 7. 插件生命周期与审计

| 操作 | 行为（镜像原版） | 审计 (plugin_audit) |
|---|---|---|
| 安装 (upload/wget) | 校验 zip → 解压 → 校验 package.json → 写 `plugin_manifests` → 触发 `plugin.enabled`? 否（需手动启用，对齐原版） | `install` |
| 启用 | 校验依赖满足 → 加载 bootstrap.js → `plugin.enabled` | `enable` |
| 禁用 | 卸载入口 → `plugin.disabled` | `disable` |
| 更新 | 版本比对（Semver）→ 替换包 → 重新加载 | `update` |
| 卸载 | 移除包与配置 → `plugin.deleted` | `uninstall` |

- `plugins_enabled` 选项兼容原版存储格式（`[{name, version}]`），同时写 `plugin_manifests.enabled`。
- 失败时发送站内通知（对应 `NotifyFailedPlugin`：监听 `plugin.boot-failed` → `sendNotification` 给管理员）。

## 8. 市场协议（对齐原版 MarketController）

原版 `MarketController::fetch()`：读取 `config('plugins.registry')`（逗号分隔 URL，`{lang}` 占位符），
GET 返回 Composer 风格 `{ "packages": [...] }`，每项含 `name/version/require/conflicts/dist.url`。

新版同协议：

- registry 由 secret `PLUGIN_REGISTRY` 配置（替换原版 config 文件），`{lang}` 占位符保留；
- `GET /admin/plugins/market/list` 返回与原版 `marketData()` 相同结构
  （`installed` / `can_update` / `dependencies.{all,unsatisfied}`）；
- `POST /admin/plugins/market/download` 下载 `dist.url` zip → 校验 → 安装（镜像 `download()`）；
- 依赖/冲突解析复用现有 Semver 逻辑（`pages/functions/lib/` 有对应实现可扩展）。

## 9. 安全模型

- 插件代码与主进程同沙箱：无文件系统、无任意网络（出站需平台允许）、无 `process` 访问；
- 插件仅通过 SDK 参数（event/hook/filter/option/route/logger）获得能力，**不注入全局对象**；
- 安装/更新强制校验：zip 包内 `package.json` 合法、`bootstrap.js` 存在、大小与文件数上限；
- `secret` 类型配置加密存储（复用 `ciphers.ts`）；审计表记录全部管理操作；
- 插件路由的请求仍走 `withWeb`（会话+CSRF），认证状态经 `req.user` 透传，插件不得绕过。

## 10. PHP 插件迁移指南（对照示例）

原版 `bootstrap.php`：

```php
use Blessing\Hook;

Hook::addMenuItem('user', 1, [
    'title' => '我的战绩',
    'link' => 'user/stats',
    'icon' => 'fa-trophy',
]);

Hook::addRoute(function ($router) {
    $router->get('user/stats', 'StatsController@index');
});

Hook::addStyleFileToPage(['/plugins/my-plugin/assets/style.css'], ['user/*']);

Event::listen(RenderingHeader::class, function ($event) {
    $event->addContent('<meta name="x-plugin" content="1">');
});
```

新版 `bootstrap.js`：

```js
export function bootstrap({ event, hook }) {
  hook.addMenuItem('user', 1, {
    title: '我的战绩',
    link: 'user/stats',
    icon: 'fa-trophy',
  });

  hook.addRoute((router) => {
    router.get('user/stats', async (req) => {
      return req.json({ code: 0, data: { /* ... */ } });
    });
  });

  hook.addStyleFileToPage(['/plugins/my-plugin/assets/style.css'], ['user/*']);

  event.on('rendering.header', ({ addContent }) => {
    addContent('<meta name="x-plugin" content="1">');
  });
}
```

迁移要点：

| PHP | JS | 备注 |
|---|---|---|
| `bootstrap.php` + Composer autoload | `bootstrap.js` (ESM) | 无 Composer；依赖经 `require` 字段声明 |
| `Event::listen(SomeEvent::class, fn)` | `event.on('some.event', fn)` | 事件名见第 3 节表 |
| `Hook::*` 静态调用 | `hook.*` 参数调用 | 签名一致 |
| `resolve(Filter::class)->add(...)` | `filter.add(...)` | 同名过滤器 |
| `option('key')` | `await option.get('key')` | 异步化 |
| Blade 配置视图 | `config-schema.json` | 见第 6 节 |
| 控制器类 | route handler 函数 | 注册表分发 |
| 语言包 lang/*.php | lang/*.json | 键结构不变 |

## 11. 平台限制对照（原版有、Workers 无）

| 原版能力 | 新版处理 |
|---|---|
| Web CLI（blessing-skin-shell WASM 终端） | 菜单项保留（UI 对齐），点击提示不可用（现有 SPA 同策略） |
| ARGON2I 密码算法 | 不可用；`PWD_METHOD` 不支持该值（同现有移植版） |
| 插件内任意 PHP 扩展（GD 等） | SDK 不提供；图像处理走平台 JS 方案 |
| 插件后台任务/队列 | 无常驻进程；提供 `scheduled` 生命周期事件（Workers Cron）供插件注册 |
