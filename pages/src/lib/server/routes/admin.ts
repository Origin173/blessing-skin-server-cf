/**
 * 管理后台路由,对应 AdminController / UsersManagementController /
 * PlayersManagementController / ClosetManagementController / OptionsController /
 * TranslationsController / NotificationsController (admin 部分)。
 * 插件管理路由在 routes/plugins.ts 中实现；此 Pages 版本仅存储 JSON 元数据，
 * 原 PHP/Composer/Blade 插件包不可在 Workers 中执行。
 */

import { CompatRouter, CompatContext } from '@/lib/server/compat';
import { requireRole, AppVariables } from '@/lib/server/guards';
import { json, jsonData, jsonError, jsonValidationError, forbidden } from '@/lib/server/response';
import { validate } from '@/lib/server/validate';
import { getOption, setOption, option, boolOption } from '@/lib/server/options';
import { hashPassword } from '@/lib/server/ciphers';
import {
  UserRow,
  PlayerRow,
  TextureRow,
  PERMISSION,
  now,
  formatDateTime,
  randomHex,
} from '@/lib/server/types';
import { readBody, paginate, intQuery, userToJson } from './helpers';
import { validatePlayerName } from '@/lib/server/player-name';
import { deleteTexture } from './skinlib';

export const adminRoutes = new CompatRouter();

adminRoutes.use('*', requireRole(PERMISSION.ADMIN));

// ---------- 仪表盘 ----------

adminRoutes.get('/chart', async (c) => {
  const trans = c.get('trans');

  // 近 31 天注册/上传统计 (对应 AdminController::chartData,按本地日期分组)
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 31);
  const monthAgoStr = formatDateTime(monthAgo);

  const { results: users } = await c.env.DB.prepare(
    'SELECT register_at FROM users WHERE register_at >= ?',
  )
    .bind(monthAgoStr)
    .all<{ register_at: string }>();
  const { results: textures } = await c.env.DB.prepare(
    'SELECT upload_at FROM textures WHERE upload_at >= ?',
  )
    .bind(monthAgoStr)
    .all<{ upload_at: string }>();

  const xAxis: string[] = [];
  for (let i = 0; i < 31; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (31 - i));
    xAxis.push(dateKey(d));
  }

  const countByDay = (dates: string[]) => {
    const map = new Map<string, number>();
    for (const s of dates) {
      const key = dateKey(parseDate(s));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return xAxis.map((day) => map.get(day) ?? 0);
  };

  return c.json({
    labels: [await trans('admin.index.user-registration'), await trans('admin.index.texture-uploads')],
    xAxis,
    data: [
      countByDay(users.map((u) => u.register_at)),
      countByDay(textures.map((t) => t.upload_at)),
    ],
  });
});

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(str: string): Date {
  const [datePart = ''] = str.split(' ');
  const [y = 0, m = 1, d = 1] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---------- 用户管理 ----------

adminRoutes.get('/users/list', async (c) => {
  const q = c.req.query('q');
  const page = intQuery(c, 'page', 1);

  if (q) {
    return paginate(
      c,
      `SELECT * FROM users WHERE email LIKE ? OR nickname LIKE ? OR CAST(uid AS TEXT) LIKE ? ORDER BY uid`,
      [`%${q}%`, `%${q}%`, `%${q}%`],
      10,
      page,
    );
  }
  return paginate(c, 'SELECT * FROM users ORDER BY uid', [], 10, page);
});

/** 目标用户权限校验 (不能操作权限不低于自己的用户) */
async function checkTargetUser(
  c: CompatContext,
  target: UserRow,
): Promise<Response | null> {
  const authUser = c.get('user')!;
  if (target.uid !== authUser.uid && target.permission >= authUser.permission) {
    return forbidden(await c.get('trans')('admin.users.operations.no-permission'));
  }
  return null;
}

adminRoutes.put('/users/:uid/email', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { email: 'required|email' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const email = String(body.email);
  const exists = await c.env.DB.prepare('SELECT uid FROM users WHERE email = ? AND uid != ? LIMIT 1')
    .bind(email, user.uid)
    .first();
  if (exists) return jsonError(await trans('validation.unique'), 1);

  await c.env.DB.prepare('UPDATE users SET email = ? WHERE uid = ?').bind(email, user.uid).run();
  return json(await trans('admin.users.operations.email.success'), 0);
});

adminRoutes.put('/users/:uid/verification', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  await c.env.DB.prepare('UPDATE users SET verified = ? WHERE uid = ?')
    .bind(user.verified ? 0 : 1, user.uid)
    .run();
  return json(await trans('admin.users.operations.verification.success'), 0);
});

