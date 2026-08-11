/**
 * Next.js 版冒烟测试 (P0: 首页/登录页/插件 SDK)。
 * 用法: 先 `opennextjs-cloudflare build` + 起服务 (wrangler dev .open-next/worker.js --port 8790),
 *       再 `node scripts/smoke-test-next.mjs`
 */
const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8790';

let failed = 0;
function assert(cond, message) {
  if (cond) {
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

async function main() {
  console.log('=== 首页 / ===');
  const home = await (await fetch(`${BASE}/`)).text();
  assert(home.includes('hp-wrapper'), 'hp-wrapper 存在');
  assert(home.includes('splash-head'), 'splash-head 存在');
  assert(home.includes('id="intro"'), '#intro 特性区存在');
  assert(home.includes('id="footer-wrap"'), '#footer-wrap 存在');
  assert(home.includes('id="copyright"'), '#copyright 存在');
  assert(home.includes('navbar-brand'), 'navbar-brand 存在');
  assert(home.includes('fa-language'), '语言切换存在');
  assert(home.includes('window.blessing'), 'window.blessing 注入');
  assert(home.includes('name="csrf-token"'), 'csrf-token meta');
  assert(home.includes('x-smoke-plugin'), '插件 rendering.header 注入');
  assert(home.includes('smoke-plugin/assets/style.css'), '插件 head_links 注入');

  console.log('=== 登录页 /auth/login ===');
  const login = await (await fetch(`${BASE}/auth/login`)).text();
  assert(login.includes('login-box'), 'login-box 存在');
  assert(login.includes('login-logo'), 'login-logo 存在');
  assert(login.includes('login-card-body'), 'login-card-body 存在');
  assert(login.includes('登录以管理'), 'login-box-msg 翻译渲染');
  assert(login.includes('注册新账号'), '注册链接翻译渲染');
  assert(login.includes('btn-primary'), '登录按钮');
  assert(login.includes('fa-user') && login.includes('fa-lock'), '输入图标');

  console.log('=== 插件 SDK ===');
  const ping = await (await fetch(`${BASE}/plugins/smoke/ping`)).json();
  assert(ping.code === 0 && ping.message === 'pong', '插件路由 /plugins/smoke/ping → pong');
  const unknown = await fetch(`${BASE}/plugins/smoke/nope`);
  assert(unknown.status === 200, '未注册插件路由 → 404 JSON');

  if (failed > 0) {
    console.error(`\n${failed} 项失败`);
    process.exit(1);
  }
  console.log('\n全部通过 🎉');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
