# Blessing Skin Server → Cloudflare Pages 移植

将 [Blessing Skin Server v6.0.2](https://github.com/bs-community/blessing-skin-server)(PHP/Laravel 10)
全量移植到 Cloudflare 原生栈:

| 原架构 | 新架构 |
|---|---|
| PHP 8.1 + Laravel 10 (Apache/PHP-FPM) | **Pages Functions** (TypeScript + Hono,运行于 Workers) |
| MySQL / SQLite | **D1** (SQLite 兼容) |
| 本地磁盘 `storage/textures/` | **R2** (对象 key = sha256 hex) |
| Laravel 文件会话 / Cache | **KV** |
| Twig 服务端渲染 + React islands | **React SPA** (Vite,复用原组件) |
| GD / Imagick 皮肤渲染 | 纯 JS 3D 渲染器 (原 skinrender 算法移植) |
| SMTP 邮件 | Resend API (可选 SMTP) |
| Laravel Passport (OAuth2) | 等价 Token 表实现 (authorization_code / password / refresh / client_credentials) |

**已移除**: PHP 插件系统、插件市场、自动更新、安装向导(由 wrangler 配置取代)。

## 目录结构

```
pages/
├── wrangler.toml          # D1/R2/KV 绑定与配置
├── migrations/            # D1 schema (由 Laravel 迁移转换) + options 种子
├── functions/
│   ├── [[path]].ts        # 统一入口 (静态放行 / 路由分发 / SPA 回退)
│   ├── lib/               # options/ciphers/session/auth/oauth/renderer/i18n...
│   └── routes/            # web (业务) / static (Minecraft 接口) / api (OAuth2) / oauth / admin
├── web/                   # React SPA (Vite,src 为原站 resources/assets/src 移植)
├── scripts/
│   ├── build-lang.mjs     # 服务端语言包 (functions/lib/lang/*.json)
│   ├── build-lang-js.mjs  # 前端语言文件 (web/public/lang/*.js)
│   ├── smoke-test.mjs     # API 冒烟测试
│   └── migrate/           # 数据迁移工具
└── test/                  # vitest (待启用)
```

## 本地开发

```bash
cd pages
npm install
npm run build:lang        # 生成语言包 (读仓库根 resources/lang)
npm run build:lang-js     # 生成前端语言文件
npx wrangler d1 migrations apply blessingskin --local   # 初始化本地 D1
npm run build:web         # 构建 SPA
npx wrangler pages dev web/dist   # 本地开发服务器 (http://localhost:8788)
node scripts/smoke-test.mjs       # API 冒烟测试 (SMOKE_STATIC=1 启用静态接口断言)
```

前端热更新: 另开终端 `cd web && npm run dev`(Vite :3000,代理到 :8788)。

## 部署

```bash
cd pages
npx wrangler d1 create blessingskin            # 首次: 创建 D1,填入 wrangler.toml
npx wrangler kv namespace create KV            # 首次: 创建 KV,填入 wrangler.toml
npx wrangler r2 bucket create blessingskin-textures
npx wrangler d1 migrations apply blessingskin --remote
npm run deploy                                  # 构建 + pages deploy
```

机密配置 (`wrangler secret put <名称>`):
- `PWD_METHOD` — 密码哈希算法 (与原站 .env 一致,默认 BCRYPT)
- `SALT` — 加盐哈希变体的盐 (原站 .env SALT)
- `APP_KEY` — 签名 URL 密钥 (密码重置/邮箱验证,须与原站一致)
- `PASSPORT_PRIVATE_KEY` / `PASSPORT_PUBLIC_KEY` — OAuth2 密钥 (迁移自 storage/oauth-*.key)
- `RESEND_API_KEY` / `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` — 邮件

## 数据迁移 (从旧站)

1. **数据库**: `DB_*` 环境变量配置旧站 MySQL 后执行
   `node scripts/migrate/export.mjs > dump.sql`,然后
   `npx wrangler d1 execute blessingskin --file=dump.sql --remote`
2. **纹理文件**: `node scripts/migrate/upload-textures.mjs <旧站 storage/textures>`
   (需 R2 S3 兼容凭据,或 `--wrangler` 模式)
3. **密钥**: 迁移 `storage/oauth-*.key` 与 .env 的 `APP_KEY`/`SALT`/`PWD_METHOD` 为 secrets
4. 用户会话不迁移(需重新登录);密码哈希原样保留,登录自动兼容

## 已知差异

- 预览/头像默认输出 PNG(原站默认 WebP;workerd 无 WebP 编码器,前端已内置 `?png` 回退)
- `ARGON2I` 密码算法不可用(workerd 禁运行时 WASM),使用该算法的站点需改 `PWD_METHOD`
- 渲染缓存存 KV(原站为文件缓存),TTL 语义一致
