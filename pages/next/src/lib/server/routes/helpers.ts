/**
 * 路由共享辅助:请求体解析、分页响应 (Laravel paginate 形状)、
 * 纹理/玩家 JSON 序列化 (与 Eloquent toArray + accessor 一致)。
 */

import type { CompatContext } from '@/lib/server/compat';
import type { AppVariables } from '@/lib/server/guards';
import { json, jsonData } from '@/lib/server/response';

type AppContext = CompatContext;

/** 仅需请求体的最小上下文 (供 API 路由等使用) */
interface BodyReader {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
    formData: () => Promise<import('../multipart').CompatFormData>;
  };
}

/** 解析请求体 (JSON 或 FormData),返回字符串/文件混合的键值对象 */
export async function readBody(c: BodyReader): Promise<Record<string, unknown>> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await c.req.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // urlencoded 用 URLSearchParams 解析 (formData 仅处理 multipart)
    const params = new URLSearchParams(await c.req.text());
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  }
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const out: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      out[key] = value;
    }
    return out;
  }
  return {};
}

/** 查询参数辅助 (返回字符串) */
export function query(c: AppContext, key: string, fallback = ''): string {
  return c.req.query(key) ?? fallback;
}

export function intQuery(c: AppContext, key: string, fallback: number): number {
  const v = Number(c.req.query(key));
  return Number.isFinite(v) ? v : fallback;
}

/** 按字段名把字符串值转为数字 (D1 存储整数列) */
export function intValue(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 分页查询 (Laravel paginate 响应形状,与前端 Pagination 组件兼容)。
 * 返回 {code:0, data:{current_page, data, from, last_page, per_page, to, total}}
 */
export async function paginate(
  c: AppContext,
  sql: string,
  params: unknown[],
  perPage: number,
  page = 1,
  mapper?: (row: Record<string, unknown>) => Record<string, unknown>,
): Promise<Response> {
  const totalRes = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM (${sql})`,
  )
    .bind(...params)
    .first<{ total: number }>();
  const total = totalRes?.total ?? 0;

  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const offset = (currentPage - 1) * perPage;

  const { results } = await c.env.DB.prepare(
    `${sql} LIMIT ? OFFSET ?`,
  )
    .bind(...params, perPage, offset)
    .all();

  const data = mapper ? results.map((row) => mapper(row as Record<string, unknown>)) : results;

  // 原站 paginate() 返回裸分页器 (无 code/message 包装)
  return c.json({
    current_page: currentPage,
    data,
    from: total === 0 ? null : offset + 1,
    last_page: lastPage,
    per_page: perPage,
    to: total === 0 ? null : Math.min(offset + perPage, total),
    total,
  });
}

/** 纹理 JSON 序列化 (对应 Texture::toArray + model accessor) */
export function textureToJson(texture: Record<string, unknown>): Record<string, unknown> {
  return {
    tid: texture.tid,
    name: texture.name,
    type: texture.type,
    hash: texture.hash,
    size: texture.size,
    uploader: texture.uploader,
    public: !!texture.public,
    likes: texture.likes,
    upload_at: texture.upload_at,
    model: texture.type === 'alex' ? 'slim' : 'default',
  };
}

/** 玩家 JSON 序列化 (对应 Player::toArray,含 model accessor) */
export function playerToJson(player: Record<string, unknown>): Record<string, unknown> {
  return {
    pid: player.pid,
    uid: player.uid,
    name: player.name,
    tid_skin: player.tid_skin,
    tid_cape: player.tid_cape,
    last_modified: player.last_modified,
    model: player.skin_type === 'alex' ? 'slim' : 'default',
  };
}

/** 用户 JSON (隐藏敏感字段,对应 User::makeHidden) */
export function userToJson(user: Record<string, unknown>): Record<string, unknown> {
  const { password, ip, remember_token, verification_token, ...rest } = user;
  return rest;
}

/** 业务错误 + 403 (对应 json(msg, 1)->setStatusCode(403)) */
export async function forbiddenMessage(c: AppContext, key: string): Promise<Response> {
  const message = await c.get('trans')(key);
  return Response.json({ code: 1, message }, { status: 403 });
}

export { json, jsonData };
