# Blessing Skin → Next.js 架构设计

> 对照原版 [Blessing Skin Server v6.0.2](https://github.com/bs-community/blessing-skin-server)（PHP 8.1 + Laravel 10）
> 的逐层映射设计。部署目标：**Cloudflare Workers**，适配器：**OpenNext**。
> 本文档是 `pages/` 新项目（原 `pages/next/`，已提升为根目录）的实现依据；原 Hono 版
> （`pages/functions/`）+ Vite SPA（`pages/web/`）已按路线图 P5 删除，文中相关路径指
> 迁移源实现，可在 git 历史中查阅。

## 1. 部署形态

```
浏览器 ──► Cloudflare Workers
            ├── Next.js (OpenNext 适配器)
            │     ├── Route Handlers   ← 原 Laravel 路由 (web/api/static)
            │     └── Server Components ← 原 Twig SSR 骨架
            ├── D1    ← MySQL/SQLite
            ├── R2    ← storage/textures (key = sha256 hex)
            └── KV    ← 文件会话 / Cache
```

- `wrangler.toml` 声明 `d1_databases` / `r2_buckets` / `kv_namespaces` 绑定（沿用现有 pages/wrangler.toml 的绑定名与 migration）。
- 所有现有 `pages/migrations/*.sql` **原样复用**，不做 schema 变更。

## 2. 逐层映射表

| 原版 (PHP/Laravel) | 新架构 (Next.js) | 实现说明 |
|---|---|---|
| `routes/web.php` | `src/app/**/route.ts` + `src/lib/server/router.ts` | Route Handlers；会话+CSRF 中间件封装复用 `pages/functions/lib/auth.ts` 逻辑 |
| `routes/api.php` (Passport/OAuth2) | `src/app/api/**/route.ts` | 自研 token 表方案已存在（`pages/functions/routes/api.ts` 移植） |
| `routes/static.php` (Minecraft 接口) | `src/app/(minecraft)/**` Route Handlers | `{player}.json`、`textures/{hash}`、`avatar/*`、`preview/*`；无会话热路径，`Cache-Control` 语义同原版 |
| Yggdrasil API | `src/app/api/yggdrasil/**` | 复用 `pages/functions/routes/yggdrasil.ts` |
| 中间件组 (web: session+csrf, auth, role, verified) | `src/lib/server/middleware.ts` | 路由级封装（`withSession`/`requireAuth`/`requireRole`/`requireVerified`），RSC 页面用服务端 helper 校验 |
| Twig 视图 `resources/views/**` | `src/app/**/page.tsx` (RSC) | **骨架与初始数据由 RSC 渲染**，与 Twig 输出结构一致 |
| React islands `resources/assets/src/views/**` | `src/components/**` (Client Components) | **原文件几乎原样复用**（去掉 `react-hot-loader` 等构建专属 import，`el:` 挂载点改为组件内渲染） |
| View Composers (HeadComposer/FootComposer/SideMenuComposer/UserPanelComposer) | `src/lib/server/composers.ts` | 渲染前收集 header/footer 注入、菜单、徽章、用户面板数据 |
| 事件系统 (Laravel Events) | `src/lib/plugins/events.ts` | 插件运行时事件分发器（见 `02-plugin-sdk.md`） |
| `Blessing\Filter` (blessing/filter 包) | `src/lib/plugins/filter.ts` | 值变换管线：`head_links` / `scripts` / `user_badges` 等 |
| `Blessing\Hook` 门面 | `hook` 命名空间（bootstrap.js 参数） | 镜像静态方法：`addMenuItem` / `addRoute` / `addStyleFileToPage` / `addScriptFileToPage` / `sendNotification` |
| `App\Services\Option` | `src/lib/server/options.ts` | 复用 `pages/functions/lib/options.ts`（D1 表 `options`） |
| `App\Services\PluginManager` | `src/lib/plugins/manager.ts` | 插件生命周期：扫描 manifest → 加载 bootstrap.js → enable/disable/update/uninstall → 审计 |
| Session/Cache (文件) | KV | 复用 `pages/functions/lib/session.ts` |
| GD/Imagick 渲染 | JS 渲染器 | 复用 `pages/functions/lib/renderer.ts`（原 skinrender 算法） |
| SMTP 邮件 | Resend API | 复用现有 `mail` 服务 |
| 安装向导 `setup/*.twig` | `src/app/setup/**` | 后端 API 已存在（`pages/functions/routes/setup.ts`），前端向导页按原版 4 步复刻（welcome → database(适配) → info → finish） |
| 插件市场 (远程 registry) | 同协议 | `PLUGIN_REGISTRY` 配置，Composer 风格 `packages.json` 兼容格式（见 SDK 文档） |

## 3. 渲染模型（关键决策）

原版是 **SSR 骨架 + React islands**：Laravel 控制器渲染完整 HTML（导航/页头/页脚/初始数据），
React 组件通过 `el:` 选择器挂载到骨架中的空容器交互。

Next.js 的 **RSC + Client Components** 是它的自然对应：

```
原版:  Twig 骨架 ──ReactDOM.render──► React island (el: '#players-list')
新版:  page.tsx (RSC) ──<ClientComp/>──► 同一 React 组件 (不再需要 el 挂载)
```

因此：

- `views/` 下已移植的 React 组件（衣橱、玩家管理、举报、翻译、插件管理等）**全部直接复用**，
  仅需把 `useMount`/`useEmitMounted` 的挂载语义改为正常组件渲染。
- `pages/` 下自建 SPA 页（Home/Profile/Bind/Verify/AdminOptions/AdminStatus 等）**逐个重写为 RSC 页面**，
  骨架结构对照原版 Twig 模板（`resources/views/**/*.twig`）。
- 服务端数据：RSC 直接查 D1（同进程），不再需要"页面数据端点 + 前端 fetch"。

## 4. 目录结构

```
pages/
├── wrangler.toml              # OpenNext + D1/R2/KV 绑定 (复用现有绑定名)
├── migrations/                # 复用现有 D1 migrations
├── src/
│   ├── app/                   # App Router (RSC 页面 + Route Handlers)
│   │   ├── page.tsx           # 首页 (home.twig)
│   │   ├── auth/              # login/register/forgot/reset/bind/verify
│   │   ├── skinlib/           # 列表/show/{tid}/upload
│   │   ├── user/              # 仪表盘/closet/player/profile/reports/oauth
│   │   ├── admin/             # 仪表盘/users/players/reports/customize/i18n/
│   │   │                      #   score/options/resource/status/plugins/*/update
│   │   ├── setup/             # 安装向导 (welcome/database/info/finish)
│   │   ├── oauth/authorize    # Passport 授权页
│   │   ├── api/               # OAuth2 token / yggdrasil / 管理 API
│   │   └── (minecraft)/       # {player}.json / textures / avatar / preview / csl
│   ├── components/            # Client Components (原 views/ 直接复用)
│   ├── lib/
│   │   ├── server/            # options/session/auth/oauth/renderer/mail/composers
│   │   ├── plugins/           # 事件分发器/Filter/PluginManager/市场/资产服务
│   │   └── i18n/              # 语言包 (复用现有构建脚本产物)
│   ├── hooks/                 # 服务端数据访问 hooks (RSC 用)
│   ├── styles/                # adminlte/spectre/自定义 CSS (复用现有)
│   └── types/                 # 共享类型 (复用 pages/functions/lib/types.ts)
├── public/                    # 静态资产 (字体/图片/favicon/plugins assets)
└── plugins/                   # 本地插件目录 (zip 解压后存放, 或 R2 挂载)
```

## 5. 会话与 CSRF（对齐原版 web 中间件组）

复用 `pages/functions/lib/auth.ts` 的既有实现（KV 会话 + 双 token CSRF + cookie 语义），
封装为 Next.js 中间件形态：

- `withWeb(handler)` — 会话装载 + CSRF 校验（对应 Laravel `web` 中间件组）
- `requireAuth` / `requireRole('admin')` / `requireVerified` — 对应 `authorize` / `role:admin` / `verified`
- 数据端点校验失败返回 `{ code: 1, message }` JSON，与现有前端 `net.ts` 约定一致
- RSC 页面守卫：服务端组件内直接检查 `getSession()`，未授权 `redirect('/auth/login?redirect=...')`

## 6. 静态接口（Minecraft 热路径）

`{player}.json` / `csl/{player}.json` / `textures/{hash}` / `raw/{tid}` / `avatar/*` / `preview/*`
全部为 Route Handler，**不经过会话/CSRF**：

- `Cache-Control`: `public, max-age=...` 语义与原版 `Cache-Control` 中间件一致
- 预览输出默认 PNG（workerd 无 WebP 编码器），保留 `?png` 显式参数
- 渲染缓存存 KV（TTL 语义同原版文件缓存）

## 7. 语言包

- 服务端：`src/lib/i18n/` 使用现有 `scripts/build-lang.mjs` 生成的 `functions/lib/lang/*.json`
- 客户端：保留 `lang/{locale}.js` 静态文件 + `window.blessing.i18n` 注入机制（SPA 已实现）
- RSC 页面直接用服务端字典渲染，Client Components 用现有 `scripts/i18n.ts` 的 `t()`
- 插件语言包：插件 zip 内 `lang/{locale}.json` 合并进运行时字典（对应原版插件 lang 目录）

## 8. 与现有移植版的关系

| 现有资产 | 去向 |
|---|---|
| `pages/functions/lib/*`（options/ciphers/session/auth/oauth/renderer/i18n/validate...） | 直接迁入 `src/lib/server/`（Hono 的 `c` 上下文替换为 Next 的 `request`/`NextResponse`） |
| `pages/functions/routes/*` | 迁移为 Route Handlers（业务语义不变） |
| `pages/web/src/views/**` | 迁入 `src/components/`（client components） |
| `pages/web/src/pages/*` | 重写为 RSC 页面（对照 Twig 骨架） |
| `pages/web/src/styles/*` | 迁入 `src/styles/`（含 adminlte/spectre/fontawesome 依赖） |
| `pages/migrations/*` | 复用 |
| `pages/scripts/*`（lang 构建/迁移工具/冒烟测试） | 复用，冒烟测试改为打 `next build` 产物 |
| `pages/functions/[[path]].ts` + `pages/web` | 已按 P5 出口标准删除（legacy 对照在 git 历史中保留） |
