/**
 * 构建脚本:将原站 resources/lang/*.yml 编译为 src/lib/server/lang/*.json。
 * 用法: node scripts/build-lang.mjs [--watch]
 * 输出被 .gitignore 忽略,CI/部署前自动执行。
 *
 * 双轨 key 语义 (对齐原版):
 *   - auth.yml 等 → flat key `auth.login.title` (PHP trans('auth.xxx') 语义)
 *   - front-end.yml → 顶层直接展开为 `auth.login` / `skinlib.filter.allUsers`
 *     (原版 blessing.i18n = trans('front-end'), 前端 t('xxx.yyy') 语义)
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

/** 扁平化: 嵌套对象 → 点路径 key (auth.login.success) */
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
      if (!parsed || typeof parsed !== 'object') continue;
      if (groupName === 'front-end') {
        // 前端 i18n (原版 blessing.i18n = trans('front-end')): 顶层 key 直接展开为
        // flat key (auth.login / skinlib.filter.allUsers), 与其他文件平级合并,
        // 与 auth.yml 的 auth.login.title 等 key 字符串不同, 天然共存
        Object.assign(bundle, flatten(parsed));
      } else {
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

build();
