/**
 * 玩家管理路由,对应 PlayerController。
 * 归属检查: 仅本人可操作 (对应构造函数 owner 中间件)。
 */

import { CompatRouter } from '@/lib/server/compat';
import { requireAuth, requireVerified, AppVariables } from '@/lib/server/guards';
import { json, jsonData, jsonError, jsonValidationError } from '@/lib/server/response';
import { validate, Rule } from '@/lib/server/validate';
import { option, boolOption } from '@/lib/server/options';
import { now, PlayerRow, UserRow } from '@/lib/server/types';
import { readBody, playerToJson } from './helpers';
import { validatePlayerName } from '@/lib/server/player-name';

export const playerRoutes = new CompatRouter();

playerRoutes.use('*', requireAuth, requireVerified);

async function loadPlayer(c: { env: Env }, pid: number): Promise<PlayerRow | null> {
  const player = await c.env.DB.prepare('SELECT * FROM players WHERE pid = ? LIMIT 1')
    .bind(pid)
    .first<PlayerRow>();
  return player ?? null;
}

/** 玩家名规则 (复用 PlayerName rule) */
async function playerNameRules(c: { env: Env }): Promise<Rule[]> {
  const nameRuleConfig = String(await option(c.env, 'player_name_rule'));
  const customRegexp = String(await option(c.env, 'custom_player_name_regexp'));
  return [
    'required',
    `min:${await option(c.env, 'player_name_length_min')}`,
    `max:${await option(c.env, 'player_name_length_max')}`,
    {
      kind: 'custom',
      name: `user.player.player-name-rule.${nameRuleConfig}`,
      test: (value: unknown) =>
        validatePlayerName(String(value), { rule: nameRuleConfig, customRegexp }),
    },
  ];
}

// ---------- 列表 ----------

