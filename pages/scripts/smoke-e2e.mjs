/**
 * Next.js 版 E2E 冒烟测试: 注册 → 登录 → 签到 → 玩家 → 上传皮肤 → 皮肤库 → Minecraft 静态接口
 * 用法: 在 pages 下运行 (需 wrangler dev .open-next/worker.js --port 8790 已在运行)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8790';
const CWD = process.cwd();

let failed = 0;
const assert = (c, m) => {
  if (c) console.log(`  ✓ ${m}`);
  else {
    failed++;
    console.error(`  ✗ ${m}`);
  }
};

// ---------- 会话 (cookie jar) ----------
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function req(method, path, body, extra = {}) {
  const headers = { ...(extra.headers ?? {}) };
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  let res;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    res = await fetch(BASE + path, { method, headers, body: JSON.stringify(body) });
  } else {
    res = await fetch(BASE + path, { method, headers });
  }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const m = setCookie.match(/(\w+)=([^;]+)/);
    if (m) jar.set(m[1], m[2]);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

// ---------- 从 Miniflare 本地 KV 读会话 (csrf / captcha) ----------
/** 状态目录 (优先 --persist-to 的新目录,回退默认) */
const STATE_DIR = process.env.SMOKE_STATE ?? '.wrangler-test';
const KV_ROOT = [
  `${CWD}/${STATE_DIR}/v3/kv`,
  `${CWD}/.wrangler/state/v3/kv`,
].find((p) => {
  try {
    readdirSync(p);
    return true;
  } catch {
    return false;
  }
});

function findBlob(blobId) {
  const root = KV_ROOT;
  let dirs = [];
  try {
    dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `${root}/${d.name}`);
  } catch {
    return null;
  }
  for (const sub of dirs) {
    try {
      const blobsDir = `${sub}/blobs`;
      const f = readdirSync(blobsDir).find((b) => b.startsWith(blobId));
      if (f) return `${blobsDir}/${f}`;
    } catch {}
  }
  return null;
}

async function readSession() {
  const dir = `${KV_ROOT}/miniflare-KVNamespaceObject`;
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && !f.includes('metadata'));
  } catch {
    return null;
  }
  const file = files[0];
  if (!file) return null;
  const db = new DatabaseSync(`${dir}/${file}`);
  const sid = jar.get('BS_SESSION');
  if (!sid) return null;
  let row;
  try {
    row = db.prepare('SELECT blob_id FROM _mf_entries WHERE key = ?').get(`session:${sid}`);
  } catch {
    return null;
  }
  if (!row) return null;
  const blobFile = findBlob(row.blob_id);
  if (!blobFile) return null;
  return JSON.parse(readFileSync(blobFile, 'utf8'));
}

// ---------- 流程 ----------
const email = `user${Date.now()}@test.dev`;
const playerName = `Player${Date.now().toString().slice(-6)}`;

console.log('=== 认证 ===');
let r = await req('GET', '/auth/captcha');
assert(r.status === 200 && r.text.includes('<svg'), 'GET /auth/captcha → SVG');
assert(jar.has('BS_SESSION'), '会话 cookie 建立');

let session = await readSession();
assert(session?.captcha, '会话中已保存验证码短语');

r = await req('POST', '/api/auth/register', {
  email,
  nickname: 'TestUser',
  password: 'password123',
  player_name: playerName,
  captcha: session.captcha,
});
assert(r.json?.code === 0, `POST /auth/register → code 0 (${r.json?.message ?? r.text.slice(0, 80)})`);

r = await req('POST', '/auth/logout', {});
assert(r.json?.code === 0, 'POST /auth/logout');

// 重新建立会话 (logout 后旧会话已删除)
r = await req('GET', '/auth/captcha');
session = await readSession();
r = await req('POST', '/api/auth/login', {
  identification: email,
  password: 'password123',
  captcha: session?.captcha ?? '',
});
console.log('LOGIN RESP status:', r.status, 'text:', r.text.slice(0, 200));
assert(r.json?.code === 0 && r.json?.data?.redirectTo === '/user', 'POST /auth/login 成功');

