/**
 * 用户中心路由,对应 UserController + NotificationsController (web 部分)。
 */

import { CompatRouter } from '@/lib/server/compat';
import { requireAuth, requireVerified, AppVariables } from '@/lib/server/guards';
import { json, jsonData, jsonError, jsonValidationError, forbidden } from '@/lib/server/response';
import { validate } from '@/lib/server/validate';
import { option, boolOption } from '@/lib/server/options';
import { verifyPassword, hashPassword } from '@/lib/server/ciphers';
import { destroySession, clearSessionCookie } from '@/lib/server/session';
import { now, UserRow, PERMISSION, NotificationRow, formatDateTime } from '@/lib/server/types';
import { readBody, userToJson } from './helpers';
import { sendMail } from './auth';
import { temporarySignedUrl } from '@/lib/server/signed-url';

export const userRoutes = new CompatRouter();

userRoutes.use('*', requireAuth);

// ---------- 积分信息 (用户首页) ----------

userRoutes.get('/score-info', async (c) => {
  const user = c.get('user')!;
  const players = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM players WHERE uid = ?')
    .bind(user.uid)
    .first<{ c: number }>();
  const storage = await c.env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS s FROM textures WHERE uploader = ?')
    .bind(user.uid)
    .first<{ s: number }>();

  return c.json({
    user: {
      score: user.score,
      lastSignAt: user.last_sign_at,
    },
    rate: {
      storage: Number(await option(c.env, 'score_per_storage')),
      players: Number(await option(c.env, 'score_per_player')),
    },
    usage: {
      players: players?.c ?? 0,
      storage: storage?.s ?? 0,
    },
    signAfterZero: (await boolOption(c.env, 'sign_after_zero')) as boolean,
    signGapTime: Number(await option(c.env, 'sign_gap_time')),
  });
});

// ---------- 每日签到 ----------

userRoutes.post('/sign', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;

  const signAfterZero = (await boolOption(c.env, 'sign_after_zero')) as boolean;
  const signGapTime = Number(await option(c.env, 'sign_gap_time'));

  // 计算距上次签到可再次签到的剩余秒数
  let remainingTime: number;
  if (signAfterZero) {
    const last = parseDate(user.last_sign_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const boundary = last.getTime() <= today.getTime() ? today : new Date(today.getTime() + 86400000);
    remainingTime = Math.floor((boundary.getTime() - Date.now()) / 1000);
  } else {
    const last = parseDate(user.last_sign_at).getTime() + signGapTime * 3600 * 1000;
    remainingTime = Math.floor((last - Date.now()) / 1000);
  }

  if (remainingTime > 0) {
    return jsonError('', 1);
  }

  const [min = 0, max = 0] = String(await option(c.env, 'sign_score')).split(',').map(Number);
  const acquiredScore = Math.floor(Math.random() * (max - min + 1)) + min;
  const newScore = user.score + acquiredScore;

  await c.env.DB.prepare('UPDATE users SET score = ?, last_sign_at = ? WHERE uid = ?')
    .bind(newScore, now(), user.uid)
    .run();

  return json(
    await trans('user.sign-success', { score: acquiredScore }),
    0,
    { score: newScore },
  );
});

// ---------- 资料修改 ----------

