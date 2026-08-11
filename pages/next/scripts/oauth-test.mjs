/**
 * OAuth2 端到端验证 (Next 版):
 *   1. 创建客户端 (直插 oauth_clients)
 *   2. client_credentials grant → access_token → GET /api/user
 *   3. password grant → access_token
 *   4. authorize 流程 (GET /oauth/authorize + POST approve)
 * 用法: 需 wrangler dev 运行中, SMOKE_BASE 指向服务
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8798';
const CWD = process.cwd();
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

let failed = 0;
const assert = (c, m) => {
  if (c) console.log(`  ✓ ${m}`);
  else {
    failed++;
    console.error(`  ✗ ${m}`);
  }
};

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

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(path, method = 'GET', body, headers = {}) {
  const h = { ...headers };
  if (body !== undefined && typeof body !== 'string' && !('content-type' in h)) {
    h['content-type'] = 'application/json';
  }
  const c = cookieHeader();
  if (c) h.cookie = c;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    redirect: 'manual',
  });
  const sc = res.headers.get('set-cookie');
  if (sc) {
    const m = sc.match(/(\w+)=([^;]+)/);
    if (m) jar.set(m[1], m[2]);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, location: res.headers.get('location') };
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

const email = `oauth${Date.now()}@test.dev`;
const password = 'password123';
const playerName = `OAuth${Date.now().toString().slice(-5)}`;

console.log('=== 准备: 注册用户 + 创建 OAuth 客户端 ===');
await req('/auth/captcha');
let session = await readSession();
console.log('  [debug] session:', session ? `captcha=${session.captcha}` : 'null');
let r = await req('/api/auth/register', 'POST', {
  email,
  nickname: 'OAuthUser',
  password,
  player_name: playerName,
  captcha: session?.captcha ?? '',
});
assert(r.json?.code === 0, `注册用户 (${r.json?.message ?? r.text.slice(0, 80)})`);

// 通过 API 创建 OAuth 客户端 (注册即登录,会话可用)
session = await readSession();
const createCsrf = session?.csrf ?? '';
r = await req('/oauth/clients', 'POST', { name: 'Test Client', redirect: 'http://localhost/callback' }, {
  'content-type': 'application/json',
  'x-csrf-token': createCsrf,
});
// POST /clients 返回 201 裸对象 (Passport 风格,无 code 包装)
assert(r.status === 201 && r.json?.id, `POST /oauth/clients 创建客户端 (status=${r.status}, id=${r.json?.id})`);
const clientId = r.json?.id;
const clientSecret = r.json?.secret ?? '';
assert(!!clientSecret, `客户端 secret 已返回`);

console.log('=== client_credentials grant ===');
const form = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: String(clientId),
  client_secret: clientSecret,
  scope: 'User.Read',
});
r = await req('/oauth/token', 'POST', form.toString(), { 'content-type': 'application/x-www-form-urlencoded' });
assert(r.json?.access_token, `client_credentials → access_token`);
const ccToken = r.json?.access_token;

// client_credentials token 无用户 (应用级),认证应通过 (非 401)
r = await req('/api/user', 'GET', undefined, { authorization: `Bearer ${ccToken}` });
assert(r.status !== 401, 'client_credentials Bearer 认证通过 (应用级 token)');

console.log('=== password grant ===');
// password grant 需要客户端标记 password_client (Passport 行为)
const stateDir = `${CWD}/${STATE_DIR}`;
const d1Root = `${stateDir}/v3/d1`;
let d1File = null;
for (const sub of readdirSync(d1Root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `${d1Root}/${d.name}`)) {
  try {
    const f = readdirSync(sub).find((x) => x.endsWith('.sqlite') && !x.includes('metadata'));
    if (f) {
      d1File = `${sub}/${f}`;
      break;
    }
  } catch {}
}
if (d1File) {
  const db = new DatabaseSync(d1File);
  db.prepare('UPDATE oauth_clients SET password_client = 1 WHERE id = ?').run(clientId);
}
const form2 = new URLSearchParams({
  grant_type: 'password',
  client_id: String(clientId),
  client_secret: clientSecret,
  username: email,
  password,
  scope: 'User.Read',
});
r = await req('/oauth/token', 'POST', form2.toString(), { 'content-type': 'application/x-www-form-urlencoded' });
assert(r.json?.access_token, `password grant → access_token`);
const pToken = r.json?.access_token;
const refreshToken = r.json?.refresh_token ?? null;

r = await req('/api/user', 'GET', undefined, { authorization: `Bearer ${pToken}` });
assert(r.status === 200 && r.json?.email === email, `password token → GET /api/user 返回当前用户`);

console.log('=== refresh_token grant ===');
const refresh = refreshToken;
r = await req('/oauth/token', 'POST', new URLSearchParams({
  grant_type: 'refresh_token',
  client_id: String(clientId),
  client_secret: clientSecret,
  refresh_token: refresh,
}).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
assert(r.json?.access_token, 'refresh_token grant 可用');

console.log('=== authorize 流程 ===');
// 登录会话 → GET /oauth/authorize (RSC 页面)
session = await readSession();
const authorizeQuery = `client_id=${clientId}&redirect_uri=${encodeURIComponent('http://localhost/callback')}&response_type=code&scope=User.Read`;
r = await req(`/oauth/authorize?${authorizeQuery}`, 'GET', undefined, { accept: 'text/html' });
assert(r.status === 200 && r.text.includes('OAuth2'), `GET /oauth/authorize 页面可达`);

// POST approve (code grant) → 302 redirect 含 code
const csrf = session?.csrf ?? '';
r = await req(`/api/oauth/authorize`, 'POST', {
  approve: true,
  client_id: clientId,
  redirect_uri: 'http://localhost/callback',
  scope: 'User.Read',
  state: '',
}, {
  'content-type': 'application/json',
  'x-csrf-token': csrf,
});
assert(r.status === 302, `POST /oauth/authorize approve → 302 (status=${r.status})`);
const redirectUrl = r.location;
const code = redirectUrl ? new URL(redirectUrl).searchParams.get('code') : null;
assert(!!code, `授权码 code 已签发`);

// authorization_code grant
r = await req('/oauth/token', 'POST', new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: String(clientId),
  client_secret: clientSecret,
  redirect_uri: 'http://localhost/callback',
  code,
}).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
assert(r.json?.access_token, `authorization_code grant → access_token`);
const authCodeToken = r.json?.access_token;
r = await req('/api/user', 'GET', undefined, { authorization: `Bearer ${authCodeToken}` });
assert(r.status === 200 && r.json?.email === email, `授权码 token → GET /api/user 返回当前用户`);

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\nOAuth2 全流程通过 🎉');
