// 本文件由 scripts/gen-bundled.mjs 自动生成,请勿手动编辑
// 扫描 plugins/ 目录,构建期静态打包插件 bootstrap.js

export const bundledPlugins: Record<string, () => Promise<{ bootstrap?: unknown }>> = {
  'smoke-plugin': () => import('../../../../plugins/smoke-plugin/bootstrap'),
};
