/**
 * 站点选项服务,对应 app/Services/Option.php + config/options.php。
 * 读取: KV 缓存 (TTL 300s) → D1 options 表;缺失时用默认值并懒写入。
 * 写入: D1 upsert + 刷新 KV 缓存。
 * 值语义: 全部为字符串,get() 时把 'true'/'false'/'null' 转换为布尔/null。
 */

// config/options.php 全部默认值 + version (config/app.php) + max_texture_width
export const DEFAULT_OPTIONS: Record<string, string> = {
  site_url: '',
  site_name: 'Blessing Skin',
  site_description: 'Open-source PHP Minecraft Skin Hosting Service',
  register_with_player_name: 'true',
  require_verification: 'false',
  regs_per_ip: '3',
  announcement: 'Welcome to Blessing Skin {version}!',
  home_pic_url: './app/bg.webp',
  custom_css: '',
  custom_js: '',
  player_name_rule: 'official',
  custom_player_name_regexp: '',
  player_name_length_min: '3',
  player_name_length_max: '16',
  user_initial_score: '1000',
  sign_gap_time: '24',
  sign_score: '10,100',
  score_per_storage: 'true',
  private_score_per_storage: '10',
  return_score: 'true',
  score_per_player: '100',
  sign_after_zero: 'false',
  version: '6.0.2',
  copyright_text:
    '<b>Copyright &copy; {year} <a href="{site_url}">{site_name}</a>.</b> All rights reserved.',
  auto_del_invalid_texture: 'false',
  allow_downloading_texture: 'true',
  texture_name_regexp: '',
  cache_expire_time: '31536000',
  max_upload_file_size: '1024',
  force_ssl: 'false',
  auto_detect_asset_url: 'true',
  plugins_enabled: '',
  copyright_prefer: '0',
  score_per_closet_item: '0',
  favicon_url: 'app/favicon.ico',
  score_award_per_texture: '0',
  take_back_scores_after_deletion: 'true',
  score_award_per_like: '0',
  meta_keywords: '',
  meta_description: '',
  meta_extras: '',
  cdn_address: '',
  recaptcha_sitekey: '',
  recaptcha_secretkey: '',
  recaptcha_invisible: 'false',
  reporter_score_modification: '0',
  reporter_reward_score: '0',
  content_policy: '',
  transparent_navbar: 'false',
  hide_intro: 'false',
  fixed_bg: 'false',
  enable_avatar_cache: 'true',
  enable_preview_cache: 'true',
  status_code_for_private: '403',
  navbar_color: 'cyan',
  sidebar_color: 'dark-maroon',
  max_texture_width: '8192',
};

const KV_KEY = 'options:v1';
const KV_TTL = 300; // 秒

export type OptionsMap = Map<string, string>;

async function loadAll(env: Env): Promise<OptionsMap> {
  const cached = await env.KV_SKIN.get(KV_KEY);
  if (cached) {
    return new Map(JSON.parse(cached) as [string, string][]);
  }

  const { results } = await env.DB.prepare(
    'SELECT option_name, option_value FROM options',
  ).all<{ option_name: string; option_value: string }>();

  const map = new Map<string, string>();
  for (const row of results) {
    map.set(row.option_name, row.option_value);
  }
  await env.KV_SKIN.put(KV_KEY, JSON.stringify([...map]), { expirationTtl: KV_TTL });
  return map;
}

async function persist(env: Env, map: OptionsMap): Promise<void> {
  await env.KV_SKIN.put(KV_KEY, JSON.stringify([...map]), { expirationTtl: KV_TTL });
}

/**
 * 读取选项。与原站 Option::get() 一致:
 *   - raw=true 返回原始字符串,否则解析 'true'/'false'/'null'
 *   - 表内缺失但默认值存在时 → 返回默认值并懒写入
 */
export async function getOption(
  env: Env,
  key: string,
  defaultValue: unknown = null,
  raw = false,
): Promise<unknown> {
  const map = await loadAll(env);

  let value: unknown;
  if (!map.has(key)) {
    if (key in DEFAULT_OPTIONS) {
      value = DEFAULT_OPTIONS[key]!;
      // 懒写入 (fire-and-forget,与 PHP 的 updateOrInsert 一致)
      map.set(key, String(value));
      void persist(env, map).catch(() => {});
    } else {
      value = defaultValue;
    }
  } else {
    value = map.get(key);
  }

  if (raw) {
    return value;
  }

  switch (String(value).toLowerCase()) {
    case 'true':
    case '(true)':
      return true;
    case 'false':
    case '(false)':
      return false;
    case 'null':
    case '(null)':
      return null;
    default:
      return value;
  }
}

/**
 * 便捷:读取选项 (返回解析后的值,与 PHP option() 语义一致:
 * 'true'/'false' → 布尔;数值字符串保持字符串;字符串选项原样)。
 * 注意: score_per_storage 等布尔标志选项在算术中会被 JS 自动转 1/0,
 * 与 PHP 的 true×n=n 行为一致;String(布尔) 会得到 'true'/'false'。
 */
export async function option(env: Env, key: string): Promise<unknown> {
  return getOption(env, key);
}

/** 便捷:读取布尔选项 */
export async function boolOption(env: Env, key: string): Promise<boolean> {
  return (await getOption(env, key)) === true;
}

/** 便捷:读取数字选项 */
export async function intOption(env: Env, key: string): Promise<number> {
  return Number(await getOption(env, key));
}

/** 设置选项 (D1 upsert + KV 缓存刷新) */
export async function setOption(env: Env, key: string, value: string | number): Promise<void> {
  const str = String(value);
  await env.DB.prepare(
    `INSERT INTO options (option_name, option_value) VALUES (?, ?)
     ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value`,
  )
    .bind(key, str)
    .run();
  const map = await loadAll(env);
  map.set(key, str);
  await persist(env, map);
}

/** 批量设置 */
export async function setOptions(env: Env, values: Record<string, string | number>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await setOption(env, key, value);
  }
}
