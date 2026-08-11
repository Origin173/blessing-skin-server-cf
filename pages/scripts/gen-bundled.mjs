/**
 * 扫描 plugins/ 目录,生成 src/lib/plugins/bundled/index.ts (静态 import 映射)。
 * Workers 打包是静态的,插件 bootstrap.js 必须随构建产物一起打包。
 *
 * 用法: node scripts/gen-bundled.mjs
 * 约定: plugins/{name}/bootstrap.js → bundledPlugins['{name}'] = () => import('./{name}/bootstrap')
 */
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginsDir = join(root, 'plugins');
const outFile = join(root, 'src/lib/plugins/bundled/index.ts');

const names = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(pluginsDir, d.name, 'bootstrap.js')))
      .map((d) => d.name)
      .sort()
  : [];

const lines = [
  '// 本文件由 scripts/gen-bundled.mjs 自动生成,请勿手动编辑',
  '// 扫描 plugins/ 目录,构建期静态打包插件 bootstrap.js',
  '',
  'export const bundledPlugins: Record<string, () => Promise<{ bootstrap?: unknown }>> = {',
  ...names.map((name) => `  '${name}': () => import('../../../../plugins/${name}/bootstrap'),`),
  '};',
  '',
];

writeFileSync(outFile, lines.join('\n'));
console.log(`[gen-bundled] ${names.length} plugin(s) bundled: ${names.join(', ') || '(none)'}`);
