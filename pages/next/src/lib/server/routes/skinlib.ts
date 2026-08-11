/**
 * 皮肤库路由,对应 SkinlibController + ReportController (web 部分)。
 */

import { CompatRouter, CompatContext } from '@/lib/server/compat';
import { requireAuth, requireVerified, AppVariables } from '@/lib/server/guards';
import { json, jsonData, jsonError, jsonValidationError, notFound } from '@/lib/server/response';
import { validate } from '@/lib/server/validate';
import { option, boolOption, getOption } from '@/lib/server/options';
import { TextureRow, UserRow, PERMISSION, now, ReportRow } from '@/lib/server/types';
import { readBody, textureToJson, paginate, intQuery, jsonData as data } from './helpers';
import { sanitizePng, sha256hex } from '@/lib/server/png';

export const skinlibRoutes = new CompatRouter();

async function loadTexture(c: { env: Env }, tid: number): Promise<TextureRow | null> {
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();
  return texture ?? null;
}

/** 隐私校验 (对应 SkinlibController 的 privacy 中间件) */
async function checkPrivacy(
  c: CompatContext,
  texture: TextureRow,
): Promise<Response | null> {
  if (!texture.public) {
    const user = c.get('user');
    const allowed = user && (user.uid === texture.uploader || user.permission >= PERMISSION.ADMIN);
    if (!allowed) {
      const statusCode = Number(await option(c.env, 'status_code_for_private'));
      if (statusCode === 404) {
        return notFound(await (await import('@/lib/server/i18n')).t('skinlib.show.deleted', undefined, { locale: c.get('locale') }));
      }
      return Response.json(
        { code: 1, message: await (await import('@/lib/server/i18n')).t('skinlib.show.private', undefined, { locale: c.get('locale') }) },
        { status: 403 },
      );
    }
  }
  return null;
}

// ---------- 皮肤库列表 ----------

