/**
 * 服务端 i18n:从构建产物 functions/lib/lang/{locale}.json 读取翻译。
 * 由 scripts/build-lang.mjs 从原站 resources/lang/*.yml 生成。
 * 与原站行为一致:
 *   - 语言检测: ?lang > cookie(locale) > Accept-Language > 默认 zh_CN
 *   - 别名映射 (config/locales.php): zh_HANS_CN→zh_CN, en_US→en, ru→ru_RU ...
 *   - fallback: en → 返回 key 本身
 *   - 插值: ':param' 替换
 */

export const DEFAULT_LOCALE = 'zh_CN';
export const FALLBACK_LOCALE = 'en';

// config/locales.php 的别名表
const LOCALE_ALIASES: Record<string, string> = {
  zh_HANS_CN: 'zh_CN',
  en_US: 'en',
  ru: 'ru_RU',
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  ja: 'ja_JP',
  ko: 'ko_KR',
  nl: 'nl_NL',
  pt: 'pt_PT',
  el: 'el_GR',
};

// 支持的语言 (存在 lang 构建产物的)
const SUPPORTED = [
  'de_DE', 'el_GR', 'en', 'es_ES', 'fr_FR', 'it_IT',
  'ja_JP', 'ko_KR', 'nl_NL', 'pt_PT', 'ru_RU', 'zh_CN', 'zh_TW',
];

type LangBundle = Record<string, string>;

const bundleCache = new Map<string, Promise<LangBundle>>();

export async function loadBundle(locale: string): Promise<LangBundle> {
  if (!bundleCache.has(locale)) {
    bundleCache.set(
      locale,
      import(`./lang/${locale}.json`).then((m) => m.default ?? m),
    );
  }
  return bundleCache.get(locale)!;
}

/** 从请求解析语言 (与 DetectLanguagePrefer 中间件一致) */
export function detectLocale(request: Request, cookie: string | null): string {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('lang');
  const fromCookie = cookie;
  const fromHeader = request.headers.get('accept-language') ?? '';

  let locale = fromQuery ?? fromCookie;
  if (!locale) {
    // Accept-Language: "zh-CN,zh;q=0.9,en;q=0.8" → 取权重最高且支持的前缀
    const candidates = fromHeader
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .sort(
        (a, b) =>
          parseFloat((b.split(';q=')[1] ?? '1')) - parseFloat((a.split(';q=')[1] ?? '1')),
      );
    for (const candidate of candidates) {
      const base = candidate.split(';')[0]!.trim();
      locale = LOCALE_ALIASES[base] ?? (SUPPORTED.includes(base) ? base : null);
      if (locale) break;
    }
  }

  if (locale && LOCALE_ALIASES[locale]) {
    locale = LOCALE_ALIASES[locale]!;
  }
  if (!locale || !SUPPORTED.includes(locale)) {
    locale = DEFAULT_LOCALE;
  }
  return locale;
}

export interface TransOptions {
  locale?: string;
  fallbackLocale?: string;
}

/**
 * 翻译。与原站 trans() 语义一致:
 * t('auth.login.success', { sitename: 'x' }) — 支持 :sitename 插值
 * 找不到 key 时依次回退 fallbackLocale、key 本身
 */
export async function t(key: string, params?: Record<string, string | number>, options?: TransOptions): Promise<string> {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const fallback = options?.fallbackLocale ?? FALLBACK_LOCALE;

  let value: string | undefined;
  try {
    const bundle = await loadBundle(locale);
    value = bundle[key];
  } catch {
    // 语言包缺失,走 fallback
  }
  if (value === undefined && fallback !== locale) {
    try {
      const fallbackBundle = await loadBundle(fallback);
      value = fallbackBundle[key];
    } catch {
      // 忽略
    }
  }
  if (value === undefined) {
    return key;
  }

  if (params) {
    for (const [name, param] of Object.entries(params)) {
      value = value.replaceAll(`:${name}`, String(param));
    }
  }
  return value;
}

/** 便捷:按请求语言翻译 */
export function createTranslator(request: Request, cookie: string | null) {
  const locale = detectLocale(request, cookie);
  return (key: string, params?: Record<string, string | number>) =>
    t(key, params, { locale });
}
