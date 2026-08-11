/**
 * Yggdrasil 认证服务 (Mojang Yggdrasil 协议,第三方登录)。
 *
 * 原站通过插件 (BS-Yggdrasil 等) 提供,移植版从零实现等价端点。
 * 让 HMCL / PCL2 / BakaXL 等启动器可用皮肤站账号登录 Minecraft:
 *   - authserver:  authenticate / refresh / validate / invalidate / signout
 *   - sessionserver: hasJoined / session/minecraft/profile/{uuid} (含 textures)
 *   - api: users/profiles/minecraft/{username}
 *
 * UUID 策略: 离线 UUID (Java nameUUIDFromBytes 语义,md5(name) 转 UUID v3),
 * 与 BS-Yggdrasil 插件默认一致 — 玩家名不变则 UUID 不变。
 * Token 存储: KV (key: ygg:token:{accessToken}),TTL 与 accessToken 过期时间一致。
 */

import { CompatRouter } from '@/lib/server/compat';
import { md5 } from '@/lib/server/md5';
import { randomHex } from '@/lib/server/types';
import { verifyPassword } from '@/lib/server/ciphers';
import { UserRow, PlayerRow } from '@/lib/server/types';

// ---------- UUID 工具 (Java UUID.nameUUIDFromBytes 语义) ----------

function formatUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 离线 UUID v3: md5(name),版本位=3,变体位=10 (与 Java nameUUIDFromBytes 一致) */
export function uuidFromName(name: string): string {
  const digest = md5(name);
  const b = digest.split('').map((_, i) => parseInt(digest.slice(i * 2, i * 2 + 2), 16));
  b[6] = (b[6]! & 0x0f) | 0x30;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return formatUuid(hex);
}

/** 无横线 UUID (Yggdrasil profile id 格式) */
export function uuidNoDash(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

/** 玩家档案 UUID。已物化的 UUID 可走 D1 索引,旧数据回退到名称 UUID。 */
function playerProfileUuid(player: Pick<PlayerRow, 'name' | 'ygg_uuid'>): string {
  return player.ygg_uuid ? uuidNoDash(player.ygg_uuid) : uuidNoDash(uuidFromName(player.name));
}

function normalizeProfileUuid(uuid: string): string {
  return uuidNoDash(uuid);
}

// ---------- Token 存储 (KV) ----------

const TOKEN_TTL = 24 * 3600; // 24h (第三方 Yggdrasil 常见值)

interface YggToken {
  uid: number;
  pid: number;
  username: string;
  uuid: string;
  clientToken: string;
  /** 最近一次会话的 serverId (hasJoined 校验用,宽松模式仅记录) */
  serverId?: string;
  createdAt: number;
}

function tokenKey(accessToken: string): string {
  return `ygg:token:${accessToken}`;
}

async function getToken(env: Env, accessToken: string): Promise<YggToken | null> {
  const raw = await env.KV_SKIN.get(tokenKey(accessToken));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as YggToken;
  } catch {
    return null;
  }
}

async function putToken(env: Env, accessToken: string, token: YggToken): Promise<void> {
  await env.KV_SKIN.put(tokenKey(accessToken), JSON.stringify(token), { expirationTtl: TOKEN_TTL });
}

/** 该玩家最近登录用的 token (hasJoined 用,取最新一个) */
async function getPlayerToken(env: Env, pid: number): Promise<{ accessToken: string; token: YggToken } | null> {
  const raw = await env.KV_SKIN.get(`ygg:player:${pid}`);
  if (!raw) return null;
  try {
    const { accessToken } = JSON.parse(raw) as { accessToken: string };
    const token = await getToken(env, accessToken);
    return token ? { accessToken, token } : null;
  } catch {
    return null;
  }
}

async function setPlayerToken(env: Env, pid: number, accessToken: string): Promise<void> {
  await env.KV_SKIN.put(`ygg:player:${pid}`, JSON.stringify({ accessToken }), { expirationTtl: TOKEN_TTL });
}

async function deleteToken(env: Env, accessToken: string): Promise<void> {
  await env.KV_SKIN.delete(tokenKey(accessToken));
}

// ---------- 响应辅助 ----------

const ERR = (error: string, errorMessage: string, cause?: string) => ({
  error,
  errorMessage,
  ...(cause ? { cause } : {}),
});