skinlibRoutes.get('/skinlib/list', async (c) => {
  const user = c.get('user');
  const type = c.req.query('filter') ?? 'skin';
  const uploader = c.req.query('uploader');
  const keyword = c.req.query('keyword');
  const sort = c.req.query('sort') ?? 'time';
  const sortBy = sort === 'time' ? 'upload_at' : sort;
  const page = intQuery(c, 'page', 1);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type === 'skin') {
    conditions.push("t.type IN ('steve', 'alex')");
  } else {
    conditions.push('t.type = ?');
    params.push(type);
  }
  if (keyword) {
    conditions.push('t.name LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (uploader) {
    conditions.push('t.uploader = ?');
    params.push(Number(uploader));
  }
  if (user && user.permission < PERMISSION.ADMIN) {
    conditions.push('(t.public = 1 OR t.uploader = ?)');
    params.push(user.uid);
  } else if (!user) {
    conditions.push('t.public = 1');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSort = ['upload_at', 'likes', 'tid', 'name'].includes(sortBy) ? sortBy : 'upload_at';

  return paginate(
    c,
    `SELECT t.tid, t.name, t.type, t.uploader, t.public, t.likes, t.upload_at, u.nickname
     FROM textures t JOIN users u ON u.uid = t.uploader
     ${where} ORDER BY t.${allowedSort} DESC`,
    params,
    20,
    page,
  );
});

// ---------- 纹理信息 ----------

skinlibRoutes.get('/texture/:tid', async (c) => {
  const tid = Number(c.req.param('tid'));
  const texture = await loadTexture(c, tid);
  if (!texture) return notFound();
  const blocked = await checkPrivacy(c, texture);
  if (blocked) return blocked;
  return c.json(textureToJson(texture as unknown as Record<string, unknown>));
});

skinlibRoutes.get('/skinlib/info/:tid', async (c) => {
  const tid = Number(c.req.param('tid'));
  const texture = await loadTexture(c, tid);
  if (!texture) return notFound();
  const blocked = await checkPrivacy(c, texture);
  if (blocked) return blocked;
  return c.json(textureToJson(texture as unknown as Record<string, unknown>));
});

skinlibRoutes.get('/skinlib/show/:tid', async (c) => {
  const trans = c.get('trans');
  const tid = Number(c.req.param('tid'));
  const texture = await loadTexture(c, tid);
  if (!texture) return notFound();

  const blocked = await checkPrivacy(c, texture);
  if (blocked) return blocked;

  // 文件缺失检查 (R2)
  const file = await c.env.TEXTURES.get(texture.hash);
  if (!file) {
    if ((await boolOption(c.env, 'auto_del_invalid_texture')) as boolean) {
      await c.env.DB.prepare('DELETE FROM textures WHERE tid = ?').bind(tid).run();
    }
    return notFound(await trans('skinlib.show.deleted'));
  }

  const user = c.get('user');
  const uploader = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(texture.uploader)
    .first<UserRow>();

  const inCloset = user
    ? await c.env.DB.prepare('SELECT 1 AS f FROM user_closet WHERE user_uid = ? AND texture_tid = ? LIMIT 1')
        .bind(user.uid, tid)
        .first()
    : null;

  const badges = uploader && uploader.permission >= PERMISSION.ADMIN ? [{ text: 'STAFF', color: 'primary' }] : [];

  return jsonData({
    texture: textureToJson(texture as unknown as Record<string, unknown>),
    extra: {
      download: (await boolOption(c.env, 'allow_downloading_texture')) as boolean,
      currentUid: user ? user.uid : 0,
      admin: user ? user.permission >= PERMISSION.ADMIN : false,
      inCloset: !!inCloset,
      uploaderExists: !!uploader,
      nickname: uploader?.nickname ?? (await trans('general.unexistent-user')),
      report: Number(await getOption(c.env, 'reporter_score_modification', 0)),
      badges,
    },
  });
});

// ---------- 上传 ----------

skinlibRoutes.post('/texture', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;

  const form = await c.req.formData();
  const body: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) body[k] = v;

  const maxUpload = Number(await option(c.env, 'max_upload_file_size'));
  const nameRegexp = String(await option(c.env, 'texture_name_regexp'));
  const result = await validate(
    body,
    {
      name: nameRegexp ? `required|regexp:${nameRegexp}` : 'required',
      file: `required|mimes:png|max:${maxUpload}`,
      type: 'required|in:steve,alex,cape',
      public: 'required|boolean',
    },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) {
    console.log(
      '[upd]',
      JSON.stringify({
        keys: Object.keys(body),
        fileType: typeof body.file,
        fileIsCompat: !!(body.file && typeof body.file === 'object' && 'data' in body.file),
        fileStr: String(body.file).slice(0, 50),
        result,
      }),
    );
    return jsonValidationError(result.errors);
  }

  const file = form.get('file');
  if (!file || typeof file !== 'object' || !('data' in file)) {
    return jsonValidationError({ file: [await trans('validation.required')] });
  }

  const type = String(body.type);
  const isPublic = String(body.public) === '1' || body.public === true;

  // 解码 + 重新编码 (对应 getimagesize + Imagick re-encode)
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const png = sanitizePng(fileBytes);
  if (!png.ok || png.width === undefined || png.height === undefined) {
    return jsonValidationError({ file: [await trans('validation.mimes')] });
  }

  const maxWidth = Number(await getOption(c.env, 'max_texture_width', 8192));
  if (png.width > maxWidth) {
    return jsonError(
      await trans('skinlib.upload.too-wide', { width: png.width, maxWidth }),
      1,
    );
  }

  if (png.width % 64 !== 0 || png.height % 32 !== 0) {
    return jsonError(
      await trans('skinlib.upload.invalid-size', {
        type: await trans(type === 'cape' ? 'general.cape' : 'general.skin'),
        width: png.width,
        height: png.height,
      }),
      1,
    );
  }

  const ratio = png.width / png.height;
  if (type === 'steve' || type === 'alex') {
    if ((ratio !== 2 && ratio !== 1) || (type === 'alex' && ratio === 2)) {
      return jsonError(
        await trans('skinlib.upload.invalid-size', {
          type: await trans('general.skin'),
          width: png.width,
          height: png.height,
        }),
        1,
      );
    }
  } else if (type === 'cape') {
    if (ratio !== 2) {
      return jsonError(
        await trans('skinlib.upload.invalid-size', {
          type: await trans('general.cape'),
          width: png.width,
          height: png.height,
        }),
        1,
      );
    }
  }

  const hash = await sha256hex(png.data!);

  // 重复检测 (同 hash 且公开或同上传者)
  const duplicated = await c.env.DB.prepare(
    `SELECT * FROM textures WHERE hash = ? AND (public = 1 OR uploader = ?) LIMIT 1`,
  )
    .bind(hash, user.uid)
    .first<TextureRow>();
  if (duplicated) {
    return jsonError(await trans('skinlib.upload.repeated'), 2, { tid: duplicated.tid });
  }

  // 积分成本
  const fileSize = Math.ceil(png.data!.length / 1024);
  const cost =
    fileSize *
      Number(
        isPublic
          ? await option(c.env, 'score_per_storage')
          : await option(c.env, 'private_score_per_storage'),
      ) +
    Number(await option(c.env, 'score_per_closet_item')) -
    Number(await getOption(c.env, 'score_award_per_texture', 0));
  if (user.score < cost) {
    return jsonError(await trans('skinlib.upload.lack-score'), 1);
  }

  const uploadAt = now();
  const insertRes = await c.env.DB.prepare(
    `INSERT INTO textures (name, type, hash, size, uploader, public, likes, upload_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(String(body.name), type, hash, fileSize, user.uid, isPublic ? 1 : 0, uploadAt)
    .run();
  const tid = Number(insertRes.meta.last_row_id);

  // 写 R2 (去重: 文件已存在则跳过)
  const exists = await c.env.TEXTURES.head(hash);
  if (!exists) {
    await c.env.TEXTURES.put(hash, png.data!, {
      httpMetadata: { contentType: 'image/png' },
    });
  }

  // 扣分 + 自动加入衣柜
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET score = score - ? WHERE uid = ?').bind(cost, user.uid),
    c.env.DB.prepare('INSERT INTO user_closet (user_uid, texture_tid, item_name) VALUES (?, ?, ?)')
      .bind(user.uid, tid, String(body.name)),
  ]);

  return json(await trans('skinlib.upload.success', { name: String(body.name) }), 0, {
    tid,
  });
});

// ---------- 纹理管理 (归属校验) ----------

async function ownerCheck(
  c: CompatContext,
  texture: TextureRow,
): Promise<Response | null> {
  const user = c.get('user')!;
  if (texture.uploader !== user.uid && user.permission < PERMISSION.ADMIN) {
    const message = await (await import('@/lib/server/i18n')).t('skinlib.no-permission', undefined, { locale: c.get('locale') });
    return Response.json({ code: 1, message }, { status: 403 });
  }
  return null;
}

skinlibRoutes.put('/texture/:tid/type', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const texture = await loadTexture(c, Number(c.req.param('tid')));
  if (!texture) return notFound();
  const blocked = await ownerCheck(c, texture);
  if (blocked) return blocked;

  const body = await readBody(c);
  const result = await validate(body, { type: 'required|in:steve,alex,cape' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const type = String(body.type);
  await c.env.DB.prepare('UPDATE textures SET type = ? WHERE tid = ?').bind(type, texture.tid).run();
  return json(await trans('skinlib.model.success', { model: type }), 0);
});

skinlibRoutes.put('/texture/:tid/name', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const texture = await loadTexture(c, Number(c.req.param('tid')));
  if (!texture) return notFound();
  const blocked = await ownerCheck(c, texture);
  if (blocked) return blocked;

  const body = await readBody(c);
  const nameRegexp = String(await option(c.env, 'texture_name_regexp'));
  const result = await validate(
    body,
    { name: nameRegexp ? `required|regexp:${nameRegexp}` : 'required' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const name = String(body.name);
  await c.env.DB.prepare('UPDATE textures SET name = ? WHERE tid = ?').bind(name, texture.tid).run();
  return json(await trans('skinlib.rename.success', { name }), 0);
});

skinlibRoutes.put('/texture/:tid/privacy', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const texture = await loadTexture(c, Number(c.req.param('tid')));
  if (!texture) return notFound();
  const blocked = await ownerCheck(c, texture);
  if (blocked) return blocked;

  const uploader = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(texture.uploader)
    .first<UserRow>();
  if (!uploader) return jsonError(await trans('general.illegal-parameters'), 1);

  const scorePerStorage = Number(await option(c.env, 'score_per_storage'));
  const privatePerStorage = Number(await option(c.env, 'private_score_per_storage'));
  const scoreDiff =
    texture.size *
    (privatePerStorage - scorePerStorage) *
    (texture.public ? -1 : 1);
  if (texture.public && (await boolOption(c.env, 'take_back_scores_after_deletion')) as boolean) {
    // scoreDiff -= score_award_per_texture
  }
  if (uploader.score + scoreDiff < 0) {
    return jsonError(await trans('skinlib.upload.lack-score'), 1);
  }

  if (!texture.public) {
    const duplicated = await c.env.DB.prepare(
      'SELECT * FROM textures WHERE hash = ? AND public = 1 LIMIT 1',
    )
      .bind(texture.hash)
      .first<TextureRow>();
    if (duplicated) {
      return jsonError(await trans('skinlib.upload.repeated'), 2, { tid: duplicated.tid });
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?').bind(scoreDiff, uploader.uid),
    c.env.DB.prepare('UPDATE textures SET public = ? WHERE tid = ?').bind(texture.public ? 0 : 1, texture.tid),
  ]);

  const message = await trans('skinlib.privacy.success', {
    privacy: await trans(texture.public ? 'general.private' : 'general.public'),
  });
  return json(message, 0);
});

skinlibRoutes.delete('/texture/:tid', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const texture = await loadTexture(c, Number(c.req.param('tid')));
  if (!texture) return notFound();
  const blocked = await ownerCheck(c, texture);
  if (blocked) return blocked;

  // 文件仅在被引用数为 1 时删除 (对应 SkinlibController::delete)
  const refs = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM textures WHERE hash = ?')
    .bind(texture.hash)
    .first<{ c: number }>();
  if ((refs?.c ?? 0) === 1) {
    await c.env.TEXTURES.delete(texture.hash);
  }

  await deleteTexture(c, texture);
  return json(await trans('skinlib.delete.success'), 0);
});

/**
 * 删除纹理的完整副作用 (对应事件监听器):
 * - 移除所有非上传者的衣柜条目并返还积分 (CleanUpCloset)
 * - 重置引用该纹理的玩家材质 (ResetPlayers)
 * - 上传者积分返还 (UpdateScoreForDeletedTexture)
 */
export async function deleteTexture(
  c: { env: Env },
  texture: TextureRow,
): Promise<void> {
  const returnScore = (await boolOption(c.env, 'return_score')) as boolean;
  const closetCost = Number(await option(c.env, 'score_per_closet_item'));

  // 衣柜清理
  const likers = await c.env.DB.prepare(
    'SELECT user_uid FROM user_closet WHERE texture_tid = ? AND user_uid != ?',
  )
    .bind(texture.tid, texture.uploader)
    .all<{ user_uid: number }>();

  const ops = [c.env.DB.prepare('DELETE FROM user_closet WHERE texture_tid = ?').bind(texture.tid)];
  if (returnScore && likers.results.length > 0) {
    const ids = likers.results.map((r) => r.user_uid);
    ops.push(
      c.env.DB.prepare(
        `UPDATE users SET score = score + ? WHERE uid IN (${ids.map(() => '?').join(',')})`,
      ).bind(closetCost, ...ids),
    );
  }
  if (likers.results.length > 0) {
    ops.push(
      c.env.DB.prepare('UPDATE textures SET likes = MAX(likes - ?, 0) WHERE tid = ?').bind(
        likers.results.length,
        texture.tid,
      ),
    );
  }

  // 玩家材质重置
  const type = texture.type === 'cape' ? 'tid_cape' : 'tid_skin';
  ops.push(c.env.DB.prepare(`UPDATE players SET ${type} = 0 WHERE ${type} = ?`).bind(texture.tid));

  // 上传者积分返还
  const uploader = await c.env.DB.prepare('SELECT uid FROM users WHERE uid = ? LIMIT 1')
    .bind(texture.uploader)
    .first<{ uid: number }>();
  if (uploader) {
    let ret = 0;
    if (returnScore) {
      ret +=
        texture.size *
        (texture.public
          ? Number(await option(c.env, 'score_per_storage'))
          : Number(await option(c.env, 'private_score_per_storage')));
    }
    if (texture.public && (await boolOption(c.env, 'take_back_scores_after_deletion')) as boolean) {
      ret -= Number(await getOption(c.env, 'score_award_per_texture', 0));
    }
    ops.push(c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?').bind(ret, texture.uploader));
  }

  ops.push(c.env.DB.prepare('DELETE FROM textures WHERE tid = ?').bind(texture.tid));

  await c.env.DB.batch(ops);
}

// ---------- 举报 ----------

skinlibRoutes.post('/skinlib/report', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const reporter = c.get('user')!;
  const body = await readBody(c);

  const result = await validate(
    body,
    { tid: 'required|integer', reason: 'required' },
    { env: c.env, locale: c.get('locale') },
  );
  if (!result.ok) return jsonValidationError(result.errors);

  const tid = Number(body.tid);
  const reason = String(body.reason);

  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first<TextureRow>();
  if (!texture) {
    return jsonValidationError({ tid: [await trans('validation.exists')] });
  }

  const duplicate = await c.env.DB.prepare(
    'SELECT 1 AS f FROM reports WHERE reporter = ? AND tid = ? LIMIT 1',
  )
    .bind(reporter.uid, tid)
    .first();
  if (duplicate) {
    return jsonError(await trans('skinlib.report.duplicate'), 1);
  }

  const scoreMod = Number(await getOption(c.env, 'reporter_score_modification', 0));
  if (scoreMod < 0 && reporter.score < -scoreMod) {
    return jsonError(await trans('skinlib.upload.lack-score'), 1);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET score = score + ? WHERE uid = ?').bind(scoreMod, reporter.uid),
    c.env.DB.prepare(
      `INSERT INTO reports (tid, uploader, reporter, reason, status, report_at) VALUES (?, ?, ?, ?, 0, ?)`,
    ).bind(tid, texture.uploader, reporter.uid, reason, now()),
  ]);

  return json(await trans('skinlib.report.success'), 0);
});

// ---------- 我的举报记录 ----------

skinlibRoutes.get('/reports', requireAuth, async (c) => {
  const user = c.get('user')!;
  return paginate(
    c,
    'SELECT * FROM reports WHERE reporter = ? ORDER BY report_at DESC',
    [user.uid],
    10,
    intQuery(c, 'page', 1),
  );
});

// ---------- 上传页数据 (对应 SkinlibController::upload 的 extra) ----------

skinlibRoutes.get('/skinlib/upload', requireAuth, requireVerified, async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const regexp = String(await option(c.env, 'texture_name_regexp'));
  const contentPolicy = String(await option(c.env, 'content_policy'));

  return jsonData({
    extra: {
      rule: regexp
        ? await trans('skinlib.upload.name-rule-regexp', { regexp })
        : await trans('skinlib.upload.name-rule'),
      privacyNotice: await trans('skinlib.upload.private-score-notice', {
        score: String(await option(c.env, 'private_score_per_storage')),
      }),
      score: user.score,
      scorePublic: Number(await option(c.env, 'score_per_storage')),
      scorePrivate: Number(await option(c.env, 'private_score_per_storage')),
      closetItemCost: Number(await option(c.env, 'score_per_closet_item')),
      award: Number(await getOption(c.env, 'score_award_per_texture', 0)),
      contentPolicy: mdToHtml(contentPolicy),
    },
  });
});

/** 简易 Markdown → HTML (对应 GithubFlavoredMarkdownConverter) */
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|\n)\s*[-*]\s+(.+)/g, '$1<li>$2</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
}
