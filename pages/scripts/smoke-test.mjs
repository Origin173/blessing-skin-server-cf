/**
 * 冒烟测试:注册 → 登录 → 玩家 → 上传 → 衣柜 → 皮肤库 全流程 (本地开发环境)。
 * 用法: node scripts/smoke-test.mjs [baseUrl]
 * 依赖: 本地 wrangler pages dev 已在运行,且 D1 迁移已应用。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = process.argv[2] ?? 'http://localhost:8788';

let cookies = new Map();

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function setCookies(res) {
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookie) {
    const [pair] = sc.split(';');
    const [k, ...rest] = pair.split('=');
    cookies.set(k, rest.join('='));
  }
}

async function req(method, path, body, { csrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  const cookie = cookieHeader();
  if (cookie) headers['Cookie'] = cookie;
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (csrf && cookies.has('BS_SESSION')) {
    const csrfToken = await readSessionCsrf();
    if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  setCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text };
}

/** 在 KV 的所有 blob 目录中查找 blob_id 对应的文件 (namespace id 目录 / local) */
function findBlob(blobId) {
  const kvDir = '.wrangler/state/v3/kv';
  const candidates = ['.wrangler/state/v3/kv/local/blobs'];
  for (const d of readdirSync(kvDir)) {
    candidates.push(`${kvDir}/${d}/blobs`);
  }
  for (const blobsDir of candidates) {
    try {
      const f = readdirSync(blobsDir).find((b) => b.startsWith(blobId));
      if (f) return `${blobsDir}/${f}`;
    } catch {
      /* 目录不存在 */
    }
  }
  return null;
}

