/**
 * Minecraft 静态接口,对应 TextureController (routes/static.php)。
 * 无 session/CSRF,全部走边缘缓存:
 *   - Cache-Control: public; max_age=cache_expire_time (默认 1 年)
 *   - 渲染产物 (preview/avatar) 存 KV 缓存 (key 与原站 Cache::remember 一致)
 */

import { CompatRouter } from '@/lib/server/compat';
import { getOption, boolOption } from '@/lib/server/options';
import { PlayerRow, TextureRow, UserRow, PERMISSION } from '@/lib/server/types';
import { decode, encode as encodePng } from 'fast-png';
import { renderSkin, renderCape, render2dAvatar, render3dAvatar, resizeNearest, RGBAImage } from '@/lib/server/renderer';
import { AVATAR_2D_B64, AVATAR_3D_B64 } from '@/lib/server/default-avatars';

export const staticRoutes = new CompatRouter();

// ---------- 工具 ----------

/** 纹理文件从 R2 读取 (对应 Storage::disk('textures') 的 get/missing/lastModified) */
async function getTextureFile(env: Env, hash: string): Promise<{ bytes: Uint8Array; lastModified: number } | null> {
  const object = await env.TEXTURES.get(hash);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const lastModified = Math.floor(object.uploaded.getTime() / 1000);
  return { bytes, lastModified };
}

/** 解码 PNG → RGBA 图像 */
function decodePng(bytes: Uint8Array): RGBAImage {
  const png = decode(bytes);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** 编码 RGBA → PNG */
function encodeImage(img: RGBAImage): Uint8Array {
  return new Uint8Array(encodePng({ width: img.width, height: img.height, data: img.data }));
}

/** KV 渲染缓存 (对应 Cache::remember,key 与原站一致) */
async function renderCached(
  env: Env,
  key: string,
  ttl: number,
  render: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const cached = await env.KV_SKIN.get(`render:${key}`, 'arrayBuffer');
  if (cached) {
    return new Uint8Array(cached);
  }
  const data = await render();
  await env.KV_SKIN.put(`render:${key}`, data, { expirationTtl: ttl });
  return data;
}

function parseDateMs(str: string): number {
  const [datePart = '', timePart = '00:00:00'] = str.split(' ');
  const [y = 0, m = 1, d = 1] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}

// ---------- 玩家 JSON (CustomSkinAPI R1) ----------

/** CustomSkinAPI R1 响应 (对应 Player::toJson + 封禁检查 + Last-Modified) */
export async function servePlayerJson(env: Env, player: PlayerRow): Promise<Response> {
  const user = await env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(player.uid)
    .first<UserRow>();
  if (user && user.permission === PERMISSION.BANNED) {
    const trans = await import('@/lib/server/i18n');
    const message = await trans.t('general.player-banned', undefined, { locale: 'zh_CN' });
    return new Response(JSON.stringify({ code: 1, message }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profile: Record<string, unknown> = {
    username: player.name,
    skins: {},
    cape: null,
  };
  if (player.tid_skin > 0) {
    const skin = await env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
      .bind(player.tid_skin)
      .first<TextureRow>();
    if (skin) {
      const model = skin.type === 'alex' ? 'slim' : 'default';
      (profile.skins as Record<string, string>)[model] = skin.hash;
    }
  }
  if (player.tid_cape > 0) {
    const cape = await env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
      .bind(player.tid_cape)
      .first<TextureRow>();
    if (cape) {
      profile.cape = cape.hash;
    }
  }

  const maxAge = Number(await getOption(env, 'cache_expire_time')) || 31536000;
  return new Response(JSON.stringify(profile), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`,
      'Last-Modified': new Date(parseDateMs(player.last_modified)).toUTCString(),
      ETag: `"${player.last_modified}"`,
    },
  });
}

// ---------- 纹理文件 ----------

staticRoutes.get('/textures/:hash', async (c) => {
  const hash = c.req.param('hash') ?? '';
  const file = await getTextureFile(c.env, hash);
  if (!file) {
    return new Response('Not Found', { status: 404 });
  }
  return pngResponse(file, c.env);
});

// CSL 兼容别名 (原站 routes/static.php)
staticRoutes.get('/csl/textures/:hash', async (c) => {
  const hash = c.req.param('hash') ?? '';
  const file = await getTextureFile(c.env, hash);
  if (!file) {
    return new Response('Not Found', { status: 404 });
  }
  return pngResponse(file, c.env);
});

// ---------- 原始下载 (需 allow_downloading_texture) ----------

staticRoutes.get('/raw/:tid', async (c) => {
  const allow = (await boolOption(c.env, 'allow_downloading_texture')) as boolean;
  if (!allow) {
    return new Response('Forbidden', { status: 403 });
  }
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(Number(c.req.param('tid')))
    .first<TextureRow>();
  if (!texture) {
    return new Response('Not Found', { status: 404 });
  }
  const file = await getTextureFile(c.env, texture.hash);
  if (!file) {
    return new Response('Not Found', { status: 404 });
  }
  return pngResponse(file, c.env);
});

async function pngResponse(
  file: { bytes: Uint8Array; lastModified: number },
  env: Env,
  etagSeed?: string,
): Promise<Response> {
  const maxAge = Number(await getOption(env, 'cache_expire_time')) || 31536000;
  return new Response(file.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(file.bytes.length),
      'Last-Modified': new Date(file.lastModified * 1000).toUTCString(),
      'Cache-Control': `public, max-age=${maxAge}`,
      ETag: `"${etagSeed ?? file.lastModified}"`,
    },
  });
}

// ---------- 头像 ----------

staticRoutes.get('/avatar/player/:name', async (c) => {
  const player = await c.env.DB.prepare('SELECT * FROM players WHERE name = ? LIMIT 1')
    .bind(c.req.param('name'))
    .first<PlayerRow>();
  if (!player) {
    return new Response('Not Found', { status: 404 });
  }
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(player.tid_skin)
    .first<TextureRow>();
  return avatar(c, texture ?? null);
});

staticRoutes.get('/avatar/user/:uid', async (c) => {
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1')
    .bind(Number(c.req.param('uid')))
    .first<UserRow>();
  const texture =
    user && user.avatar > 0
      ? await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
          .bind(user.avatar)
          .first<TextureRow>()
      : null;
  return avatar(c, texture ?? null);
});

staticRoutes.get('/avatar/hash/:hash', async (c) => {
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE hash = ? LIMIT 1')
    .bind(c.req.param('hash'))
    .first<TextureRow>();
  return avatar(c, texture ?? null);
});

staticRoutes.get('/avatar/:tid', async (c) => {
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(Number(c.req.param('tid')))
    .first<TextureRow>();
  return avatar(c, texture ?? null);
});

async function avatar(
  c: { env: Env; req: { url: string } },
  texture: TextureRow | null,
): Promise<Response> {
  if (texture && texture.type !== 'steve' && texture.type !== 'alex') {
    return new Response('Unprocessable Entity', { status: 422 });
  }

  const url = new URL(c.req.url);
  const size = Number(url.searchParams.get('size') ?? 100);
  const mode = url.searchParams.has('3d') ? '3d' : '2d';
  // 注: 原站默认输出 webp,此处统一输出 PNG (workerd 无 WebP 编码器,功能等价)

  const maxAge = Number(await getOption(c.env, 'cache_expire_time')) || 31536000;
  const file = texture ? await getTextureFile(c.env, texture.hash) : null;

  // 无纹理或文件缺失 → 默认头像 (对应 resource_path 分支)
  if (!texture || !file) {
    const defaultB64 = mode === '3d' ? AVATAR_3D_B64 : AVATAR_2D_B64;
    const bytes = Uint8Array.from(atob(defaultB64), (ch) => ch.charCodeAt(0));
    const img = decodePng(bytes);
    const resized = resizeNearest(img, size, size);
    return new Response(encodeImage(resized) as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${maxAge}`,
        ETag: `"avatar-default-${mode}-${size}"`,
      },
    });
  }

  const cacheEnabled = (await boolOption(c.env, 'enable_avatar_cache')) as boolean;
  const ttl = cacheEnabled ? 31536000 : 60;
  const cacheKey = `avatar-${mode}-t${texture.tid}-s${size}-png`;

  const bytes = await renderCached(c.env, cacheKey, ttl, async () => {
    const img = decodePng(file!.bytes);
    const rendered = mode === '3d' ? render3dAvatar(img, 25) : render2dAvatar(img, 25);
    const resized = resizeNearest(rendered, size, size);
    return encodeImage(resized);
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Last-Modified': new Date(file.lastModified * 1000).toUTCString(),
      'Cache-Control': `public, max-age=${maxAge}`,
      ETag: `"avatar-${mode}-t${texture.tid}-s${size}"`,
    },
  });
}

