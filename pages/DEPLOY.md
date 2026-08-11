# 部署教程 — Blessing Skin → Cloudflare Pages 实战验证

本文从零开始,把本仓库 `pages/` 部署到一个真实的 Cloudflare Pages 站点,
每一步都带**验证点**,照着做即可确认移植版真实可用。

> 适用版本: Blessing Skin Server v6.0.2 移植版 (Pages Functions + D1 + R2 + KV + React SPA)

---

## 0. 前置条件

| 项目 | 要求 |
|---|---|
| Node.js | **≥ 22**(冒烟测试依赖 `node:sqlite`,CI 也用 22) |
| npm | ≥ 10 |
| Cloudflare 账号 | 免费套餐即可(D1 免费 5GB / R2 免费 10GB / KV 免费 10 万读) |
| wrangler | 本项目 devDependency,用 `npx wrangler` 即可,无需全局安装 |
| 域名 | 非必需 —— 默认 `*.pages.dev` 即可验证;正式域名可后配 |

安装依赖(Windows 上 `admin-lte` 的 postinstall 会跑 husky 失败,属已知问题):

```bash
cd pages
npm install --ignore-scripts        # 跳过 husky/esbuild 脚本
npx esbuild --version               # 手动完成 esbuild 二进制安装(输出版本号即成功)
```

**验证点 ①**: `npx wrangler --version` 输出版本号;`node -v` ≥ 22。

---

## 1. 本地构建 + 冒烟测试(不需要 Cloudflare 账号)

先在本地跑通全流程,确认代码本身没问题:

```bash
cd pages
npm run build:lang          # 生成服务端语言包 → 应输出 13 个 locale
npm run build:lang-js       # 生成前端语言文件 → 13 个文件
npm run typecheck           # → TYPECHECK OK
npm run build:web           # → ✓ built in ~6s (web/dist)

npx wrangler d1 migrations apply blessingskin --local   # 初始化本地 D1(20 条迁移)
```

启动本地服务器(保持运行):

```bash
npx wrangler pages dev web/dist        # http://localhost:8788
```

新开终端跑 22 项冒烟测试:

```bash
node scripts/smoke-test.mjs
# → 期望输出 22 项全部 ✓ (注册/登录/签到/上传/衣柜/皮肤库/纹理/头像/预览/OAuth 等)
```

**验证点 ②**: 冒烟测试 22/22 通过。之后浏览器打开 `http://localhost:8788`
手动走一遍:首页 → 注册(填图形验证码)→ 登录 → 仪表盘 → 皮肤库。

---

## 2. 登录 Cloudflare + 创建资源

```bash
npx wrangler login            # 浏览器授权
npx wrangler whoami           # 确认已登录(显示账号与账户 ID)
```

创建三个资源(命令输出里的 ID 要抄下来):

```bash
npx wrangler d1 create blessingskin
# → database_id: <xxxx-xxxx-...>    ← 记下

npx wrangler kv namespace create KV
# → id: <yyyy...>                   ← 记下
# 注意: 输出里可能还有 preview_id,只把主 id 填进 wrangler.toml

npx wrangler r2 bucket create blessingskin-textures
```

> KV 命名空间**只能创建一次**;如果 `create KV` 报已存在,用
> `npx wrangler kv namespace list` 查已有 id。
>
> **重要 — binding 名不能随意改**:代码里通过 `env.DB` / `env.TEXTURES` /
> `env.KV` 访问绑定。若你在 wrangler.toml 里把 binding 改成别的名字
> (如 `KV-skin`),必须同步修改代码中所有 `env.KV` 引用,否则运行时
> `env.KV` 为 undefined,所有请求 500。改名后本地需重跑
> `npx wrangler d1 migrations apply blessingskin --local`(binding 变化会
> 创建新的本地实例,旧数据不自动迁移)。