/** 从 Miniflare 本地 KV SQLite 读取会话 (获取 csrf / captcha) */
async function readSession() {
  const dir = '.wrangler/state/v3/kv/miniflare-KVNamespaceObject';
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite') && !f.includes('metadata'))
    // KV binding 改名会创建新的 namespace 实例文件,选择最新的 (当前 binding 的)
    .map((f) => ({ f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const file = entries[0]?.f;
  if (!file) return null;
  const db = new DatabaseSync(`${dir}/${file}`);
  const sid = cookies.get('BS_SESSION');
  if (!sid) return null;
  const row = db.prepare('SELECT blob_id FROM _mf_entries WHERE key = ?').get(`session:${sid}`);
  if (!row) return null;
  const blobFile = findBlob(row.blob_id);
  if (!blobFile) return null;
  return JSON.parse(readFileSync(blobFile, 'utf8'));
}

async function readSessionCsrf() {
  const session = await readSession();
  return session?.csrf ?? null;
}

function assert(cond, message) {
  if (!cond) {
    console.error(`✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

// ---------- 流程 ----------

console.log(`冒烟测试 → ${BASE}\n`);

// 1. 健康检查
let r = await req('GET', '/api/health');
assert(r.status === 200 && r.json?.data?.status === 'ok', 'GET /api/health');

// 2. 验证码 (建立匿名会话)
r = await req('GET', '/auth/captcha');
assert(r.status === 200 && r.text.includes('<svg'), 'GET /auth/captcha → SVG');
let session = await readSession();
assert(session?.captcha, '会话中已保存验证码短语');

// 3. 注册
const email = `user_${Date.now()}@test.dev`;
r = await req('POST', '/auth/register', {
  email,
  password: 'password123',
  captcha: session.captcha,
  player_name: `Tester_${Math.floor(Math.random() * 10000)}`,
});
assert(r.json?.code === 0, `POST /auth/register → code 0 (${r.json?.message ?? r.text})`);

// 4. bootstrap 应返回已登录用户
r = await req('GET', '/api/bootstrap');
assert(r.json?.data?.user?.email === email, 'bootstrap 返回当前用户');

// 5. 重复注册同玩家名 → 失败
session = await readSession();
r = await req('POST', '/auth/register', {
  email: `user2_${Date.now()}@test.dev`,
  password: 'password123',
  captcha: session?.captcha ?? '',
  player_name: 'Tester_99999',
});
assert(r.json?.code !== 0, '重复玩家名注册被拒绝');

// 6. 登出
r = await req('POST', '/auth/logout', {});
assert(r.json?.code === 0, 'POST /auth/logout');

// 7. 登录 (先 GET /auth/login 建立会话与 CSRF,与前端行为一致)
r = await req('GET', '/auth/login');
assert(r.json?.code === 0, 'GET /auth/login (建立会话)');
r = await req('POST', '/auth/login', { identification: email, password: 'wrongpass1' });
assert(r.json?.code === 1, '错误密码登录失败');
r = await req('POST', '/auth/login', { identification: email, password: 'password123' });
assert(r.json?.code === 0 && r.json?.data?.redirectTo === '/user', '正确密码登录成功');

// 8. 玩家列表 (注册时自动创建)
r = await req('GET', '/user/player/list');
assert(Array.isArray(r.json) && r.json.length >= 1, '玩家列表非空');

// 9. 积分信息
r = await req('GET', '/user/score-info');
assert(r.json?.user?.score > 0, '积分信息返回');

// 10. 每日签到
r = await req('POST', '/user/sign', {});
assert(r.json?.code === 0, `每日签到成功 (+${r.json?.data?.score})`);

// 11. 上传皮肤 (64×32 PNG)
// 注意: 像素必须是随机的 — 固定图案两次运行 sha256 相同,会命中"已有人上传过"重复检测
const { encode: encodePng } = await import('fast-png');
const rgba = new Uint8Array(64 * 32 * 4);
for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7 + Math.floor(Math.random() * 256)) % 256;
const skinBuffer = encodePng({ width: 64, height: 32, data: rgba });
const form = new FormData();
form.append('name', 'Test Skin');
form.append('type', 'steve');
form.append('public', '1');
form.append('file', new File([skinBuffer], 'skin.png', { type: 'image/png' }));
const csrfToken = await readSessionCsrf();
r = await fetch(BASE + '/texture', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'X-CSRF-TOKEN': csrfToken ?? '',
    Cookie: cookieHeader(),
  },
  body: form,
});
setCookies(r);
const uploadJson = await r.json();
assert(uploadJson.code === 0, `上传皮肤成功 (tid=${uploadJson.data?.tid})`);

// 12. 皮肤库列表
r = await req('GET', '/skinlib/list');
assert(r.json?.total >= 1, '皮肤库列表包含新上传');

// 12.5 绑定皮肤到玩家
r = await req('GET', '/user/player/list');
const playerPid = r.json[0].pid;
const playerName = r.json[0].name;
r = await req('PUT', `/user/player/${playerPid}/textures`, { skin: uploadJson.data.tid });
assert(r.json?.code === 0, '绑定皮肤到玩家');

// 13. 玩家 JSON 接口 (CustomSkinAPI) — Phase 2 静态接口
if (process.env.SMOKE_STATIC === '1') {
  r = await fetch(`${BASE}/${playerName}.json`);
  const profile = await r.json();
  assert(
    profile.username === playerName && Object.keys(profile.skins).length === 1,
    `GET /${playerName}.json → CustomSkinAPI 形状`,
  );

  // 14. 纹理文件接口
  r = await fetch(`${BASE}/textures/${profile.skins.default}`);
  assert(r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'), 'GET /textures/{hash} → PNG');

  // 14.1 头像 + 预览 (渲染器)
  r = await fetch(`${BASE}/avatar/${uploadJson.data.tid}?png`);
  assert(r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'), 'GET /avatar/{tid} → PNG');
  r = await fetch(`${BASE}/preview/${uploadJson.data.tid}?png`);
  assert(r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'), 'GET /preview/{tid} → PNG');
} else {
  console.log('⏭  跳过 Phase 2 静态接口断言 (设置 SMOKE_STATIC=1 启用)');
}

// 15. 未登录访问用户页 → 401 + X-Login-Required
cookies.clear();
r = await req('GET', '/user/score-info');
assert(r.status === 401 && r.json?.code === 1, '未登录 → 401');

console.log('\n全部通过 ✅');