userRoutes.post('/profile', async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const user = c.get('user')!;
  const action = String(body.action ?? '');

  switch (action) {
    case 'nickname': {
      const result = await validate(body, { new_nickname: 'required' }, { env: c.env, locale: c.get('locale') });
      if (!result.ok) return jsonValidationError(result.errors);
      const nickname = String(body.new_nickname);
      await c.env.DB.prepare('UPDATE users SET nickname = ? WHERE uid = ?').bind(nickname, user.uid).run();
      return json(await trans('user.profile.nickname.success', { nickname }), 0);
    }

    case 'password': {
      const result = await validate(
        body,
        { current_password: 'required|min:6|max:32', new_password: 'required|min:8|max:32' },
        { env: c.env, locale: c.get('locale') },
      );
      if (!result.ok) return jsonValidationError(result.errors);

      const method = c.env.PWD_METHOD ?? 'BCRYPT';
      const salt = c.env.SALT ?? '';
      const ok = await verifyPassword(method, String(body.current_password), user.password, salt);
      if (!ok) {
        return jsonError(await trans('user.profile.password.wrong-password'), 1);
      }

      const hashed = await hashPassword(method, String(body.new_password), salt);
      await c.env.DB.prepare('UPDATE users SET password = ? WHERE uid = ?').bind(hashed, user.uid).run();

      await destroySession(c.env, c.req.raw);
      const secure = new URL(c.req.url).protocol === 'https:';
      const res = json(await trans('user.profile.password.success'), 0);
      res.headers.set('Set-Cookie', clearSessionCookie(secure));
      return res;
    }

    case 'email': {
      const result = await validate(
        body,
        { email: 'required|email', password: 'required|min:6|max:32' },
        { env: c.env, locale: c.get('locale') },
      );
      if (!result.ok) return jsonValidationError(result.errors);

      const existing = await c.env.DB.prepare('SELECT uid FROM users WHERE email = ? LIMIT 1')
        .bind(String(body.email))
        .first();
      if (existing) {
        return jsonError(await trans('user.profile.email.existed'), 1);
      }

      const method = c.env.PWD_METHOD ?? 'BCRYPT';
      const salt = c.env.SALT ?? '';
      const ok = await verifyPassword(method, String(body.password), user.password, salt);
      if (!ok) {
        return jsonError(await trans('user.profile.email.wrong-password'), 1);
      }

      await c.env.DB.prepare('UPDATE users SET email = ?, verified = 0 WHERE uid = ?')
        .bind(String(body.email), user.uid)
        .run();

      await destroySession(c.env, c.req.raw);
      const secure = new URL(c.req.url).protocol === 'https:';
      const res = json(await trans('user.profile.email.success'), 0);
      res.headers.set('Set-Cookie', clearSessionCookie(secure));
      return res;
    }

    case 'delete': {
      const result = await validate(body, { password: 'required|min:6|max:32' }, { env: c.env, locale: c.get('locale') });
      if (!result.ok) return jsonValidationError(result.errors);

      if (user.permission >= PERMISSION.ADMIN) {
        return jsonError(await trans('user.profile.delete.admin'), 1);
      }

      const method = c.env.PWD_METHOD ?? 'BCRYPT';
      const salt = c.env.SALT ?? '';
      const ok = await verifyPassword(method, String(body.password), user.password, salt);
      if (!ok) {
        return jsonError(await trans('user.profile.delete.wrong-password'), 1);
      }

      // 删除用户 (级联删除玩家,与 User::delete() 一致)
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM players WHERE uid = ?').bind(user.uid),
        c.env.DB.prepare('DELETE FROM user_closet WHERE user_uid = ?').bind(user.uid),
        c.env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(user.uid),
      ]);

      await destroySession(c.env, c.req.raw);
      const secure = new URL(c.req.url).protocol === 'https:';
      const res = json(await trans('user.profile.delete.success'), 0);
      res.headers.set('Set-Cookie', clearSessionCookie(secure));
      return res;
    }

    default:
      return jsonError(await trans('general.illegal-parameters'), 1);
  }
});

// ---------- 设置头像 ----------

userRoutes.post('/profile/avatar', async (c) => {
  const trans = c.get('trans');
  const body = await readBody(c);
  const user = c.get('user')!;

  const result = await validate(body, { tid: 'required|integer' }, { env: c.env, locale: c.get('locale') });
  if (!result.ok) return jsonValidationError(result.errors);

  const tid = Number(body.tid);
  if (tid === 0) {
    await c.env.DB.prepare('UPDATE users SET avatar = 0 WHERE uid = ?').bind(user.uid).run();
    return json(await trans('user.profile.avatar.success'), 0);
  }

  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(tid)
    .first();
  if (!texture) {
    return jsonError(await trans('skinlib.non-existent'), 1);
  }
  if (texture.type === 'cape') {
    return jsonError(await trans('user.profile.avatar.wrong-type'), 1);
  }
  if (!texture.public && user.uid !== texture.uploader && user.permission < PERMISSION.ADMIN) {
    return jsonError(await trans('skinlib.show.private'), 1);
  }

  await c.env.DB.prepare('UPDATE users SET avatar = ? WHERE uid = ?').bind(tid, user.uid).run();
  return json(await trans('user.profile.avatar.success'), 0);
});

// ---------- 发送验证邮件 ----------

userRoutes.post('/email-verification', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;

  if (!(await boolOption(c.env, 'require_verification'))) {
    return jsonError(await trans('user.verification.disabled'), 1);
  }

  // 60 秒限流 (存于 KV,key 关联用户)
  const limitKey = `last_mail_time:${user.uid}`;
  const last = Number((await c.env.KV_SKIN.get(limitKey)) ?? 0);
  if (60 + last > Math.floor(Date.now() / 1000)) {
    return jsonError(await trans('user.verification.frequent-mail'), 1);
  }

  if (user.verified) {
    return jsonError(await trans('user.verification.verified'), 1);
  }

  const key = c.env.APP_KEY ?? '';
  const url = await temporarySignedUrl(
    key,
    '/auth/verify/{uid}',
    { uid: user.uid },
    {},
    Math.floor(Date.now() / 1000) + 3600 * 24,
  );

  const siteName = String(await option(c.env, 'site_name'));
  const mailResult = await sendMail(c.env, user.email, {
    subject: `[${siteName}] ${await trans('user.verification.title')}`,
    html: `${await trans('user.verification.message')}<br><a href="${url}">${url}</a>`,
  });
  if (!mailResult.ok) {
    return jsonError(await trans('user.verification.failed', { msg: mailResult.error ?? '' }), 2);
  }

  await c.env.KV_SKIN.put(limitKey, String(Math.floor(Date.now() / 1000)), { expirationTtl: 3600 });
  return json(await trans('user.verification.success'), 0);
});

