/**
 * OAuth2 API 路由 (对应 routes/api.php): Bearer token 认证 + scope 校验。
 * 挂载于 /api 前缀。
 */

import { CompatRouter, CompatContext } from '@/lib/server/compat';
import { jsonData, jsonError } from '@/lib/server/response';
import { authenticateBearer, tokenScopes } from '@/lib/server/oauth';
import { userToJson, playerToJson, textureToJson, paginate, intQuery } from './helpers';
import { getOption } from '@/lib/server/options';
import { UserRow, PlayerRow, TextureRow, PERMISSION, now, randomHex } from '@/lib/server/types';
import { validate } from '@/lib/server/validate';
import { hashPassword } from '@/lib/server/ciphers';
import { validatePlayerName } from '@/lib/server/player-name';
import { readBody } from './helpers';

interface ApiContext {
  env: Env;
  tokenScopes: string[];
  userId: number | null;
}

/** 中间件: Bearer 认证 + scope 要求 */
function requireScopes(...required: string[]) {
  return async (
    c: CompatContext,
    next: () => Promise<Response | void>,
  ): Promise<Response | void> => {
    const auth = await authenticateBearer(c.env, c.req.raw);
    if (!auth) {
      return c.json({ code: 1, message: 'Unauthenticated.' }, 401);
    }
    const hasAny = required.some((scope) => auth.scopes.includes(scope));
    if (!hasAny) {
      return c.json({ code: 403, message: 'Insufficient scope' }, 403);
    }
    c.set('tokenScopes', auth.scopes);
    c.set('userId', auth.token.user_id);
    return next();
  };
}

export const apiRoutes = new CompatRouter();

// ---------- API 根 ----------

apiRoutes.all('', async (c) => {
  return jsonData({
    blessing_skin: 'blessing-skin',
    spec: 0,
    copyright: await getOption(c.env, 'copyright_text', ''),
    site_name: await getOption(c.env, 'site_name', ''),
  });
});

// ---------- 用户 ----------

apiRoutes.get('/user', requireScopes('User.Read'), async (c) => {
  const user = await loadUser(c, c.get('userId')!);
  if (!user) return jsonError('User not found', 404);
  return c.json(userToJson(user as unknown as Record<string, unknown>));
});

// ---------- 通知 ----------

apiRoutes.get('/user/notifications', requireScopes('Notification.Read'), async (c) => {
  const uid = c.get<number>('userId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, data, read_at, created_at FROM notifications
     WHERE notifiable_type = 'App\\Models\\User' AND notifiable_id = ? AND read_at IS NULL
     ORDER BY created_at DESC LIMIT 20`,
  )
    .bind(uid)
    .all<{ id: string; data: string }>();
  return c.json(
    results.map((row) => {
      const data = JSON.parse(row.data) as { title?: string };
      return { id: row.id, title: data.title ?? '' };
    }),
  );
});

apiRoutes.post('/user/notifications/:id', requireScopes('Notification.Read'), async (c) => {
  const uid = c.get<number>('userId')!;
  const id = c.req.param('id');
  const notification = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE id = ? AND notifiable_id = ? LIMIT 1`,
  )
    .bind(id, uid)
    .first<{ id: string; data: string; read_at: string | null; created_at: string | null }>();
  if (!notification) return jsonError('Not found', 404);
  if (!notification.read_at) {
    await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ?')
      .bind(now(), id)
      .run();
  }
  const data = JSON.parse(notification.data) as { title?: string; content?: string };
  return c.json({ title: data.title ?? '', content: data.content ?? '', time: notification.created_at });
});

// ---------- 玩家 ----------

