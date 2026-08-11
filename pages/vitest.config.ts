import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // functions 侧使用 @cloudflare/vitest-pool-workers 在 Miniflare 中运行,
    // 以获得 D1/R2/KV 绑定 (Phase 1 编写测试时启用):
    // pool: '@cloudflare/vitest-pool-workers',
    // poolOptions: { workers: { wrangler: { configPath: './wrangler.toml' } } },
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
