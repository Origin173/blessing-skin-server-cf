/**
 * 构建脚本: 生成前端语言文件 web/public/lang/{locale}.js。
 * 与原站 app/Services/Translations/JavaScript.php 一致 — 只编译 front-end.yml
 * 的 sections (auth/general/user/skinlib/...), 内容为 `blessing.i18n = <对象>`。
 * 另外并入 index.yml (首页 intro/features 文案 — 原站为 Twig 服务端翻译,SPA 中
 * 通过前端 i18n 提供)。
 * 用法: node scripts/build-lang-js.mjs (在 pages/ 下运行)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url)); // pages/
const langSrcDir = join(root, '..', 'resources', 'lang'); // 仓库根 resources/lang
const outDir = join(root, 'web', 'public', 'lang');

mkdirSync(outDir, { recursive: true });

const locales = readdirSync(langSrcDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'overrides')
  .map((e) => e.name);

for (const locale of locales) {
  const file = join(langSrcDir, locale, 'front-end.yml');
  let parsed;
  try {
    parsed = loadYaml(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  if (!parsed || typeof parsed !== 'object') continue;

  // 并入 index.yml (首页 features/introduction/start,原站服务端翻译)
  let indexParsed = {};
  try {
    const indexFile = join(langSrcDir, locale, 'index.yml');
    indexParsed = loadYaml(readFileSync(indexFile, 'utf8')) ?? {};
  } catch {
    /* 该语言没有 index.yml 时首页 fallback 到 t() 原键 */
  }

  // 并入 twig 命名空间:原站由 Twig 服务端渲染、SPA 仍需使用的少量文案
  // (auth 页 login-box-msg / 注册链接,通知"无未读"提示)。
  // 命名空间避开 front-end.yml 中同名冲突 (如 auth.login 是按钮文案)。
  let twigParsed = {};
  try {
    const authYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'auth.yml'), 'utf8')) ?? {};
    const userYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'user.yml'), 'utf8')) ?? {};
    const adminYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'admin.yml'), 'utf8')) ?? {};
    const generalYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'general.yml'), 'utf8')) ?? {};
    const skinlibYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'skinlib.yml'), 'utf8')) ?? {};
    const optionsYaml = loadYaml(readFileSync(join(langSrcDir, locale, 'options.yml'), 'utf8')) ?? {};
    // 注意: 键中不能含 `.` (t() 按点拆段,带点键会拆碎),全部用嵌套结构
    twigParsed = {
      auth: {
        login: { message: authYaml.login?.message ?? '' },
        register: {
          message: authYaml.register?.message ?? '',
          link: authYaml['register-link'] ?? '',
        },
        forgot: { message: authYaml.forgot?.message ?? '' },
        bind: {
          button: authYaml.bind?.button ?? '',
          message: authYaml.bind?.message ?? '',
          introduction: authYaml.bind?.introduction ?? '',
        },
        verify: { title: authYaml.verify?.title ?? '' },
      },
      user: {
        noUnread: userYaml['no-unread'] ?? '',
        announcement: userYaml.announcement ?? '',
        profile: userYaml.profile ?? {},
      },
      admin: {
        index: adminYaml.index ?? {},
        status: adminYaml.status ?? {},
        update: adminYaml.update ?? {},
        notifications: adminYaml.notifications ?? {},
      },
      // 导航/页脚等 chrome 文案 (原站 Twig 服务端渲染)
      general: generalYaml,
      skinlib: { general: skinlibYaml.general ?? {} },
      options: optionsYaml,
    };
  } catch {
    /* 缺失时 t() 返回原键 */
  }

  const content = `blessing.i18n = ${JSON.stringify({ ...parsed, index: indexParsed, twig: twigParsed })};\n`;
  writeFileSync(join(outDir, `${locale}.js`), content);
}
console.log(`[build-lang-js] ${readdirSync(outDir).length} locale files → ${outDir}`);