apiRoutes.get('/players', requireScopes('Player.Read', 'Player.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, t.type AS skin_type FROM players p
     LEFT JOIN textures t ON t.tid = p.tid_skin WHERE p.uid = ? ORDER BY p.pid`,
  )
    .bind(uid)
    .all();
  return c.json(results.map((row) => playerToJson(row as Record<string, unknown>)));
});

apiRoutes.post('/players', requireScopes('Player.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const user = await loadUser(c, uid);
  if (!user) return jsonError('User not found', 404);
  const body = await readBody(c);
  const nameRuleConfig = String(await getOption(c.env, 'player_name_rule'));
  const customRegexp = String(await getOption(c.env, 'custom_player_name_regexp'));
  const result = await validate(
    body,
    {
      name: [
        'required',
        `min:${await getOption(c.env, 'player_name_length_min')}`,
        `max:${await getOption(c.env, 'player_name_length_max')}`,
        'unique:players',
        {
          kind: 'custom',
          name: 'user.player.player-name-rule.' + nameRuleConfig,
          test: (value: unknown) =>
            validatePlayerName(String(value), { rule: nameRuleConfig, customRegexp }),
        },
      ],
    },
    { env: c.env, locale: 'zh_CN' },
  );
  if (!result.ok) return c.json({ code: 1, message: Object.values(result.errors).flat()[0] }, 422);

  const cost = Number(await getOption(c.env, 'score_per_player'));
  if (user.score < cost) return jsonError('积分不足', 7);

  const nowStr = now();
  const insert = await c.env.DB.prepare(
    'INSERT INTO players (uid, name, tid_skin, tid_cape, last_modified) VALUES (?, ?, 0, 0, ?)',
  )
    .bind(uid, String(body.name), nowStr)
    .run();
  await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?').bind(cost, uid).run();

  const player = await c.env.DB.prepare('SELECT * FROM players WHERE pid = ? LIMIT 1')
    .bind(Number(insert.meta.last_row_id))
    .first<PlayerRow>();
  return c.json(playerToJson(player as unknown as Record<string, unknown>), 201);
});

async function loadOwnedPlayer(c: { env: Env; get: (k: 'userId') => number | null }, pid: number): Promise<PlayerRow | null> {
  const player = await c.env.DB.prepare('SELECT * FROM players WHERE pid = ? LIMIT 1')
    .bind(pid)
    .first<PlayerRow>();
  if (!player || player.uid !== c.get('userId')) return null;
  return player;
}

apiRoutes.delete('/players/:pid', requireScopes('Player.ReadWrite'), async (c) => {
  const player = await loadOwnedPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError('Not found', 404);
  await c.env.DB.prepare('DELETE FROM players WHERE pid = ?').bind(player.pid).run();
  if ((await getOption(c.env, 'return_score')) === true) {
    const cost = Number(await getOption(c.env, 'score_per_player'));
    await c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?').bind(cost, player.uid).run();
  }
  return c.json({});
});

apiRoutes.put('/players/:pid/name', requireScopes('Player.ReadWrite'), async (c) => {
  const player = await loadOwnedPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError('Not found', 404);
  const body = await readBody(c);
  const result = await validate(
    body,
    {
      name: [
        'required',
        `min:${await getOption(c.env, 'player_name_length_min')}`,
        `max:${await getOption(c.env, 'player_name_length_max')}`,
        'unique:players',
        {
          kind: 'custom',
          name: 'user.player.player-name-rule.official',
          test: () => true,
        },
      ],
    },
    { env: c.env, locale: 'zh_CN' },
  );
  if (!result.ok) return c.json({ code: 1, message: Object.values(result.errors).flat()[0] }, 422);
  await c.env.DB.prepare('UPDATE players SET name = ?, last_modified = ? WHERE pid = ?')
    .bind(String(body.name), now(), player.pid)
    .run();
  return c.json({});
});

apiRoutes.put('/players/:pid/textures', requireScopes('Player.ReadWrite'), async (c) => {
  const player = await loadOwnedPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError('Not found', 404);
  const body = await readBody(c);
  for (const type of ['skin', 'cape'] as const) {
    const tid = body[type];
    if (!tid) continue;
    const inCloset = await c.env.DB.prepare(
      'SELECT 1 AS f FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
    )
      .bind(player.uid, Number(tid))
      .first();
    if (!inCloset) return jsonError('材质不在衣柜中', 1);
    const field = type === 'skin' ? 'tid_skin' : 'tid_cape';
    await c.env.DB.prepare(`UPDATE players SET ${field} = ?, last_modified = ? WHERE pid = ?`)
      .bind(Number(tid), now(), player.pid)
      .run();
  }
  return c.json({});
});

apiRoutes.delete('/players/:pid/textures', requireScopes('Player.ReadWrite'), async (c) => {
  const player = await loadOwnedPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError('Not found', 404);
  await c.env.DB.prepare('UPDATE players SET tid_skin = 0, tid_cape = 0, last_modified = ? WHERE pid = ?')
    .bind(now(), player.pid)
    .run();
  return c.json({});
});

// ---------- 衣柜 ----------

apiRoutes.get('/closet', requireScopes('Closet.Read', 'Closet.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const page = intQuery(c as never, 'page', 1) as number;
  const perPage = 20;
  const { results, total } = await (async () => {
    const totalRes = await c.env.DB.prepare(
      'SELECT COUNT(*) AS c FROM user_closet WHERE user_uid = ?',
    )
      .bind(uid)
      .first<{ c: number }>();
    const offset = (page - 1) * perPage;
    const { results } = await c.env.DB.prepare(
      `SELECT t.*, uc.item_name FROM user_closet uc
       JOIN textures t ON t.tid = uc.texture_tid
       WHERE uc.user_uid = ? ORDER BY uc.texture_tid DESC LIMIT ? OFFSET ?`,
    )
      .bind(uid, perPage, offset)
      .all();
    return { results, total: totalRes?.c ?? 0 };
  })();
  return c.json({
    data: results.map((row) => ({
      ...textureToJson(row as Record<string, unknown>),
      pivot: { item_name: row.item_name },
    })),
    current_page: page,
    last_page: Math.max(1, Math.ceil(total / perPage)),
    from: total === 0 ? null : (page - 1) * perPage + 1,
    to: total === 0 ? null : Math.min(page * perPage, total),
    total,
  });
});

apiRoutes.post('/closet', requireScopes('Closet.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const body = await readBody(c);
  const tid = Number(body.tid);
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();
  if (!texture) return jsonError('材质不存在', 1);
  if (!texture.public && texture.uploader !== uid) return jsonError('私有材质', 403);
  const exists = await c.env.DB.prepare(
    'SELECT 1 AS f FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(uid, tid)
    .first();
  if (exists) return jsonError('已在衣柜中', 1);
  await c.env.DB.prepare('INSERT INTO user_closet (user_uid, texture_tid, item_name) VALUES (?, ?, ?)')
    .bind(uid, tid, String(body.name ?? texture.name))
    .run();
  await c.env.DB.prepare('UPDATE textures SET likes = likes + 1 WHERE tid = ?').bind(tid).run();
  return c.json({}, 201);
});

apiRoutes.delete('/closet/:tid', requireScopes('Closet.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const tid = Number(c.req.param('tid'));
  await c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ? AND texture_tid = ?')
    .bind(uid, tid)
    .run();
  await c.env.DB.prepare('UPDATE textures SET likes = MAX(likes - 1, 0) WHERE tid = ?').bind(tid).run();
  return c.json({});
});

apiRoutes.put('/closet/:tid', requireScopes('Closet.ReadWrite'), async (c) => {
  const uid = c.get<number>('userId')!;
  const body = await readBody(c);
  const itemName = String(body.item_name ?? body.name ?? '');
  if (!itemName) return jsonError('名称不能为空', 422);
  await c.env.DB.prepare('UPDATE user_closet SET item_name = ? WHERE user_uid = ? AND texture_tid = ?')
    .bind(itemName, uid, Number(c.req.param('tid')))
    .run();
  return c.json({});
});

// ---------- 管理端 (scope 校验) ----------

apiRoutes.get('/admin/users', requireScopes('UsersManagement.Read', 'UsersManagement.ReadWrite'), async (c) => {
  const page = intQuery(c as never, 'page', 1) as number;
  const q = (c.req as unknown as { query: (k: string) => string | undefined }).query('q');
  if (q) {
    return paginate(
      c as never,
      'SELECT * FROM users WHERE email LIKE ? OR nickname LIKE ? ORDER BY uid',
      [`%${q}%`, `%${q}%`],
      10,
      page,
    );
  }
  return paginate(c as never, 'SELECT * FROM users ORDER BY uid', [], 10, page);
});

apiRoutes.put('/admin/users/:uid/email', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const email = String(body.email ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ code: 1, message: 'Invalid email' }, 422);
  }
  const exists = await c.env.DB.prepare('SELECT uid FROM users WHERE email = ? AND uid != ? LIMIT 1')
    .bind(email, Number(c.req.param('uid')))
    .first();
  if (exists) return c.json({ code: 1, message: 'Email has already been taken' }, 422);
  await c.env.DB.prepare('UPDATE users SET email = ? WHERE uid = ?')
    .bind(email, Number(c.req.param('uid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/users/:uid/verification', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const uid = Number(c.req.param('uid'));
  const user = await loadUser(c, uid);
  if (!user) return c.json({ code: 1, message: 'User not found' }, 404);
  await c.env.DB.prepare('UPDATE users SET verified = ? WHERE uid = ?')
    .bind(user.verified ? 0 : 1, uid)
    .run();
  return c.json({});
});

apiRoutes.put('/admin/users/:uid/nickname', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const nickname = String(body.nickname ?? '');
  if (!nickname) return c.json({ code: 1, message: 'Nickname required' }, 422);
  await c.env.DB.prepare('UPDATE users SET nickname = ? WHERE uid = ?')
    .bind(nickname, Number(c.req.param('uid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/users/:uid/password', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const password = String(body.password ?? '');
  if (password.length < 8 || password.length > 16) {
    return c.json({ code: 1, message: 'Password must be between 8 and 16 characters' }, 422);
  }
  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const hashed = await hashPassword(method, password, salt);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE uid = ?')
    .bind(hashed, Number(c.req.param('uid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/users/:uid/permission', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const permission = Number(body.permission) as 0 | 1 | -1;
  if (![PERMISSION.BANNED, PERMISSION.NORMAL, PERMISSION.ADMIN].includes(permission)) {
    return c.json({ code: 1, message: 'Invalid permission' }, 422);
  }
  await c.env.DB.prepare('UPDATE users SET permission = ? WHERE uid = ?')
    .bind(permission, Number(c.req.param('uid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/users/:uid/score', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare('UPDATE users SET score = ? WHERE uid = ?')
    .bind(Number(body.score), Number(c.req.param('uid')))
    .run();
  return c.json({});
});

apiRoutes.delete('/admin/users/:uid', requireScopes('UsersManagement.ReadWrite'), async (c) => {
  const uid = Number(c.req.param('uid'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM players WHERE uid = ?').bind(uid),
    c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ?').bind(uid),
    c.env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(uid),
  ]);
  return c.json({});
});

apiRoutes.get('/admin/players', requireScopes('PlayersManagement.Read', 'PlayersManagement.ReadWrite'), async (c) => {
  const page = intQuery(c as never, 'page', 1) as number;
  return paginate(c as never, 'SELECT * FROM players ORDER BY pid', [], 10, page);
});

apiRoutes.put('/admin/players/:pid/name', requireScopes('PlayersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const name = String(body.name ?? '');
  if (!name) return c.json({ code: 1, message: 'Name required' }, 422);
  await c.env.DB.prepare('UPDATE players SET name = ? WHERE pid = ?')
    .bind(name, Number(c.req.param('pid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/players/:pid/owner', requireScopes('PlayersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const uid = Number(body.uid);
  const user = await loadUser(c, uid);
  if (!user) return c.json({ code: 1, message: 'User not found' }, 404);
  await c.env.DB.prepare('UPDATE players SET uid = ? WHERE pid = ?')
    .bind(uid, Number(c.req.param('pid')))
    .run();
  return c.json({});
});

apiRoutes.put('/admin/players/:pid/textures', requireScopes('PlayersManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const pid = Number(c.req.param('pid'));
  const skin = body.skin !== undefined ? Number(body.skin) : null;
  const cape = body.cape !== undefined ? Number(body.cape) : null;
  const updates: string[] = [];
  const binds: (string | number | null)[] = [];
  if (skin !== null) {
    updates.push('tid_skin = ?');
    binds.push(skin);
  }
  if (cape !== null) {
    updates.push('tid_cape = ?');
    binds.push(cape);
  }
  if (updates.length === 0) return c.json({});
  binds.push(pid);
  await c.env.DB.prepare(`UPDATE players SET ${updates.join(', ')} WHERE pid = ?`)
    .bind(...(binds as (string | number)[]))
    .run();
  return c.json({});
});

apiRoutes.delete('/admin/players/:pid', requireScopes('PlayersManagement.ReadWrite'), async (c) => {
  await c.env.DB.prepare('DELETE FROM players WHERE pid = ?')
    .bind(Number(c.req.param('pid')))
    .run();
  return c.json({});
});

apiRoutes.get('/admin/closet/:uid', requireScopes('ClosetManagement.Read', 'ClosetManagement.ReadWrite'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, uc.item_name FROM user_closet uc
     JOIN textures t ON t.tid = uc.texture_tid
     WHERE uc.user_uid = ? ORDER BY uc.texture_tid DESC`,
  )
    .bind(Number(c.req.param('uid')))
    .all();
  return c.json(results);
});