**验证点 ③**: 三个命令全部返回成功;Dashboard 的 Workers & Pages → 左侧
D1 / KV / R2 里能看到 `blessingskin`、`KV`、`blessingskin-textures`。

---

## 3. 填 wrangler.toml

编辑 `pages/wrangler.toml`,替换两处占位符:

```toml
[[d1_databases]]
binding = "DB"
database_name = "blessingskin"
database_id = "<刚才的 database_id>"    # ← 替换 "local"

[[kv_namespaces]]
binding = "KV"
id = "<刚才的 KV id>"                    # ← 替换 "local"
```

R2 bucket 不需要填 id(bucket_name 已够)。

**验证点 ④**: `npx wrangler pages dev web/dist` 仍能启动(说明配置语法正确),
且本地 D1 数据不受影响。

---

## 4. 应用远程 D1 迁移

```bash
npx wrangler d1 migrations apply blessingskin --remote
# → 期望输出 Applied 20 migrations successfully
```

**验证点 ⑤**: 输出 `20 migrations`;或在 Dashboard D1 → blessingskin → Console
执行 `SELECT count(*) FROM sqlite_master WHERE type='table';` 应返回 ≥ 20。

---

## 5. 配置机密(secrets)

除 `PWD_METHOD`(在 `[vars]` 里,默认 BCRYPT)外,其余全部用 secret:

```bash
# 必须: 密码哈希算法 —— 若旧站 .env 里 PWD_METHOD 不是 BCRYPT,必须填一致的值,
# 否则旧用户无法登录(新注册不受影响)
npx wrangler secret put PWD_METHOD
# → 输入 BCRYPT(或与旧站一致的值)

# 必须: 签名 URL 密钥(HMAC)—— 密码重置/邮箱验证链接签名用。
# 新站可随意生成;要兼容旧站发出的链接,则填旧站 .env 的 APP_KEY
npx wrangler secret put APP_KEY
# → 输入任意 32+ 字符随机串,例如: openssl rand -hex 32 的输出

# 加盐哈希算法(仅当 PWD_METHOD 是 SALTED2MD5 / SALTED2SHA256 / SALTED2SHA512 时需要)
npx wrangler secret put SALT
# → 输入与旧站 .env 一致的 SALT;纯新站可不设

# OAuth2 JWT 密钥(可选) —— 兼容旧站已签发的 access token 才需要,
# 否则可直接跳过;迁移旧站 storage/oauth-private.key 与 oauth-public.key 时用:
npx wrangler secret put PASSPORT_PRIVATE_KEY --file=storage/oauth-private.key
npx wrangler secret put PASSPORT_PUBLIC_KEY --file=storage/oauth-public.key

# 邮件(可选) —— 不配置则"忘记密码/邮箱验证"功能在前端禁用,其余功能正常
npx wrangler secret put RESEND_API_KEY     # 如 re_xxxxxxxx
npx wrangler secret put MAIL_FROM_ADDRESS  # 如 no-reply@example.com
npx wrangler secret put MAIL_FROM_NAME     # 如 Blessing Skin
```

> `wrangler secret put` 在 **Pages 项目创建之后**才能生效,因此本步也可以放到
> 第 6 步部署完成后执行——顺序无所谓,但第 6 步之前 `secret` 可能还不可用。
> 推荐: 先跳过本步,部署完成后立刻补 secret,然后重新部署一次。

---

## 6. 创建 Pages 项目并部署

```bash
cd pages
npx wrangler pages project create blessing-skin --production-branch=main
# → 选生产分支 main(与 CI 一致)
npm run deploy
```

`npm run deploy` 实际执行:

```bash
npm run build:lang && npm run build:lang-js && npm run build:web \
  && wrangler pages deploy web/dist --project-name=blessing-skin
```

部署输出末尾会给出生产 URL(类似 `https://blessing-skin-xxxx.pages.dev`)。

**验证点 ⑥**: 输出 `Uploaded functions`(Functions 已包含)与
`Deployment complete! Take a peek over at https://...pages.dev`。