// ---------- 预览 ----------

staticRoutes.get('/preview/hash/:hash', async (c) => {
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE hash = ? LIMIT 1')
    .bind(c.req.param('hash'))
    .first<TextureRow>();
  if (!texture) return new Response('Not Found', { status: 404 });
  return preview(c, texture);
});

staticRoutes.get('/preview/:tid', async (c) => {
  const texture = await c.env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(Number(c.req.param('tid')))
    .first<TextureRow>();
  if (!texture) return new Response('Not Found', { status: 404 });
  return preview(c, texture);
});

async function preview(
  c: { env: Env; req: { url: string } },
  texture: TextureRow,
): Promise<Response> {
  const file = await getTextureFile(c.env, texture.hash);
  if (!file) {
    return new Response('Not Found', { status: 404 });
  }

  const url = new URL(c.req.url);
  const height = Number(url.searchParams.get('height') ?? 200);
  const maxAge = Number(await getOption(c.env, 'cache_expire_time')) || 31536000;

  const cacheEnabled = (await boolOption(c.env, 'enable_preview_cache')) as boolean;
  const ttl = cacheEnabled ? 31536000 : 60;
  const cacheKey = `preview-t${texture.tid}-png`;

  const bytes = await renderCached(c.env, cacheKey, ttl, async () => {
    const img = decodePng(file!.bytes);
    const rendered =
      texture.type === 'cape' ? renderCape(img, height) : renderSkin(img, 12, texture.type === 'alex');
    return encodeImage(rendered);
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Last-Modified': new Date(file.lastModified * 1000).toUTCString(),
      'Cache-Control': `public, max-age=${maxAge}`,
      ETag: `"preview-t${texture.tid}"`,
    },
  });
}
