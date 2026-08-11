// 用户中心功能走查: 衣柜全流程 + 玩家管理 + 资料修改 + 头像 (幂等)
// 用法: node scripts/walk-user.cjs (本地 worker 8795, 用户 origin173b@gmail.com/c1122334)
const BASE = process.env.WALK_BASE ?? 'http://127.0.0.1:8795';

let failed = 0;
const assert = (c, m) => {
  if (c) console.log(`  ✓ ${m}`);
  else {
    failed++;
    console.error(`  ✗ ${m}`);
  }
};

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identification: 'origin173b@gmail.com', password: 'c1122334' }),
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  const session = setCookie.match(/(BS_SESSION=[^;]+)/)?.[1] ?? '';
  assert(login.status === 200, '登录');
  if (!session) return;

  const H = { cookie: session, 'Content-Type': 'application/json' };
  const page = await fetch(`${BASE}/user`, { headers: { cookie: session } });
  const csrf = (await page.text()).match(/csrf-token" content="([^"]*)/)?.[1] ?? '';
  assert(csrf !== '', 'CSRF token');

  // 衣柜: 清理残留
  await fetch(`${BASE}/api/user/closet/1`, { method: 'DELETE', headers: { ...H, 'X-CSRF-TOKEN': csrf } });

  // 衣柜: 添加 (仅 tid, 原版语义)
  let r = await fetch(`${BASE}/api/user/closet`, {
    method: 'POST', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ tid: 1 }),
  });
  let body = await r.json();
  assert(body.code === 0, `衣柜添加 (tid=1): ${body.message ?? ''}`);

  // 衣柜: 列表
  r = await fetch(`${BASE}/api/user/closet/list`, { headers: H });
  body = await r.json();
  assert(body.total === 1 && body.data.length === 1, '衣柜列表 (1 项)');

  // 衣柜: 重命名 (原版字段 name)
  r = await fetch(`${BASE}/api/user/closet/1`, {
    method: 'PUT', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ name: '我的最爱' }),
  });
  body = await r.json();
  assert(body.code === 0, `衣柜重命名: ${body.message ?? ''}`);

  // 头像: 设置为纹理
  r = await fetch(`${BASE}/api/user/avatar`, {
    method: 'POST', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ tid: 1 }),
  });
  body = await r.json();
  assert(body.code === 0, `设置头像: ${body.message ?? ''}`);

  // 玩家: 添加 (随机名幂等; 确保积分足够)
  await fetch(`${BASE}/api/user/score-info`, { headers: H });
  const pname = 'Steve_Test_' + (Date.now() % 100000);
  r = await fetch(`${BASE}/api/user/player`, {
    method: 'POST', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ name: pname }),
  });
  body = await r.json();
  assert(body.code === 0, `添加玩家: ${body.message ?? ''}`);

  // 玩家: 列表 (数据在 /list)
  r = await fetch(`${BASE}/api/user/player/list`, { headers: H });
  body = await r.json();
  const pid = body.data?.[0]?.pid ?? body[0]?.pid;
  if (pid) {
    r = await fetch(`${BASE}/api/user/player/${pid}/textures`, {
      method: 'PUT', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ skin: 1 }),
    });
    const b2 = await r.json();
    assert(b2.code === 0, `应用皮肤到玩家: ${b2.message ?? ''}`);
  } else {
    assert(false, '玩家列表有数据');
  }

  // 资料: 昵称修改
  r = await fetch(`${BASE}/api/user/profile`, {
    method: 'POST', headers: { ...H, 'X-CSRF-TOKEN': csrf }, body: JSON.stringify({ action: 'nickname', new_nickname: 'testtt' }),
  });
  body = await r.json();
  assert(body.code === 0, `资料昵称: ${body.message ?? ''}`);

  console.log(failed === 0 ? '\n全部通过 🎉' : `\n${failed} 项失败`);
}

main().catch((e) => {
  console.error('脚本异常:', e.message);
  process.exit(1);
});