> 如果项目此前已存在(比如 CI 建过),`project create` 会报
> "project already exists",忽略即可,直接 `npm run deploy`。

---

## 7. 补 secret 并重新部署

```bash
# 第 5 步若跳过了,现在执行(命令同上)
npx wrangler secret put APP_KEY
# ... 其余 secret ...

npm run deploy     # secrets 在下次部署时生效
```

---

## 8. 生产环境验证清单(逐个打勾)

浏览器打开生产 URL,或命令行替换 `https://你的项目.pages.dev` 执行:

| # | 检查项 | 期望结果 |
|---|---|---|
| 1 | 打开首页 | 渲染正常,导航栏/公告在,无白屏(控制台无报错) |
| 2 | `curl -i https://...pages.dev/` | `200`,HTML 含 `<div id="app">` |
| 3 | `curl -i https://...pages.dev/assets/...`(首页引用的静态资源) | `200`,`cache-control: public, max-age=...` |
| 4 | 注册新用户 | 图形验证码正常显示,提交成功,积分 = 1000 |
| 5 | 退出 → 重新登录 | 成功 |
| 6 | 仪表盘 → 签到 | 积分增加(10~100 随机) |
| 7 | 上传皮肤 | 有积分成本提示,上传成功,皮肤库出现新条目 |
| 8 | 皮肤库 → 打开详情 | 3D 预览渲染(头/身体/手臂/腿) |
| 9 | 衣柜 → 绑定/移除/设为头像 | 全部生效;头像显示 |
| 10 | `curl https://...pages.dev/<玩家名>.json` | 返回该玩家皮肤/披风 JSON(CustomSkinAPI) |
| 11 | `curl -i https://...pages.dev/textures/<sha256>` | `200` + `Content-Type: image/png` |
| 12 | `curl -I https://...pages.dev/raw/<纹理tid>` | 原图下载 PNG(`/raw/:tid`,tid 为纹理数字 ID) |
| 13 | `curl -I https://...pages.dev/avatar/<玩家名>?size=64` | `200` 头像 PNG |
| 14 | `curl -I https://...pages.dev/preview/<玩家名>?height=200` | `200` 3D 预览 PNG |
| 15 | 管理后台(`/admin`) | 需管理员账号;仪表盘 echarts 图表、用户列表、选项页正常 |
| 16 | 用户管理 → 封禁一个测试号 | 该号立即无法登录(401 用户被禁用) |
| 17 | 不存在的页面(如 `/nope/abc`) | SPA 回退,显示 404 页面而不是 JSON |

**OAuth2 验证**(可选,需要先建客户端):

```bash
# 用仪表盘里的 token 或直接查 D1:
npx wrangler d1 execute blessingskin --remote --command \
  "INSERT INTO oauth_clients (id,user_id,name,secret,redirect,personal_access_client,password_client,revoked,created_at,updated_at) VALUES ('client-1',NULL,'test',sha1(randomblob(16)),'http://localhost',0,1,0,datetime('now'),datetime('now'))"

# 然后:
curl -X POST https://...pages.dev/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"password","client_id":"client-1","client_secret":"<上一步输出的secret>","username":"<邮箱>","password":"<密码>","scope":""}'
# → 期望返回 access_token / refresh_token / expires_in
```

**验证点 ⑦**: 上表 1-17 全过。OAuth 拿到 token 后:
`curl -H 'Authorization: Bearer <token>' https://...pages.dev/api/user` → 返回用户信息。

---

## 9. (可选) 从旧站迁移真实数据

### 9.1 数据库

```bash
cd pages
DB_HOST=<旧站MySQL地址> DB_PORT=3306 DB_DATABASE=blessingskin \
DB_USERNAME=<用户名> DB_PASSWORD=<密码> \
node scripts/migrate/export.mjs > dump.sql

# 上传到 D1(注意: options 表也会被覆盖,site_url 等按旧站恢复)
npx wrangler d1 execute blessingskin --file=dump.sql --remote
```

