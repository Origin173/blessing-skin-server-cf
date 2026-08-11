/** 本地 multipart 上传探测: 绕过 curl -F (wrangler dev HTTP 层 bug),手写 body 直接验证 */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8794';
const boundary = '----TestBoundary123';

const png = readFileSync(new URL('../test-assets/steve.png', import.meta.url));

const parts = [
  `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nTestSkin\r\n`,
  `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nsteve\r\n`,
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`,
];
const body = Buffer.concat([
  ...parts.slice(0, 3).map((s) => Buffer.from(s)),
  png,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

const res = await fetch(`${BASE}/texture`, {
  method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body: new Uint8Array(body),
});
const text = await res.text();
console.log('status:', res.status);
console.log('body:', text.slice(0, 300));