adminRoutes.put('/users/:uid/nickname', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { nickname: 'required' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const nickname = String(body.nickname);
  await c.env.DB.prepare('UPDATE users SET nickname = ? WHERE uid = ?').bind(nickname, user.uid).run();
  return json(await trans('admin.users.operations.nickname.success', { new: nickname }), 0);
});

adminRoutes.put('/users/:uid/password', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { password: 'required|min:8|max:16' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const method = c.env.PWD_METHOD ?? 'BCRYPT';
  const salt = c.env.SALT ?? '';
  const hashed = await hashPassword(method, String(body.password), salt);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE uid = ?').bind(hashed, user.uid).run();
  return json(await trans('admin.users.operations.password.success'), 0);
});

adminRoutes.put('/users/:uid/score', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { score: 'required|integer' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  await c.env.DB.prepare('UPDATE users SET score = ? WHERE uid = ?').bind(Number(body.score), user.uid).run();
  return json(await trans('admin.users.operations.score.success'), 0);
});

adminRoutes.put('/users/:uid/permission', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  const authUser = c.get('user')!;
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(
    body,
    { permission: `required|in:${PERMISSION.BANNED},${PERMISSION.NORMAL},${PERMISSION.ADMIN}` },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const permission = Number(body.permission);
  if (permission === PERMISSION.ADMIN && authUser.permission < PERMISSION.SUPER_ADMIN) {
    return forbidden(await trans('admin.users.operations.no-permission'));
  }
  if (user.uid === authUser.uid) {
    return forbidden(await trans('admin.users.operations.no-permission'));
  }

  await c.env.DB.prepare('UPDATE users SET permission = ? WHERE uid = ?').bind(permission, user.uid).run();
  return json(await trans('admin.users.operations.permission'), 0);
});

adminRoutes.delete('/users/:uid', async (c) => {
  const trans = c.get('trans');
  const user = await loadUser(c, Number(c.req.param('uid')));
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);
  const blocked = await checkTargetUser(c, user);
  if (blocked) return blocked;

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM players WHERE uid = ?').bind(user.uid),
    c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ?').bind(user.uid),
    c.env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(user.uid),
  ]);
  return json(await trans('admin.users.operations.delete.success'), 0);
});

// ---------- 玩家管理 ----------

adminRoutes.get('/players/list', async (c) => {
  const q = c.req.query('q');
  const page = intQuery(c, 'page', 1);
  if (q) {
    return paginate(
      c,
      `SELECT * FROM players WHERE name LIKE ? OR CAST(pid AS TEXT) LIKE ? OR CAST(uid AS TEXT) LIKE ? ORDER BY pid`,
      [`%${q}%`, `%${q}%`, `%${q}%`],
      10,
      page,
    );
  }
  return paginate(c, 'SELECT * FROM players ORDER BY pid', [], 10, page);
});

async function checkTargetPlayer(
  c: CompatContext,
  player: PlayerRow,
): Promise<Response | null> {
  const currentUser = c.get('user')!;
  const owner = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(player.uid)
    .first<UserRow>();
  if (owner && owner.uid !== currentUser.uid && owner.permission >= currentUser.permission) {
    return forbidden(await c.get('trans')('admin.players.no-permission'));
  }
  return null;
}

