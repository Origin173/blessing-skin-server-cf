/**
 * 构建脚本:将原站 resources/lang/*.yml 编译为 functions/lib/lang/*.json。
 * 用法: node scripts/build-lang.mjs [--watch]
 * 输出被 .gitignore 忽略,CI/部署前自动执行 (npm run build:lang)。
 */
import { load as loadYaml } from 'js-yaml';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)); // 仓库根
const langSrcDir = join(root, 'resources', 'lang');
const langOutDir = join(root, 'pages', 'src', 'lib', 'server', 'lang');

/** 单个 yml 文件路径 (Symfony 风格) */
function collectYmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectYmlFiles(full));
    else if (entry.name.endsWith('.yml')) out.push(full);
  }
  return out;
}

function build() {
  mkdirSync(langOutDir, { recursive: true });
  const locales = readdirSync(langSrcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'overrides')
    .map((e) => e.name);

  let totalKeys = 0;
  for (const locale of locales) {
    const bundle = {};
    for (const file of collectYmlFiles(join(langSrcDir, locale))) {
      // 文件即分组: auth.yml → auth 组 (与 PHP trans('auth.xxx') 语义一致)
      const groupName = file.split(/[\\/]/).pop().replace(/\.yml$/, '');
      const parsed = loadYaml(readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        bundle[groupName] = parsed;
      }
    }
    // 扁平化: PHP 中 trans('auth.login.success') 表示 auth.yml 的 login.success
    const flat = flatten(bundle);
    totalKeys += Object.keys(flat).length;
    writeFileSync(join(langOutDir, `${locale}.json`), JSON.stringify(flat, null, 0));
  }
  console.log(`[build-lang] ${locales.length} locales, ${totalKeys} keys → ${langOutDir}`);
}

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

build();
