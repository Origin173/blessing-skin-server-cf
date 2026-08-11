import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 本地 `next dev` 时注入 Cloudflare env (D1/R2/KV 绑定)
initOpenNextCloudflareForDev();

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 资产一律相对 / 根路径 (与既有 Pages 部署一致)
  trailingSlash: false,
  // OpenNext 要求 standalone 输出
  output: 'standalone',
  // 仓库根有多个 lockfile (PHP 仓库的 yarn.lock 等),固定 tracing 根为本项目
  outputFileTracingRoot: root,
};

export default nextConfig;
