/** D1 行类型 (与 database/migrations 转换后的 schema 对应) */

export interface UserRow {
  uid: number;
  email: string;
  nickname: string;
  locale: string | null;
  score: number;
  avatar: number;
  password: string;
  ip: string;
  is_dark_mode: number;
  permission: number; // -1 封禁 / 0 普通 / 1 管理员 / 2 超级管理员
  last_sign_at: string;
  register_at: string;
  verified: number;
  verification_token: string;
  remember_token: string | null;
}

export const PERMISSION = {
  BANNED: -1,
  NORMAL: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
} as const;

export interface PlayerRow {
  pid: number;
  uid: number;
  name: string;
  /** Materialized Yggdrasil profile UUID (backfilled for newly written players). */
  ygg_uuid?: string | null;
  tid_skin: number;
  tid_cape: number;
  last_modified: string;
}

export interface TextureRow {
  tid: number;
  name: string;
  type: string; // steve / alex / cape
  hash: string; // sha256 hex = R2 object key
  size: number; // KB
  uploader: number;
  public: number;
  likes: number;
  upload_at: string;
}

export interface ClosetRow {
  user_uid: number;
  texture_tid: number;
  item_name: string | null;
}

export interface ReportRow {
  id: number;
  tid: number;
  uploader: number;
  reporter: number;
  reason: string;
  status: number; // 0 待处理 / 1 已解决 / 2 已驳回
  report_at: string;
}

export interface NotificationRow {
  id: string;
  type: string;
  notifiable_type: string;
  notifiable_id: number;
  data: string;
  read_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** 当前日期时间字符串 (与原站 Carbon 序列化格式一致) */
export function now(): string {
  return formatDateTime(new Date());
}

/** Date → 'Y-m-d H:i:s' (本地时区,与 PHP 行为一致) */
export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 'Y-m-d H:i:s' → 时间戳 (解析失败返回 NaN) */
export function parseDateTime(str: string): number {
  const [datePart = '', timePart = '00:00:00'] = str.split(' ');
  const [y = 0, m = 1, d = 1] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}

/** 随机 hex 字符串 (会话 ID / CSRF token) */
export function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