// ---------- 暗色模式 ----------

userRoutes.put('/dark-mode', async (c) => {
  const user = c.get('user')!;
  await c.env.DB.prepare('UPDATE users SET is_dark_mode = ? WHERE uid = ?')
    .bind(user.is_dark_mode ? 0 : 1, user.uid)
    .run();
  return new Response(null, { status: 204 });
});

// ---------- 我的举报记录 (对应 ReportController::track) ----------

userRoutes.get('/reports', async (c) => {
  const user = c.get('user')!;
  const page = Number(c.req.query('page') ?? 1);
  const { totalRes, ...rest } = await (async () => {
    const total = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM reports WHERE reporter = ?')
      .bind(user.uid)
      .first<{ c: number }>();
    return { totalRes: total?.c ?? 0 };
  })();
  void rest;

  const perPage = 10;
  const lastPage = Math.max(1, Math.ceil(totalRes / perPage));
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const offset = (currentPage - 1) * perPage;

  const { results } = await c.env.DB.prepare(
    `SELECT r.*, t.name AS texture_name, tu.nickname AS uploader_nickname
     FROM reports r
     LEFT JOIN textures t ON t.tid = r.tid
     LEFT JOIN users tu ON tu.uid = r.uploader
     WHERE r.reporter = ? ORDER BY r.report_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(user.uid, perPage, offset)
    .all();

  return jsonData({
    current_page: currentPage,
    data: results,
    from: totalRes === 0 ? null : offset + 1,
    last_page: lastPage,
    per_page: perPage,
    to: totalRes === 0 ? null : Math.min(offset + perPage, totalRes),
    total: totalRes,
  });
});

// ---------- 通知 ----------

userRoutes.post('/notifications/:id', async (c) => {
  const trans = c.get('trans');
  const user = c.get('user')!;
  const id = c.req.param('id');

  const notification = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE id = ? AND notifiable_type = 'App\\Models\\User' AND notifiable_id = ? LIMIT 1`,
  )
    .bind(id, user.uid)
    .first<NotificationRow>();
  if (!notification) {
    return jsonError(await trans('general.illegal-parameters'), 1);
  }

  if (!notification.read_at) {
    await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ?')
      .bind(now(), id)
      .run();
  }

  const data = JSON.parse(notification.data ?? '{}') as { title?: string; content?: string };
  // GitHub Flavored Markdown → HTML (简易转换:换行/链接/粗体)
  const content = mdToHtml(data.content ?? '');

  return jsonData({
    title: data.title ?? '',
    content,
    time: notification.created_at ?? '',
  });
});

/** 简易 GFM 转换 (对应 League\CommonMark,覆盖常用语法) */
function mdToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|\n)#{1,6}\s+(.+)/g, '$1<h3>$2</h3>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(
    /(^|\n)\s*[-*]\s+(.+)/g,
    '$1<li>$2</li>',
  );
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/** 'Y-m-d H:i:s' → Date (本地时区) */
function parseDate(str: string): Date {
  const [datePart = '', timePart = '00:00:00'] = str.split(' ');
  const [y = 0, m = 1, d = 1] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export { userToJson };

// ---------- 页面数据 (对应 UserController::index 的 extra) ----------

userRoutes.get('', async (c) => {
  const user = c.get('user')!;
  return jsonData({
    extra: {
      unverified:
        ((await boolOption(c.env, 'require_verification')) as boolean) && !user.verified,
    },
  });
});

// ---------- 未读通知列表 (对应原站 server 渲染的 data-notifications) ----------

userRoutes.get('/notifications/unread', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, data FROM notifications
     WHERE notifiable_type = 'App\Models\User' AND notifiable_id = ? AND read_at IS NULL
     ORDER BY created_at DESC LIMIT 10`,
  )
    .bind(user.uid)
    .all<{ id: string; data: string }>();
  return jsonData(
    results.map((row) => ({
      id: row.id,
      title: (JSON.parse(row.data) as { title?: string }).title ?? '',
    })),
  );
});