console.log('=== 用户中心 ===');
r = await req('GET', '/user/score-info');
assert(r.json?.user?.score > 0, '积分信息返回');

r = await req('POST', '/user/sign', {});
assert(r.json?.code === 0, `每日签到 (+${r.json?.data?.score})`);

r = await req('GET', '/user/player/list');
assert(Array.isArray(r.json) && r.json.length >= 1, '玩家列表非空');

console.log('=== 皮肤库 ===');
// 真实皮肤 (64x32, web/src/misc/textures/steve.png)
const png = readFileSync(new URL('../test-assets/steve.png', import.meta.url));
session = await readSession();
const csrf = session?.csrf ?? '';
const fd = new FormData();
fd.append('name', 'TestSkin');
fd.append('type', 'steve');
fd.append('file', new Blob([png], { type: 'image/png' }), 'skin.png');
  fd.append('public', '1');
let res = await fetch(BASE + '/texture', {
  method: 'POST',
  headers: { cookie: cookieHeader(), 'x-csrf-token': csrf },
  body: fd,
});
const uploadText = await res.text();
  let upload = null; try { upload = JSON.parse(uploadText); } catch {}
  console.log('UPLOAD RESP:', res.status, uploadText.slice(0, 200));
assert(upload.code === 0, `上传皮肤成功 (tid=${upload.data?.tid})`);

r = await req('GET', '/skinlib/list');
assert(r.json?.total >= 1, '皮肤库列表包含新上传');

const pid = (await req('GET', '/user/player/list')).json?.[0]?.pid;
session = await readSession();
r = await req(
  'PUT',
  `/user/player/${pid}/textures`,
  { skin: upload.data.tid },
  { headers: { 'x-csrf-token': session?.csrf ?? '' } },
);
assert(r.json?.code === 0, '绑定皮肤到玩家');

console.log('=== Minecraft 静态接口 ===');
const profile = await (await fetch(`${BASE}/${playerName}.json`)).json();
assert(profile.skins?.default, `{player}.json 返回皮肤 (${playerName})`);
const hash = profile.skins.default;
r = await fetch(`${BASE}/textures/${hash}`);
assert(
  r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'),
  'GET /textures/{hash} → PNG',
);
r = await fetch(`${BASE}/avatar/${upload.data.tid}?png`);
assert(
  r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'),
  'GET /avatar/{tid} → PNG',
);
r = await fetch(`${BASE}/preview/${upload.data.tid}?png`);
assert(
  r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'),
  'GET /preview/{tid} → PNG',
);

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\nE2E 全部通过 🎉');

// ---------- 页面访问 (登录后) ----------
console.log('=== 页面访问 (登录后) ===');
const pagePaths = [
  '/user', '/user/player', '/user/closet', '/user/profile', '/user/reports', '/user/oauth/manage',
  '/skinlib/upload',
];
for (const p of pagePaths) {
  const res = await fetch(BASE + p, { headers: { cookie: cookieHeader() } });
  assert(res.status === 200, `GET ${p} → 200`);
}

// 提升为管理员后访问 admin 页面
console.log('=== 管理后台 ===');
const adminSession = await readSession();
const adminCsrf = adminSession?.csrf ?? '';
await fetch(BASE + '/admin/users/1/permission', {
  method: 'PUT',
  headers: { cookie: cookieHeader(), 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
  body: JSON.stringify({ permission: 2 }),
});
const adminPaths = ['/admin', '/admin/users', '/admin/players', '/admin/reports', '/admin/i18n', '/admin/customize', '/admin/score', '/admin/options', '/admin/resource', '/admin/status', '/admin/update', '/admin/plugins/manage', '/admin/plugins/config/smoke-plugin', '/admin/plugins/readme/smoke-plugin'];
for (const p of adminPaths) {
  const res = await fetch(BASE + p, { headers: { cookie: cookieHeader() } });
  assert(res.status === 200, `GET ${p} → 200`);
}

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n全部通过 🎉');
