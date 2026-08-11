import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * P0: 纯 App Router (无 pages 目录) 时 OpenNext 的 HTML 缓存资产生成会因
 * pages-manifest.json 缺失而失败,故暂禁用增量缓存 (本站页面全部动态渲染,
 * 无 ISR 需求)。后续如启用 ISR,再接入 R2 incremental cache 并移除本配置。
 */
export default {
  ...defineCloudflareConfig({}),
  dangerous: {
    disableIncrementalCache: true,
  },
};