**验证**: `npx wrangler d1 execute blessingskin --remote --command "SELECT count(*) FROM users"` 等于旧站用户数。

### 9.2 纹理文件(R2)

方式 A(S3 兼容端点,推荐 —— Dashboard → R2 → 管理 API 令牌,创建有
"对象读+写"权限的令牌):

```bash
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com \
S3_ACCESS_KEY_ID=<access key> S3_SECRET_ACCESS_KEY=<secret> \
S3_BUCKET=blessingskin-textures \
node scripts/migrate/upload-textures.mjs <旧站 storage/textures 路径>
```

方式 B(慢但不用建令牌):

```bash
node scripts/migrate/upload-textures.mjs <旧站路径> --wrangler
```

**验证**: 上传后再跑一遍(会自动跳过已存在对象);Dashboard R2 对象数与
旧站 `storage/textures` 文件数一致。

### 9.3 密钥一致性(重要)

- `PWD_METHOD` / `SALT` 必须与旧站 `.env` 一致,旧用户才能登录;
- `APP_KEY` 与旧站一致,旧站发出的密码重置链接才有效;
- `PASSPORT_*` 与旧站 `storage/oauth-*.key` 一致,已签发的 OAuth token 才有效。

---

## 10. 配置正式域名(可选)

1. Dashboard → Workers & Pages → `blessing-skin` → 自定义域 → 添加自定义域
2. 按提示在 DNS 处加 CNAME 指向 `blessing-skin.pages.dev`
3. 在 **设置 → 环境变量** 里加 `site_url` 没有用 —— 本站点 URL 类选项在
   D1 的 `options` 表里,执行:

```bash
npx wrangler d1 execute blessingskin --remote --command \
  "UPDATE options SET value='https://你的域名' WHERE name='site_url'"
```

---

## 11. 日常更新:代码修改后如何部署

站点上线后,每次代码更新按以下流程部署:

### 11.1 本地验证(修改代码后必做)

```bash
cd pages
npm run build:lang        # 语言包变更时 (resources/lang 或 build-lang 脚本)
npm run build:lang-js     # 同上,前端语言文件
npm run typecheck         # TS 类型检查
npm run build:web         # 构建 SPA

# 本地起服务跑冒烟测试 (22 项 API 检查)
npx wrangler pages dev web/dist   # 终端 1
node scripts/smoke-test.mjs       # 终端 2,期望"全部通过 ✅"
```

### 11.2 部署到生产

```bash
cd pages
npm run deploy
```

`npm run deploy` 等价于:

```bash
npm run build:lang && npm run build:lang-js && npm run build:web \
  && wrangler pages deploy web/dist --project-name=blessing-skin
```

输出 `Deployment complete!` 即成功。**没有新部署 URL 需要记——域名不变**,
旧版本自动被新版本替换。

### 11.3 有数据库结构变更时(新增 migrations/*.sql)

```bash
cd pages
npx wrangler d1 migrations apply blessingskin --remote
# 期望输出新迁移文件全部 ✅,再执行 npm run deploy
```

> 没有新增迁移文件时**跳过**这步。数据变更(如改选项值)用
> `npx wrangler d1 execute blessingskin --remote --command "..."` 直接执行,无需部署。

### 11.4 修改了 secrets 时

```bash
npx wrangler secret put <名称>     # 如 APP_KEY
npm run deploy                     # secrets 在下次部署时生效,必须重新部署
```

### 11.5 缓存说明(重要,部署后不用清任何东西)

| 资源 | 缓存策略 | 更新后行为 |
|---|---|---|
| `/app/*`(JS/CSS) | `immutable` 一年 | 文件名带内容 hash,**新部署自动换新文件**,旧文件虽留在 CDN 但无人引用 |
| `/lang/*.js` | `no-cache` | 每次请求 revalidate,ETag 变化即更新 |
| HTML(SPA fallback) | `max-age=0, must-revalidate` | 每次访问取最新 |