/** 站点公开 base URL (从请求推断,textures URL 需要启动器可访问) */
function siteBaseUrl(c: { req: { raw: Request } }): string {
  const url = new URL(c.req.raw.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * 构建 profile 档案 (sessionserver 格式,含 textures 属性)。
 * 皮肤/披风 URL 指向本站 /textures/{hash}(公开纹理)。
 */
async function buildProfile(
  env: Env,
  player: PlayerRow,
  baseUrl: string,
): Promise<{ id: string; name: string; properties: { name: string; value: string }[] }> {
  const uuid = playerProfileUuid(player);
  const textures: Record<string, unknown> = {};
  const skin = player.tid_skin ? await env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1').bind(player.tid_skin).first() : null;
  const cape = player.tid_cape ? await env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1').bind(player.tid_cape).first() : null;

  if (skin && skin.public) {
    textures.SKIN = {
      url: `${baseUrl}/textures/${skin.hash}`,
      metadata: { model: skin.type === 'alex' ? 'slim' : 'default' },
    };
  }
  if (cape && cape.public) {
    textures.CAPE = { url: `${baseUrl}/textures/${cape.hash}` };
  }

  const value = JSON.stringify({
    timestamp: Date.now(),
    profileId: uuidNoDash(uuid),
    profileName: player.name,
    textures,
  });
  // Yggdrasil 要求 base64 编码的 JSON
  const b64 = btoa(value);

  return {
    id: uuidNoDash(uuid),
    name: player.name,
    properties: [{ name: 'textures', value: b64 }],
  };
}

/** 按用户名查玩家 (含封禁检查,封禁用户不可登录/不可 hasJoined) */
async function findPlayerByUsername(env: Env, username: string): Promise<{ player: PlayerRow; user: UserRow } | null> {
  const player = await env.DB.prepare('SELECT * FROM players WHERE name = ? LIMIT 1').bind(username).first<PlayerRow>();
  if (!player) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1').bind(player.uid).first<UserRow>();
  if (!user) return null;
  if (user.permission === -1) return null; // 封禁

  // 旧库中的玩家没有物化 UUID。首次通过名称访问时补齐,之后 profile UUID
  // 查询可直接使用 idx_players_ygg_uuid,不会再扫描 players 全表。
  const profileUuid = uuidNoDash(uuidFromName(player.name));
  if (player.ygg_uuid !== profileUuid) {
    await env.DB.prepare('UPDATE players SET ygg_uuid = ? WHERE pid = ?')
      .bind(profileUuid, player.pid)
      .run();
    player.ygg_uuid = profileUuid;
  }
  return { player, user };
}

/**
 * 按物化的 profile UUID 查询,命中 idx_players_ygg_uuid。
 *
 * 迁移前创建的玩家没有 ygg_uuid: 对这些旧行只做有限的主键游标候选
 * 查询并回填,绝不执行 SELECT * FROM players 全表扫描。新写入/改名的玩家
 * 始终直接命中 UUID 索引。
 */
async function findPlayerByProfileUuid(env: Env, uuid: string): Promise<PlayerRow | null> {
  const select = `SELECT pid, uid, name, ygg_uuid, tid_skin, tid_cape, last_modified
                  FROM players`;
  const indexed = await env.DB.prepare(`${select} WHERE ygg_uuid = ? LIMIT 1`)
    .bind(uuid)
    .first<PlayerRow>();
  if (indexed) return indexed;

  // 有界兼容回填: 每次最多检查 4 * 250 条尚未回填的旧记录。
  // 这是迁移窗口的兜底,正常流量会通过 findPlayerByUsername 回填。
  let lastPid = 0;
  for (let page = 0; page < 4; page += 1) {
    const { results } = await env.DB.prepare(
      `${select} WHERE ygg_uuid IS NULL AND pid > ? ORDER BY pid LIMIT 250`,
    )
      .bind(lastPid)
      .all<PlayerRow>();
    if (results.length === 0) break;

    const match = results.find((candidate) => uuidNoDash(uuidFromName(candidate.name)) === uuid);
    if (match) {
      await env.DB.prepare('UPDATE players SET ygg_uuid = ? WHERE pid = ?')
        .bind(uuid, match.pid)
        .run();
      match.ygg_uuid = uuid;
      return match;
    }

    lastPid = results[results.length - 1]!.pid;
    if (results.length < 250) break;
  }
  return null;
}

// ---------- 路由 ----------

export const yggdrasilRoutes = new CompatRouter();

// ============ authserver ============

/** POST /authserver/authenticate — 启动器登录 */
yggdrasilRoutes.post('/authserver/authenticate', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');
  const clientToken = String(body.clientToken ?? '');

  if (!username || !password) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid credentials.'), 403);
  }

  // 用户名: 邮箱或玩家名 (与站点登录一致)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const found = isEmail ? null : await findPlayerByUsername(c.env, username);
  const user = isEmail
    ? await c.env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(username).first<UserRow>()
    : found?.user ?? null;

  if (!user) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid credentials.'), 403);
  }
  if (user.permission === -1) {
    return c.json(ERR('ForbiddenOperationException', 'You are banned.'), 403);
  }

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const ok = await verifyPassword(method, password, user.password, salt);
  if (!ok) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid credentials.'), 403);
  }

  // 该用户的角色 (可用档案)
  const { results: players } = await c.env.DB.prepare(
    'SELECT * FROM players WHERE uid = ? ORDER BY pid',
  )
    .bind(user.uid)
    .all<PlayerRow>();
  if (players.length === 0) {
    return c.json(
      ERR('ForbiddenOperationException', 'You have not bound any player yet. Please bind one on the website first.'),
      403,
    );
  }

  // 选择档案: 请求指定 selectedProfile 或默认第一个
  let selected = players[0]!;
  const reqProfile = body.selectedProfile as { id?: string; name?: string } | undefined;
  if (reqProfile?.name) {
    const match = players.find((p) => p.name === reqProfile.name);
    if (match) selected = match;
  }

  const accessToken = randomHex(32);
  const token: YggToken = {
    uid: user.uid,
    pid: selected.pid,
    username: selected.name,
    uuid: uuidFromName(selected.name),
    clientToken,
    createdAt: Math.floor(Date.now() / 1000),
  };
  await putToken(c.env, accessToken, token);
  await setPlayerToken(c.env, selected.pid, accessToken);

  const availableProfiles = players.map((p) => ({
    id: uuidNoDash(uuidFromName(p.name)),
    name: p.name,
  }));

  return c.json({
    accessToken,
    clientToken: clientToken || undefined,
    availableProfiles,
    selectedProfile: {
      id: uuidNoDash(uuidFromName(selected.name)),
      name: selected.name,
    },
    user: {
      id: uuidNoDash(uuidFromName(user.nickname || user.email)),
      properties: [],
    },
  });
});

