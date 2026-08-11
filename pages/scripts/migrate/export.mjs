/**
 * 数据迁移工具 1: 从旧站 MySQL 导出为 D1 兼容的 SQL。
 *
 * 用法:
 *   DB_HOST=... DB_PORT=3306 DB_DATABASE=blessingskin DB_USERNAME=... DB_PASSWORD=... \
 *   node scripts/migrate/export.mjs > dump.sql
 *
 * 输出为纯 INSERT 语句 (D1 方言),随后执行:
 *   wrangler d1 execute blessingskin --file=dump.sql --remote
 *
 * 说明:
 *   - users.password 原样保留 (PWD_METHOD/SALT 需在 wrangler secrets 中配置一致)
 *   - 会话不迁移 (用户需重新登录)
 *   - 全部表数据导出 (users/players/textures/options/user_closet/reports/
 *     notifications/language_lines/scopes/oauth_*)
 */
import mysql from 'mysql2/promise';
import { escape } from 'mysql2';

const TABLES = [
  'users',
  'players',
  'textures',
  'options',
  'user_closet',
  'reports',
  'notifications',
  'language_lines',
  'scopes',
  'oauth_clients',
  'oauth_auth_codes',
  'oauth_access_tokens',
  'oauth_refresh_tokens',
  'oauth_personal_access_clients',
];

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_DATABASE ?? 'blessingskin',
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

// D1 迁移表 (0001_schema.sql) 里没有 jobs/failed_jobs — 跳过
for (const table of TABLES) {
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  if (!Array.isArray(rows) || rows.length === 0) continue;

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');

  for (const row of rows) {
    const values = columns.map((col) => {
      const v = (row as Record<string, unknown>)[col];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      // D1 不接受 \0 字节;其余交给 mysql2 的转义
      return escape(String(v));
    });
    console.log(`INSERT INTO ${table} (${colList}) VALUES (${values.join(', ')});`);
  }
  console.error(`[export] ${table}: ${rows.length} rows`);
}

await conn.end();
console.error('[export] 完成。下一步: wrangler d1 execute blessingskin --file=dump.sql --remote');
