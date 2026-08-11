/**
 * 衣柜路由,对应 ClosetController。
 */

import { CompatRouter } from '@/lib/server/compat';
import { requireAuth, AppVariables } from '@/lib/server/guards';
import { json, jsonData, jsonError, jsonValidationError } from '@/lib/server/response';
import { validate } from '@/lib/server/validate';
import { option, boolOption, getOption } from '@/lib/server/options';
import { PERMISSION } from '@/lib/server/types';
import { readBody, textureToJson, paginate, intQuery, intValue } from './helpers';

export const closetRoutes = new CompatRouter();

closetRoutes.use('*', requireAuth);

// ---------- 列表 (分页) ----------

closetRoutes.get('/list', async (c) => {
  const user = c.get('user')!;
  const category = c.req.query('category') ?? 'skin';
  const q = c.req.query('q');
  const perPage = intQuery(c, 'perPage', 6);
  const page = intQuery(c, 'page', 1);

  const whereType =
    category === 'cape' ? "t.type = 'cape'" : "t.type IN ('steve', 'alex')";
  const whereQ = q ? `AND uc.item_name LIKE ?` : '';
  const params: unknown[] = [user.uid];
  if (q) params.push(`%${q}%`);

  return paginate(
    c,
    `SELECT t.*, uc.item_name, uc.user_uid AS pivot_user_uid, uc.texture_tid AS pivot_texture_tid
     FROM user_closet uc
     JOIN textures t ON t.tid = uc.texture_tid
     WHERE uc.user_uid = ? ${whereQ} AND ${whereType}
     ORDER BY uc.texture_tid DESC`,
    params,
    perPage,
    page,
    (row) => ({
      ...textureToJson(row),
      pivot: {
        user_uid: row.pivot_user_uid,
        texture_tid: row.pivot_texture_tid,
        item_name: row.item_name,
      },
    }),
  );
});

// ---------- 全部 ID ----------

closetRoutes.get('/ids', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    'SELECT texture_tid FROM user_closet WHERE user_uid = ?',
  )
    .bind(user.uid)
    .all<{ texture_tid: number }>();
  return c.json(results.map((r) => r.texture_tid));
});

// ---------- 添加 ----------

closetRoutes.post('', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const body = await readBody(c);

  const result = await validate(
    body,
    { tid: 'required|integer' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const tid = intValue(body.tid);
  const name = String(body.name ?? '');

  const cost = Number(await option(c.env, 'score_per_closet_item'));
  if (user.score < cost) {
    return jsonError(await trans('user.closet.add.lack-score'), 1);
  }

  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first();
  if (!texture) {
    return jsonError(await trans('user.closet.add.not-found'), 1);
  }
  if (!texture.public && texture.uploader !== user.uid && user.permission < PERMISSION.ADMIN) {
    return jsonError(await trans('skinlib.show.private'), 1);
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 AS found FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(user.uid, tid)
    .first();
  if (existing) {
    return jsonError(await trans('user.closet.add.repeated'), 1);
  }

  await c.env.DB.prepare(
    'INSERT INTO user_closet (user_uid, texture_tid, item_name) VALUES (?, ?, ?)',
  )
    .bind(user.uid, tid, name)
    .run();
  await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
    .bind(cost, user.uid)
    .run();
  await c.env.DB.prepare('UPDATE textures SET likes = likes + 1 WHERE tid = ?')
    .bind(tid)
    .run();

  // 上传者获得点赞奖励 (自己点赞不奖励)
  const award = Number(await getOption(c.env, 'score_award_per_like', 0));
  if (award > 0 && texture.uploader !== user.uid) {
    await c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?')
      .bind(award, texture.uploader)
      .run();
  }

  return json(await trans('user.closet.add.success', { name }), 0);
});

// ---------- 重命名 ----------

closetRoutes.put('/:tid', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const tid = Number(c.req.param('tid'));
  const body = await readBody(c);

  const result = await validate(body, { name: 'required' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const item = await c.env.DB.prepare(
    'SELECT 1 AS found FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(user.uid, tid)
    .first();
  if (!item) {
    return jsonError(await trans('user.closet.remove.non-existent'), 1);
  }

  await c.env.DB.prepare('UPDATE user_closet SET item_name = ? WHERE user_uid = ? AND texture_tid = ?')
    .bind(String(body.name), user.uid, tid)
    .run();

  return json(await trans('user.closet.rename.success', { name: String(body.name) }), 0);
});

// ---------- 移除 ----------

closetRoutes.delete('/:tid', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const tid = Number(c.req.param('tid'));

  const item = await c.env.DB.prepare(
    'SELECT 1 AS found FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
  )
    .bind(user.uid, tid)
    .first();
  if (!item) {
    return jsonError(await trans('user.closet.remove.non-existent'), 1);
  }

  await c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ? AND texture_tid = ?')
    .bind(user.uid, tid)
    .run();

  if ((await boolOption(c.env, 'return_score')) as boolean) {
    const cost = Number(await option(c.env, 'score_per_closet_item'));
    await c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?')
      .bind(cost, user.uid)
      .run();
  }

  await c.env.DB.prepare('UPDATE textures SET likes = MAX(likes - 1, 0) WHERE tid = ?')
    .bind(tid)
    .run();

  const award = Number(await getOption(c.env, 'score_award_per_like', 0));
  const texture = await c.env.DB.prepare('SELECT uploader FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<{ uploader: number }>();
  if (award > 0 && texture && texture.uploader !== user.uid) {
    await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
      .bind(award, texture.uploader)
      .run();
  }

  return json(await trans('user.closet.remove.success'), 0);
});

// ---------- 页面数据 (对应 ClosetController::index 的 extra) ----------

closetRoutes.get('', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const nameRuleConfig = String(await option(c.env, 'player_name_rule'));
  return jsonData({
    extra: {
      unverified:
        ((await boolOption(c.env, 'require_verification')) as boolean) && !user.verified,
      rule: await trans(`user.player.player-name-rule.${nameRuleConfig}`),
      length: await trans('user.player.player-name-length', {
        min: String(await option(c.env, 'player_name_length_min')),
        max: String(await option(c.env, 'player_name_length_max')),
      }),
    },
  });
});