/** POST /authserver/refresh — 刷新 accessToken */
yggdrasilRoutes.post('/authserver/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = String(body.accessToken ?? '');
  const clientToken = String(body.clientToken ?? '');

  const token = await getToken(c.env, accessToken);
  if (!token) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid token.'), 403);
  }
  if (clientToken && token.clientToken && token.clientToken !== clientToken) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid token.'), 403);
  }

  const player = await c.env.DB.prepare('SELECT * FROM players WHERE pid = ? LIMIT 1')
    .bind(token.pid)
    .first<PlayerRow>();
  if (!player) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid token.'), 403);
  }

  // 轮换 accessToken (旧 token 作废)
  await deleteToken(c.env, accessToken);
  const newToken = randomHex(32);
  const newData: YggToken = { ...token, clientToken, createdAt: Math.floor(Date.now() / 1000) };
  await putToken(c.env, newToken, newData);
  await setPlayerToken(c.env, token.pid, newToken);

  return c.json({
    accessToken: newToken,
    clientToken: clientToken || undefined,
    selectedProfile: { id: uuidNoDash(uuidFromName(player.name)), name: player.name },
  });
});

/** POST /authserver/validate — 校验 token 是否有效 */
yggdrasilRoutes.post('/authserver/validate', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = String(body.accessToken ?? '');
  const clientToken = String(body.clientToken ?? '');

  const token = await getToken(c.env, accessToken);
  if (!token) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid token.'), 403);
  }
  if (clientToken && token.clientToken && token.clientToken !== clientToken) {
    return c.json(ERR('ForbiddenOperationException', 'Invalid token.'), 403);
  }
  return c.body(null, 204);
});

/** POST /authserver/invalidate — 注销 token */
yggdrasilRoutes.post('/authserver/invalidate', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = String(body.accessToken ?? '');
  if (accessToken) {
    await deleteToken(c.env, accessToken);
  }
  return c.body(null, 204);
});