apiRoutes.post('/admin/closet/:uid', requireScopes('ClosetManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const uid = Number(c.req.param('uid'));
  const tid = Number(body.tid);
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();
  if (!texture) return c.json({ code: 1, message: 'Texture not found' }, 404);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_closet (user_uid, texture_tid, item_name)
     VALUES (?, ?, ?)`,
  )
    .bind(uid, tid, String(body.item_name ?? texture.name))
    .run();
  return c.json({});
});

apiRoutes.delete('/admin/closet/:uid', requireScopes('ClosetManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ? AND texture_tid = ?')
    .bind(Number(c.req.param('uid')), Number(body.tid))
    .run();
  return c.json({});
});

apiRoutes.get('/admin/reports', requireScopes('ReportsManagement.Read', 'ReportsManagement.ReadWrite'), async (c) => {
  const page = intQuery(c as never, 'page', 1) as number;
  return paginate(
    c as never,
    `SELECT r.*, t.name AS texture_name FROM reports r
     LEFT JOIN textures t ON t.tid = r.tid ORDER BY r.report_at DESC`,
    [],
    9,
    page,
  );
});

apiRoutes.put('/admin/reports/:id', requireScopes('ReportsManagement.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const action = String(body.action);
  const id = Number(c.req.param('id'));
  if (action === 'reject') {
    await c.env.DB.prepare('UPDATE reports SET status = 2 WHERE id = ?').bind(id).run();
    return c.json({ status: 2 });
  }
  await c.env.DB.prepare('UPDATE reports SET status = 1 WHERE id = ?').bind(id).run();
  return c.json({ status: 1 });
});

apiRoutes.post('/admin/notifications', requireScopes('Notification.ReadWrite'), async (c) => {
  const body = await readBody(c);
  const title = String(body.title ?? '');
  const content = String(body.content ?? '');
  const receiver = String(body.receiver ?? 'all');
  const data = JSON.stringify({ title, content });
  const createdAt = now();

  // receiver: all / normal / uid / email (对应 NotificationsController@send)
  let where = '1 = 1';
  const binds: (string | number)[] = [];
  if (receiver === 'normal') {
    where = 'permission = 0';
  } else if (receiver === 'uid') {
    where = 'uid = ?';
    binds.push(Number(body.uid));
  } else if (receiver === 'email') {
    where = 'email = ?';
    binds.push(String(body.email));
  }

  const { results } = await c.env.DB.prepare(`SELECT uid FROM users WHERE ${where}`)
    .bind(...(binds as [string | number]))
    .all<{ uid: number }>();
  const ops = results.map((u) =>
    c.env.DB.prepare(
      `INSERT INTO notifications (id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at)
       VALUES (?, 'App\\Notifications\\SiteMessage', 'App\\Models\\User', ?, ?, NULL, ?, ?)`,
    ).bind(randomHex(32), u.uid, data, createdAt, createdAt),
  );
  if (ops.length > 0) await c.env.DB.batch(ops);
  return c.json({});
});

// ---------- 工具 ----------

async function loadUser(c: { env: Env }, uid: number): Promise<UserRow | null> {
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(uid)
    .first<UserRow>();
  return user ?? null;
}
