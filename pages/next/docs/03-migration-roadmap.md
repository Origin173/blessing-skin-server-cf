# 迁移路线图（对照原版逐页复刻）

> 进度对照表：每一行是原版的一个 Twig 页面/路由组，标注其在 Next.js 中的落点与完成状态。
> 完成标准：页面结构与原版 Twig 输出一致（对照 `resources/views/**`）、交互与 React 组件一致
> （对照 `resources/assets/src/views/**`）、API 语义与控制器一致（对照 `app/Http/Controllers/**`）。

## 阶段划分

| 阶段 | 内容 | 出口标准 | 状态 |
|---|---|---|---|
| **P0 脚手架** | `pages/next/` 初始化：OpenNext + wrangler.toml（复用绑定）+ D1 migrations + 会话/CSRF + 插件运行时骨架（事件分发/Filter/PluginManager/注册表）+ 布局（Layout RSC 对应 base.twig + adminlte 样式）+ 语言包 | `next build` 通过；`/` 与 `/auth/login` 可访问；插件 SDK 冒烟（示例插件注入 header） | ✅ 完成 (2026-08-10) |
| **P1 核心链路** | 首页、auth（login/register/forgot/reset/bind/verify）、skinlib（列表/show/upload）、texture 管理、静态接口（.json/textures/avatar/preview） | 原版 70% 用户路径可用；冒烟测试全绿 | ⬜ |
| **P2 用户中心** | user 仪表盘（签到/积分）、closet、player、profile、reports、oauth 管理 | 用户功能 100% 对齐 | ⬜ |
| **P3 管理后台** | admin 仪表盘（图表）、users、players、reports、i18n、customize、score、options、resource、status | 管理功能 100% 对齐 | ⬜ |
| **P4 插件系统** | 插件运行时完善（市场/上传/配置页/生命周期/审计）、插件市场 UI、示例插件 | SDK 文档 §3–§8 全部落地 | ⬜ |
| **P5 收尾** | setup 向导页（对照 setup/wizard/*.twig）、update 检查页、OAuth2 全流程验证、legacy 移除 | 与原版功能清单 100% 对照通过 | ⬜ |

## 页面对照清单

图例：🟦 原版 Twig 页面 · 🟩 原版 React 组件 · 状态 = 待迁移 / 已规划

### 公开页

| 原版 (路由 → 视图) | Next.js 落点 | 阶段 |
|---|---|---|
| `/` → `home.twig` + `homePage.ts` | `app/page.tsx`（RSC 骨架）+ `components/home/` | P1 |
| `/skinlib` → `skinlib/index.twig` + `views/skinlib/SkinLibrary/*` | `app/skinlib/page.tsx` + `components/skinlib/SkinLibrary` | P1 |
| `/skinlib/show/{texture}` → `skinlib/show.twig` + `views/skinlib/Show/*` | `app/skinlib/show/[tid]/page.tsx` + 同组件 | P1 |
| `/skinlib/upload` → `skinlib/upload.twig` + `views/skinlib/Upload.tsx` | `app/skinlib/upload/page.tsx` + 同组件 | P1 |
| `/texture/{texture}` → 重定向 show | `app/texture/[tid]/route.ts` 302 | P1 |

### 认证

| 原版 | Next.js 落点 | 阶段 |
|---|---|---|
| `/auth/login` → `auth/rows/login/*` + `views/auth/Login.tsx` | `app/auth/login/page.tsx` + 同组件 | P1 |
| `/auth/register` → 同 + `Registration.tsx` | `app/auth/register/page.tsx` | P1 |
| `/auth/forgot` → `auth/rows/forgot/*` + `Forgot.tsx` | `app/auth/forgot/page.tsx` | P1 |
| `/auth/reset/{uid}` → `reset.twig` + `Reset.tsx` | `app/auth/reset/[uid]/page.tsx` | P1 |
| `/auth/bind` → `auth/bind.twig` | `app/auth/bind/page.tsx` | P1 |
| `/auth/verify/{user}` → `auth/verify.twig` | `app/auth/verify/[uid]/page.tsx` | P1 |
| `/auth/captcha` (SVG) | Route Handler | P1 |

### 用户中心

| 原版 | Next.js 落点 | 阶段 |
|---|---|---|
| `/user` → `user/index.twig` + `views/user/Dashboard/*` | `app/user/page.tsx` + 同组件 | P2 |
| `/user/closet` → `user/closet.twig` + `views/user/Closet/*` | `app/user/closet/page.tsx` + 同组件 | P2 |
| `/user/player` → `user/player.twig` + `views/user/Players/*` | `app/user/player/page.tsx` + 同组件 | P2 |
| `/user/profile` → `user/profile.twig`（表单 SSR）+ `views/user/profile/*` | `app/user/profile/page.tsx`（表单 RSC）+ 同组件 | P2 |
| `/user/reports` → `user/report.twig` | `app/user/reports/page.tsx` | P2 |
| `/user/oauth/manage` → `user/oauth.twig` + `views/user/OAuth/*` | `app/user/oauth/manage/page.tsx` + 同组件 | P2 |
| 通知（`NotificationsList` widget） | `components/widgets/NotificationsList` | P2 |

### 管理后台

| 原版 | Next.js 落点 | 阶段 |
|---|---|---|
| `/admin` → `admin/index.twig` + `views/admin/Dashboard.ts` | `app/admin/page.tsx` + 同组件 | P3 |
| `/admin/users` → `admin/users.twig` + `views/admin/UsersManagement/*` | `app/admin/users/page.tsx` + 同组件 | P3 |
| `/admin/players` → `admin/players.twig` + `views/admin/PlayersManagement/*` | `app/admin/players/page.tsx` + 同组件 | P3 |
| `/admin/reports` → `admin/reports.twig` + `views/admin/ReportsManagement/*` | `app/admin/reports/page.tsx` + 同组件 | P3 |
| `/admin/i18n` → `admin/i18n.twig` + `views/admin/Translations/*` | `app/admin/i18n/page.tsx` + 同组件 | P3 |
| `/admin/customize` → `admin/customize.twig` + `views/admin/Customization.ts` | `app/admin/customize/page.tsx`（RSC 表单）+ 同组件 | P3 |
| `/admin/score` → `admin/score.twig` | `app/admin/score/page.tsx` | P3 |
| `/admin/options` → `admin/options.twig` | `app/admin/options/page.tsx` | P3 |
| `/admin/resource` → `admin/resource.twig` | `app/admin/resource/page.tsx` | P3 |
| `/admin/status` → `admin/status.twig` | `app/admin/status/page.tsx` | P3 |
| `/admin/plugins/manage` → `admin/plugins.twig` + `views/admin/PluginsManagement/*` | `app/admin/plugins/manage/page.tsx` + 同组件 | P4 |
| `/admin/plugins/market` → `admin/market.twig` + `views/admin/PluginsMarket/*` | `app/admin/plugins/market/page.tsx` + 同组件 | P4 |
| `/admin/plugins/config/{name}` → Blade 插件视图 | `app/admin/plugins/config/[name]/page.tsx`（schema 渲染） | P4 |
| `/admin/plugins/readme/{name}` → `admin/plugin/readme.twig` | `app/admin/plugins/readme/[name]/page.tsx` | P4 |
| `/admin/update` → `admin/update.twig` + `views/admin/Update.ts` | `app/admin/update/page.tsx` + 同组件 | P5 |

### 安装/系统

| 原版 | Next.js 落点 | 阶段 |
|---|---|---|
| `/setup` wizard（welcome/database/info/finish）→ `setup/wizard/*.twig` | `app/setup/**`（database 步骤适配为绑定检查） | P5 |
| `/oauth/authorize`（Passport） | `app/oauth/authorize/page.tsx` | P1 |
| `/.well-known/change-password` → redirect | Route Handler 302 | P1 |
| 错误页 `errors/{403,404,500,503}.twig` | `app/error.tsx` / `not-found.tsx` / 403 页 | P3 |

### API 层（Route Handlers，非页面）

| 原版 | Next.js 落点 | 阶段 |
|---|---|---|
| `routes/static.php`（.json/textures/raw/avatar/preview/csl） | `app/(minecraft)/**` | P1 |
| `routes/api.php`（OAuth2 Passport + user/players/closet/admin 作用域 API） | `app/api/**` | P2 |
| Yggdrasil API | `app/api/yggdrasil/**` | P1 |
| 插件市场 API | `app/api/plugins/**` | P4 |
| setup API | `app/setup/*/route.ts` | P5 |

## 每阶段验收

- P0：`next build` + `wrangler pages dev` 起服务；登录页可渲染；示例插件注入 header 成功
- P1–P3：每页对照 Twig 骨架结构与组件行为；`scripts/smoke-test.mjs` 迁移到新端口全绿
- P4：插件市场端到端（上传 → 启用 → 配置 → 钩子生效 → 审计）
- P5：与原版功能清单逐项对照（附对照表验收记录）；删除 `pages/legacy/`