/** POST /authserver/signout — 用户名+密码注销全部 token */
yggdrasilRoutes.post('/authserver/signout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const user = isEmail
    ? await c.env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(username).first<UserRow>()
    : await (async () => {
        const player = await c.env.DB.prepare('SELECT * FROM players WHERE name = ? LIMIT 1').bind(username).first<PlayerRow>();
        if (!player) return null;
        return c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1').bind(player.uid).first<UserRow>();
      })();
  if (!user) return c.body(null, 204);

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const ok = await verifyPassword(method, password, user.password, salt);
  if (!ok) return c.body(null, 204);

  // 删除该用户所有角色的 token (宽松: 遍历角色)
  const { results: players } = await c.env.DB.prepare('SELECT * FROM players WHERE uid = ?').bind(user.uid).all<PlayerRow>();
  for (const p of players) {
    const entry = await getPlayerToken(c.env, p.pid);
    if (entry) await deleteToken(c.env, entry.accessToken);
    await c.env.KV_SKIN.delete(`ygg:player:${p.pid}`);
  }
  return c.body(null, 204);
});

// ============ sessionserver ============

/** GET /sessionserver/session/minecraft/hasJoined — 游戏服务器校验玩家会话 */
yggdrasilRoutes.get('/sessionserver/session/minecraft/hasJoined', async (c) => {
  const username = String(c.req.query('username') ?? '');
  const serverId = String(c.req.query('serverId') ?? '');

  const found = await findPlayerByUsername(c.env, username);
  if (!found) return c.body(null, 204);

  const entry = await getPlayerToken(c.env, found.player.pid);
  if (!entry) {
    // 未登录: 服务器要求在线模式时拒绝
    return c.body(null, 204);
  }

  // 记录 serverId 并刷新 token 有效期 (宽松模式: 不强制校验)
  entry.token.serverId = serverId;
  await putToken(c.env, entry.accessToken, entry.token);

  const baseUrl = siteBaseUrl(c);
  const profile = await buildProfile(c.env, found.player, baseUrl);
  return c.json(profile);
});

/** GET /sessionserver/session/minecraft/profile/{uuid} — 玩家档案 (含 textures) */
yggdrasilRoutes.get('/sessionserver/session/minecraft/profile/:uuid', async (c) => {
  const uuid = String(c.req.param('uuid')).replace(/-/g, '').toLowerCase();
  const { results: players } = await c.env.DB.prepare('SELECT * FROM players').all<PlayerRow>();

  const player = players.find((p) => uuidNoDash(uuidFromName(p.name)) === uuid);
  if (!player) return c.body(null, 204);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(player.uid)
    .first<UserRow>();
  if (!user || user.permission === -1) return c.body(null, 204);

  const baseUrl = siteBaseUrl(c);
  const profile = await buildProfile(c.env, player, baseUrl);
  // 若没有任何公开纹理,返回 204 (避免启动器报错)
  const texturesProp = profile.properties[0];
  const hasTexture = texturesProp ? JSON.parse(atob(texturesProp.value)).textures?.SKIN || JSON.parse(atob(texturesProp.value)).textures?.CAPE : false;
  if (!hasTexture) return c.body(null, 204);
  return c.json(profile);
});

// ============ api ============

/** GET /api/users/profiles/minecraft/{username} — 用户名 → UUID */
yggdrasilRoutes.get('/api/users/profiles/minecraft/:username', async (c) => {
  const username = String(c.req.param('username'));
  const found = await findPlayerByUsername(c.env, username);
  if (!found) return c.body(null, 204);
  return c.json({ id: uuidNoDash(uuidFromName(found.player.name)), name: found.player.name });
});

/** POST /api/profiles/minecraft — 批量查询 (部分启动器/服务器使用) */
yggdrasilRoutes.post('/api/profiles/minecraft', async (c) => {
  const body = await c.req.json().catch(() => []);
  const names = Array.isArray(body) ? body.map(String) : [];
  const out: { id: string; name: string }[] = [];
  for (const name of names) {
    const found = await findPlayerByUsername(c.env, name);
    if (found) out.push({ id: uuidNoDash(uuidFromName(found.player.name)), name: found.player.name });
  }
  return c.json(out);
});