adminRoutes.put('/players/:pid/name', async (c) => {
  const trans = c.get('trans');
  const player = await loadPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError(await trans('general.illegal-parameters'), 1);
  const blocked = await checkTargetPlayer(c, player);
  if (blocked) return blocked;

  const body = await readBody(c);
  const nameRuleConfig = String(await option(c.env, 'player_name_rule'));
  const customPlayerRegexp = String(await option(c.env, 'custom_player_name_regexp'));
  const result = await validate(
    body,
    {
      player_name: [
        'required',
        `min:${await option(c.env, 'player_name_length_min')}`,
        `max:${await option(c.env, 'player_name_length_max')}`,
        'unique:players,name',
        {
          kind: 'custom',
          name: `user.player.player-name-rule.${nameRuleConfig}`,
          test: (value: unknown) =>
            validatePlayerName(String(value), {
              rule: nameRuleConfig,
              customRegexp: customPlayerRegexp,
            }),
        },
      ],
    },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const name = String(body.player_name);
  await c.env.DB.prepare('UPDATE players SET name = ?, last_modified = ? WHERE pid = ?')
    .bind(name, now(), player.pid)
    .run();
  return json(await trans('admin.players.name.success', { player: name }), 0);
});

adminRoutes.put('/players/:pid/owner', async (c) => {
  const trans = c.get('trans');
  const player = await loadPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError(await trans('general.illegal-parameters'), 1);
  const blocked = await checkTargetPlayer(c, player);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { uid: 'required|integer' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const uid = Number(body.uid);
  const user = await loadUser(c, uid);
  if (!user) return jsonError(await trans('admin.users.operations.non-existent'), 1);

  await c.env.DB.prepare('UPDATE players SET uid = ? WHERE pid = ?').bind(uid, player.pid).run();
  return json(await trans('admin.players.owner.success', { player: player.name, user: user.nickname }), 0);
});

adminRoutes.put('/players/:pid/textures', async (c) => {
  const trans = c.get('trans');
  const player = await loadPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError(await trans('general.illegal-parameters'), 1);
  const blocked = await checkTargetPlayer(c, player);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(
    body,
    { tid: 'required|integer', type: 'required|in:skin,cape' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const tid = Number(body.tid);
  const type = String(body.type);
  if (tid !== 0) {
    const texture = await c.env.DB.prepare('SELECT tid FROM textures WHERE tid = ? LIMIT 1')
      .bind(tid)
      .first();
    if (!texture) {
      return jsonError(await trans('admin.players.textures.non-existent', { tid }), 1);
    }
  }

  const field = type === 'skin' ? 'tid_skin' : 'tid_cape';
  await c.env.DB.prepare(`UPDATE players SET ${field} = ?, last_modified = ? WHERE pid = ?`)
    .bind(tid, now(), player.pid)
    .run();
  return json(await trans('admin.players.textures.success', { player: player.name }), 0);
});

adminRoutes.delete('/players/:pid', async (c) => {
  const trans = c.get('trans');
  const player = await loadPlayer(c, Number(c.req.param('pid')));
  if (!player) return jsonError(await trans('general.illegal-parameters'), 1);
  const blocked = await checkTargetPlayer(c, player);
  if (blocked) return blocked;

  await c.env.DB.prepare('DELETE FROM players WHERE pid = ?').bind(player.pid).run();
  return json(await trans('admin.players.delete.success'), 0);
});

// ---------- 衣柜管理 ----------

adminRoutes.get('/closet/:uid', async (c) => {
  const uid = Number(c.req.param('uid'));
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, uc.item_name FROM user_closet uc
     JOIN textures t ON t.tid = uc.texture_tid
     WHERE uc.user_uid = ? ORDER BY uc.texture_tid DESC`,
  )
    .bind(uid)
    .all();
  return c.json(results);
});

adminRoutes.post('/closet/:uid', async (c) => {
  const trans = c.get('trans');
  const uid = Number(c.req.param('uid'));
  const body = await readBody(c);
  const tid = Number(body.tid);

  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();
  if (!texture) return jsonError(await trans('user.closet.add.not-found'), 1);

  const existing = await c.env.DB.prepare(
    'SELECT 1 AS f FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(uid, tid)
    .first();
  if (existing) return jsonError(await trans('user.closet.add.repeated'), 1);

  await c.env.DB.prepare('INSERT INTO user_closet (user_uid, texture_tid, item_name) VALUES (?, ?, ?)')
    .bind(uid, tid, texture.name)
    .run();

  return jsonData({ user: uid, texture: textureToJson(texture as unknown as Record<string, unknown>) });
});

adminRoutes.delete('/closet/:uid', async (c) => {
  const trans = c.get('trans');
  const uid = Number(c.req.param('uid'));
  const body = await readBody(c);
  const tid = Number(body.tid);

  const item = await c.env.DB.prepare(
    'SELECT 1 AS f FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(uid, tid)
    .first();
  if (!item) return jsonError(await trans('user.closet.remove.non-existent'), 1);

  await c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ? AND texture_tid = ?')
    .bind(uid, tid)
    .run();
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();

  return jsonData({
    user: uid,
    texture: texture ? textureToJson(texture as unknown as Record<string, unknown>) : null,
  });
});

// ---------- 举报管理 ----------

adminRoutes.get('/reports/list', async (c) => {
  const page = intQuery(c, 'page', 1);
  return paginate(
    c,
    `SELECT r.*, t.name AS texture_name, tu.nickname AS uploader_nickname, ru.nickname AS reporter_nickname
     FROM reports r
     LEFT JOIN textures t ON t.tid = r.tid
     LEFT JOIN users tu ON tu.uid = r.uploader
     LEFT JOIN users ru ON ru.uid = r.reporter
     ORDER BY r.report_at DESC`,
    [],
    9,
    page,
  );
});

adminRoutes.put('/reports/:id', async (c) => {
  const trans = c.get('trans');
  const authUser = c.get('user')!;
  const id = Number(c.req.param('id'));

  const report = await c.env.DB.prepare('SELECT * FROM reports WHERE id = ? LIMIT 1')
    .bind(id)
    .first<ReportRow>();
  if (!report) return jsonError(await trans('general.illegal-parameters'), 1);

  const body = await readBody(c);
  const result = await validate(body, { action: 'required|in:delete,ban,reject' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const action = String(body.action);
  const scoreMod = Number(await getOption(c.env, 'reporter_score_modification', 0));
  const reward = Number(await getOption(c.env, 'reporter_reward_score', 0));

  if (action === 'reject') {
    if (scoreMod > 0 && report.status === 0) {
      await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
        .bind(scoreMod, report.reporter)
        .run();
    }
    await c.env.DB.prepare('UPDATE reports SET status = 2 WHERE id = ?').bind(id).run();
    return json(await trans('general.op-success'), 0, { status: 2 });
  }

  if (action === 'ban') {
    const uploader = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
      .bind(report.uploader)
      .first<UserRow>();
    if (!uploader) {
      return jsonError(await trans('admin.users.operations.non-existent'), 1);
    }
    if (authUser.permission <= uploader.permission) {
      return jsonError(await trans('admin.users.operations.no-permission'), 1);
    }
    await c.env.DB.prepare('UPDATE users SET permission = ? WHERE uid = ?')
      .bind(PERMISSION.BANNED, uploader.uid)
      .run();
  }

  if (action === 'delete') {
    const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
      .bind(report.tid)
      .first<TextureRow>();
    if (texture) {
      // 文件仅在被引用数为 1 时删除
      const refs = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM textures WHERE hash = ?')
        .bind(texture.hash)
        .first<{ c: number }>();
      if ((refs?.c ?? 0) === 1) {
        await c.env.TEXTURES.delete(texture.hash);
      }
      await deleteTexture(c, texture);
    } else {
      // 纹理已被上传者删除:返还积分但无奖励
      if (report.status === 0 && scoreMod < 0) {
        await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
          .bind(scoreMod, report.reporter)
          .run();
      }
      await c.env.DB.prepare('UPDATE reports SET status = 1 WHERE id = ?').bind(id).run();
      return json(await trans('general.texture-deleted'), 0, { status: 1 });
    }
  }

  // 处理完成:返还举报扣分 + 发放奖励
  if (report.status === 0) {
    if (scoreMod < 0) {
      await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
        .bind(scoreMod, report.reporter)
        .run();
    }
    if (reward > 0) {
      await c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?')
        .bind(reward, report.reporter)
        .run();
    }
  }
  await c.env.DB.prepare('UPDATE reports SET status = 1 WHERE id = ?').bind(id).run();
  return json(await trans('general.op-success'), 0, { status: 1 });
});

// ---------- 通知群发 ----------

adminRoutes.post('/notifications/send', async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);

  const result = await validate(
    body,
    {
      receiver: 'required|in:all,normal,uid,email',
      uid: 'nullable|integer',
      email: 'nullable|email',
      title: 'required|max:20',
      content: 'string|nullable',
    },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const receiver = String(body.receiver);
  let users: { uid: number }[] = [];
  if (receiver === 'all') {
    const { results } = await c.env.DB.prepare('SELECT uid FROM users').all<{ uid: number }>();
    users = results;
  } else if (receiver === 'normal') {
    const { results } = await c.env.DB.prepare('SELECT uid FROM users WHERE permission = 0').all<{ uid: number }>();
    users = results;
  } else if (receiver === 'uid') {
    const { results } = await c.env.DB.prepare('SELECT uid FROM users WHERE uid = ?').bind(Number(body.uid)).all<{ uid: number }>();
    users = results;
  } else if (receiver === 'email') {
    const { results } = await c.env.DB.prepare('SELECT uid FROM users WHERE email = ?').bind(String(body.email)).all<{ uid: number }>();
    users = results;
  }

  const data = JSON.stringify({ title: String(body.title), content: String(body.content ?? '') });
  const createdAt = now();
  const ops = users.map((u) =>
    c.env.DB.prepare(
      `INSERT INTO notifications (id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).bind(randomHex(32), 'App\\Notifications\\SiteMessage', 'App\\Models\\User', u.uid, data, createdAt, createdAt),
  );
  if (ops.length > 0) {
    await c.env.DB.batch(ops);
  }

  return json(await trans('admin.notifications.send.success'), 0);
});

// ---------- 站点选项 (score / customize / resource / options 页) ----------

// 各管理页面可编辑的选项键 (对应 OptionsController 各页 OptionForm 字段,按原站分组)
// customize: homepage 表单 + customJsCss 表单 + color 分支
// options: general + announ + meta + recaptcha 表单
// resource: resources 表单 + cache 表单
export const OPTION_PAGES: Record<string, { group: string; keys: string[] }[]> = {
  customize: [
    { group: 'homepage', keys: ['home_pic_url', 'favicon_url', 'transparent_navbar', 'hide_intro', 'fixed_bg', 'copyright_prefer', 'copyright_text'] },
    { group: 'customJsCss', keys: ['custom_css', 'custom_js'] },
    { group: 'colors', keys: ['navbar_color', 'sidebar_color'] },
  ],
  score: [
    { group: 'rate', keys: ['score_per_storage', 'private_score_per_storage', 'score_per_closet_item', 'return_score', 'score_per_player', 'user_initial_score'] },
    { group: 'report', keys: ['reporter_score_modification', 'reporter_reward_score'] },
    { group: 'sign', keys: ['sign_score', 'sign_gap_time', 'sign_after_zero'] },
    { group: 'sharing', keys: ['score_award_per_texture', 'take_back_scores_after_deletion', 'score_award_per_like'] },
  ],
  options: [
    { group: 'general', keys: ['site_name', 'site_description', 'site_url', 'register_with_player_name', 'require_verification', 'regs_per_ip', 'max_upload_file_size', 'max_texture_width', 'player_name_rule', 'custom_player_name_regexp', 'player_name_length_min', 'player_name_length_max', 'auto_del_invalid_texture', 'allow_downloading_texture', 'status_code_for_private', 'texture_name_regexp', 'content_policy'] },
    { group: 'announ', keys: ['announcement'] },
    { group: 'meta', keys: ['meta_keywords', 'meta_description', 'meta_extras'] },
    { group: 'recaptcha', keys: ['recaptcha_sitekey', 'recaptcha_secretkey', 'recaptcha_invisible'] },
  ],
  resource: [
    { group: 'resources', keys: ['force_ssl', 'auto_detect_asset_url', 'cache_expire_time', 'cdn_address'] },
  ],
};

adminRoutes.get('/options/:page', async (c) => {
  const page = c.req.param('page') ?? '';
  const groups = OPTION_PAGES[page];
  if (!groups) return jsonError(await c.get('trans')('general.illegal-parameters'), 1);

  const out: Record<string, unknown> = {};
  for (const { keys } of groups) {
    for (const key of keys) {
      out[key] = await getOption(c.env, key);
    }
  }
  return c.json(out);
});

adminRoutes.post('/options/:page', async (c) => {
  const trans = c.get('trans');
  const page = c.req.param('page') ?? '';
  const groups = OPTION_PAGES[page];
  if (!groups) return jsonError(await trans('general.illegal-parameters'), 1);

  const body = await readBody(c);
  for (const { keys } of groups) {
    for (const key of keys) {
      if (body[key] !== undefined) {
        await setOption(c.env, key, String(body[key]));
      }
    }
  }
  return json(await trans('general.op-success'), 0);
});

// ---------- i18n 管理 ----------

adminRoutes.get('/i18n/list', async (c) => {
  return paginate(
    c,
    'SELECT * FROM language_lines ORDER BY id',
    [],
    10,
    intQuery(c, 'page', 1),
  );
});

adminRoutes.post('/i18n', async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const result = await validate(
    body,
    { group: 'required', key: 'required', text: 'required' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  await c.env.DB.prepare(
    `INSERT INTO language_lines ("group", "key", text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(String(body.group), String(body.key), String(body.text), now(), now())
    .run();

  return json(await trans('general.op-success'), 0);
});

adminRoutes.put('/i18n/:id', async (c) => {
  const trans = c.get('trans');
  const id = Number(c.req.param('id'));
  const body = await readBody(c);
  const result = await validate(body, { text: 'required' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  await c.env.DB.prepare('UPDATE language_lines SET text = ?, updated_at = ? WHERE id = ?')
    .bind(String(body.text), now(), id)
    .run();
  return json(await trans('admin.i18n.updated'), 0);
});

adminRoutes.delete('/i18n/:id', async (c) => {
  const trans = c.get('trans');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM language_lines WHERE id = ?').bind(id).run();
  return json(await trans('admin.i18n.deleted'), 0);
});

// ---------- 通用辅助 ----------

async function loadUser(c: { env: Env }, uid: number): Promise<UserRow | null> {
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(uid)
    .first<UserRow>();
  return user ?? null;
}

async function loadPlayer(c: { env: Env }, pid: number): Promise<PlayerRow | null> {
  const player = await c.env.DB.prepare('SELECT * FROM players WHERE pid = ? LIMIT 1')
    .bind(pid)
    .first<PlayerRow>();
  return player ?? null;
}

import { ReportRow } from '@/lib/server/types';
import { textureToJson } from './helpers';

// ---------- 仪表盘统计 (对应 AdminController::index 的 sum) ----------

adminRoutes.get('/summary', async (c) => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>();
  const players = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM players').first<{ c: number }>();
  const textures = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM textures').first<{ c: number }>();
  const storage = await c.env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS s FROM textures').first<{ s: number }>();
  return c.json({
    users: users?.c ?? 0,
    players: players?.c ?? 0,
    textures: textures?.c ?? 0,
    storage: storage?.s ?? 0,
  });
});

// ---------- 后台页面数据 (对应各 admin 视图的 extra,含当前用户) ----------

adminRoutes.get('/extra', async (c) => {
  const user = c.get('user')!;
  return jsonData({
    extra: {
      currentUser: userToJson(user as unknown as Record<string, unknown>),
    },
  });
});

// ---------- 运行状态 (对应 AdminController::status) ----------

adminRoutes.get('/status', async (c) => {
  const detail = {
    bs: {
      version: '6.0.2',
      env: 'production',
      debug: false,
      commit: '',
      laravel: '—',
    },
    server: {
      php: '—',
      web: 'Cloudflare Workers',
      os: '—',
    },
    db: {
      type: 'D1 (SQLite)',
      host: '—',
      port: '—',
      username: '—',
      database: 'D1',
      prefix: '',
    },
  };
  return jsonData({ detail, plugins: [] });
});
