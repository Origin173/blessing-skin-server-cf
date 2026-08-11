/**
 * 数据迁移工具 2: 纹理文件上传到 R2。
 *
 * 旧站纹理文件位于 storage/textures/ (文件名 = sha256 hex,扁平目录)。
 * 两种方式:
 *   A. 直接使用 R2 的 S3 兼容端点 (推荐,并行上传):
 *      S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com \
 *      S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET=textures \
 *      node scripts/migrate/upload-textures.mjs <旧站 TEXTURES_DIR>
 *
 *   B. 通过 wrangler r2 命令 (串行,慢):
 *      node scripts/migrate/upload-textures.mjs <dir> --wrangler
 *
 * 说明: 对象 key 与文件名一致 (64 字符 sha256 hex),Content-Type image/png。
 */
import { readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node scripts/migrate/upload-textures.mjs <TEXTURES_DIR> [--wrangler]');
  process.exit(1);
}

const useWrangler = process.argv.includes('--wrangler');

if (useWrangler) {
  // 方式 B: 逐文件调用 wrangler r2 object put
  const { execSync } = await import('node:child_process');
  const files = readdirSync(dir).filter((f) => /^[0-9a-f]{64}$/.test(f));
  console.error(`[upload] ${files.length} 个纹理文件 (wrangler 模式)`);
  for (const file of files) {
    execSync(
      `npx wrangler r2 object put textures/${file} --file="${join(dir, file)}" --content-type=image/png`,
      { stdio: 'pipe' },
    );
  }
  console.error('[upload] 完成');
  process.exit(0);
}

// 方式 A: S3 兼容端点
const client = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
const bucket = process.env.S3_BUCKET ?? 'textures';

const files = readdirSync(dir).filter((f) => /^[0-9a-f]{64}$/.test(f));
console.error(`[upload] ${files.length} 个纹理文件 → s3://${bucket}/ (S3 模式)`);

let uploaded = 0;
let skipped = 0;

// 并发 8
const CONCURRENCY = 8;
let index = 0;

async function worker() {
  while (index < files.length) {
    const file = files[index++]!;
    const fullPath = join(dir, file);

    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file }));
      skipped++; // 已存在,跳过
      continue;
    } catch {
      // 不存在,继续上传
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: file,
        Body: createReadStream(fullPath),
        ContentType: 'image/png',
      }),
    );
    uploaded++;
    if (uploaded % 100 === 0) console.error(`[upload] 已上传 ${uploaded}...`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.error(`[upload] 完成: 上传 ${uploaded},跳过 ${skipped}`);