playerRoutes.get('/list', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, t.type AS skin_type FROM players p
     LEFT JOIN textures t ON t.tid = p.tid_skin
     WHERE p.uid = ? ORDER BY p.pid`,
  )
    .bind(user.uid)
    .all();
  return c.json(results.map((row) => playerToJson(row as Record<string, unknown>)));
});

// ---------- 添加 ----------

playerRoutes.post('', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const body = await readBody(c);

  const rules = { name: [...(await playerNameRules(c)), 'unique:players'] };
  
  const result = await validate(body, rules, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const name = String(body.name);

  const cost = Number(await option(c.env, 'score_per_player'));
  if (user.score < cost) {
    return jsonError(await trans('user.player.add.lack-score'), 7);
  }

  const nowStr = now();
  const insertRes = await c.env.DB.prepare(
    `INSERT INTO players (uid, name, tid_skin, tid_cape, last_modified) VALUES (?, ?, 0, 0, ?)`,
  )
    .bind(user.uid, name, nowStr)
    .run();
  const pid = Number(insertRes.meta.last_row_id);

  await c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?')
    .bind(cost, user.uid)
    .run();

  const player = await loadPlayer(c, pid);
  return json(await trans('user.player.add.success', { name }), 0, playerToJson(player! as unknown as Record<string, unknown>));
});

// ---------- 删除 ----------

playerRoutes.delete('/:pid', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const pid = Number(c.req.param('pid'));
  const player = await loadPlayer(c, pid);
  if (!player) return jsonError(await trans('general.illegal-parameters'), 1);
  if (player.uid !== user.uid) {
    return Response.json({ code: 1, message: await trans('admin.players.no-permission') }, { status: 403 });
  }

  await c.env.DB.prepare('DELETE FROM players WHERE pid = ?').bind(pid).run();

  if ((await boolOption(c.env, 'return_score')) as boolean) {
    const cost = Number(await option(c.env, 'score_per_player'));
    await c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?')
      .bind(cost, user.uid)
      .run();
  }

  return json(await trans('user.player.delete.success', { name: player.name }), 0);
});

// ---------- 改名 ----------

playerRoutes.put('/:pid/name', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const pid = Number(c.req.param('pid'));
  const player = await loadPlayer(c, pid);
  if (!player || player.uid !== user.uid) {
    return Response.json({ code: 1, message: await trans('admin.players.no-permission') }, { status: 403 });
  }

  const body = await readBody(c);
  const rules = { name: [...(await playerNameRules(c)), 'unique:players'] };
  
  const result = await validate(body, rules, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const name = String(body.name);
  const old = player.name;
  await c.env.DB.prepare('UPDATE players SET name = ?, last_modified = ? WHERE pid = ?')
    .bind(name, now(), pid)
    .run();

  const updated = await loadPlayer(c, pid);
  return json(
    await trans('user.player.rename.success', { old, new: name }),
    0,
    playerToJson(updated! as unknown as Record<string, unknown>),
  );
});

// ---------- 设置材质 ----------

playerRoutes.put('/:pid/textures', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const pid = Number(c.req.param('pid'));
  const player = await loadPlayer(c, pid);
  if (!player || player.uid !== user.uid) {
    return Response.json({ code: 1, message: await trans('admin.players.no-permission') }, { status: 403 });
  }

  const body = await readBody(c);
  const result = await validate(body, { skin: 'nullable|integer', cape: 'nullable|integer' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  for (const type of ['skin', 'cape'] as const) {
    const tid = body[type];
    if (!tid) continue;

    const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
      .bind(Number(tid))
      .first();
    if (!texture) {
      return jsonError(await trans('skinlib.non-existent'), 1);
    }

    // 必须已在衣柜中 (对应 closet()->where('texture_tid', $tid)->doesntExist())
    const inCloset = await c.env.DB.prepare(
      'SELECT 1 AS found FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1',
    )
      .bind(user.uid, Number(tid))
      .first();
    if (!inCloset) {
      return jsonError(await trans('user.closet.remove.non-existent'), 1);
    }

    const field = type === 'skin' ? 'tid_skin' : 'tid_cape';
    await c.env.DB.prepare(`UPDATE players SET ${field} = ?, last_modified = ? WHERE pid = ?`)
      .bind(Number(tid), now(), pid)
      .run();
  }

  const updated = await loadPlayer(c, pid);
  return json(await trans('user.player.set.success', { name: player.name }), 0, playerToJson(updated! as unknown as Record<string, unknown>));
});

// ---------- 清除材质 ----------

playerRoutes.delete('/:pid/textures', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const pid = Number(c.req.param('pid'));
  const player = await loadPlayer(c, pid);
  if (!player || player.uid !== user.uid) {
    return Response.json({ code: 1, message: await trans('admin.players.no-permission') }, { status: 403 });
  }

  const body = await readBody(c);
  const types: string[] = Array.isArray(body.type) ? (body.type as string[]) : [];

  for (const type of ['skin', 'cape'] as const) {
    if (body[type] !== undefined || types.includes(type)) {
      const field = type === 'skin' ? 'tid_skin' : 'tid_cape';
      await c.env.DB.prepare(`UPDATE players SET ${field} = 0, last_modified = ? WHERE pid = ?`)
        .bind(now(), pid)
        .run();
    }
  }

  const updated = await loadPlayer(c, pid);
  return json(await trans('user.player.clear.success', { name: player.name }), 0, playerToJson(updated! as unknown as Record<string, unknown>));
});

// ---------- 页面数据 (对应 PlayerController::index 的 extra) ----------

playerRoutes.get('', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM players WHERE uid = ?')
    .bind(user.uid)
    .first<{ c: number }>();

  const nameRuleConfig = String(await option(c.env, 'player_name_rule'));
  return jsonData({
    extra: {
      count: count?.c ?? 0,
      rule: await trans(`user.player.player-name-rule.${nameRuleConfig}`),
      length: await trans('user.player.player-name-length', {
        min: String(await option(c.env, 'player_name_length_min')),
        max: String(await option(c.env, 'player_name_length_max')),
      }),
      score: user.score,
      cost: Number(await option(c.env, 'score_per_player')),
    },
  });
});