**唯一例外**:用户浏览器可能仍停留在旧页面(打开的旧标签页),**刷新即可**。
若用户反馈"页面行为像旧版"(如注册页显示异常),让 TA 强刷一次
(Ctrl+Shift+R / Cmd+Shift+R),或部署后自己用无痕窗口验证一遍。

### 11.6 部署后快速验证(1 分钟)

```bash
# 1. 首页可访问
curl -s -o /dev/null -w "%{http_code}\n" -H "Accept: text/html" https://<项目>.pages.dev/
# 2. 新 bundle 已生效 (对比部署前的 hash)
curl -s https://<项目>.pages.dev/ | grep -o 'index-[^"]*\.js'
# 3. 注册页数据正常 (player: true = 角色名模式开启)
curl -s -H "Accept: application/json" https://<项目>.pages.dev/auth/register | head -c 200
# 4. API 健康
curl -s https://<项目>.pages.dev/api/health
```

浏览器再过一遍:首页 → 注册页(确认表单完整)→ 登录 → 皮肤库。

---

## 12. 常见问题

| 现象 | 处理 |
|---|---|
| `npm install` 报 husky/admin-lte postinstall 失败 | `npm install --ignore-scripts` + `npx esbuild --version` |
| `wrangler pages dev` 报 D1 找不到 | 先跑 `npx wrangler d1 migrations apply blessingskin --local` |
| 部署后页面 404 白屏 | 确认是 `wrangler pages deploy web/dist` 且先构建过 `npm run build:web` |
| 注册/表单提交报"XXX 不能为空"但明明填了 | **浏览器缓存了旧 JS**:Ctrl+Shift+R 强刷;或重新 `npm run deploy`(新 hash 自动失效) |
| 页面行为像旧版(角色名框变昵称框等) | 同上 —— 旧标签页刷新即可;验证用无痕窗口 |
| `env.KV` / `env.XXX` undefined → 500 | **binding 名必须与代码一致**:改 wrangler.toml 的 binding 名后,代码里 `env.<binding名>` 要同步改 |
| 改 wrangler.toml 后本地 D1 数据"消失" | `database_id` 变化会指向新本地库,重跑 `wrangler d1 migrations apply blessingskin --local` |
| 旧用户登录提示密码错误 | `PWD_METHOD` / `SALT` 与旧站 .env 不一致,`wrangler secret put PWD_METHOD` 修正后重新部署 |
| 上传报 `NotAuthorized` / R2 相关 | 检查 Dashboard 账户是否有 R2 绑定;免费计划需要验证支付方式?R2 免费无需 |
| 注册报验证码错误 | 验证码随会话绑定,先刷新 `/auth/register` 页面的验证码再提交 |
| `project already exists` | 正常,直接 `npm run deploy` |
| 邮件功能显示"未配置" | `RESEND_API_KEY` 未设置;不影响其他功能 |

---

## 13. 回滚 / 清理

- **回滚部署**: Dashboard → 该项目 → 部署历史 → 选择旧版本 → 重新部署
- **清空资源**: 删除 Pages 项目、D1、KV、R2 bucket 均为
  `npx wrangler d1 delete blessingskin` 等命令,或直接在 Dashboard 删除

---

## 附: 从 GitHub CI 部署(可选)

仓库根已有 `.github/workflows/cf-pages.yml`。在 GitHub 仓库设置里加两个
Actions secrets 后,推 `main` 分支即自动部署:

| Secret | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens,权限含 `Cloudflare Pages: Edit` 与 `Account: Read` |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler whoami 输出里的 Account ID |

CI 每次也会跑:语言包构建 → typecheck → SPA 构建 → 本地迁移 → 22 项冒烟测试。
