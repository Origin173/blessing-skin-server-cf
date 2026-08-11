
## 完整验证 (2026-08-10)

全部迁移任务完成。最终验证: `node scripts/smoke-e2e.mjs` 37 项断言全绿 (认证/用户中心/皮肤库上传/Minecraft 静态接口/全部页面访问/管理后台) + 插件 SDK 冒烟 (ping 路由/header 注入) + setup/oauth 页面可达。

本地运行: `npx opennextjs-cloudflare build && npx wrangler dev .open-next/worker.js --port 8815 --local --persist-to .wrangler-test`

## 完整验证 (2026-08-11)

全部迁移任务完成 (含 legacy 移除与 OAuth2 收尾):

- `scripts/smoke-e2e.mjs`: **37 项断言全绿** (认证/用户中心/皮肤库上传/Minecraft 静态接口/页面访问/管理后台)
- `scripts/oauth-test.mjs`: **13 项断言全绿** (client_credentials/password/refresh_token/authorization_code 全流程 + Bearer 资源访问)
- 插件 SDK 冒烟: ping 路由 / header 注入 / 市场页可达
- legacy (pages/functions + pages/web) 已移除, CI 更新为 OpenNext 构建

本地运行: `npx opennextjs-cloudflare build && bash scripts/final-verify.sh`

## 目录重组 (2026-08-11)

- `next/` 内容已提升为 `pages/` 根目录 (本目录即 Next.js 项目), 旧版 Hono/SPA 残留全部移除
- 构建产物已从 git 移除跟踪 (见 `.gitignore`); D1 migrations 保持在 `migrations/` 供远程执行
- CI: `.github/workflows/cf-pages.yml` 工作目录为 `pages`, push `main` 自动 `wrangler deploy` 到 Workers (`blessing-skin-next`)
