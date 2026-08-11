/**
 * 前端 i18n (对齐原版 blessing.i18n 机制):
 *   Shell (RSC) 已注入 window.__I18N (flat 语言包, 由 build-lang.mjs 生成)
 *   client 组件调用本 t(): 找不到 key 返回 key 本身, 支持 :param 插值
 */

type I18nBundle = Record<string, string>;

function bundle(): I18nBundle {
  if (typeof window === 'undefined') return {};
  return (window as unknown as { __I18N?: I18nBundle }).__I18N ?? {};
}

export function t(key: string, params?: Record<string, string | number>): string {
  const table = bundle();
  let result = table[key] ?? key;
  if (params) {
    for (const [slot, value] of Object.entries(params)) {
      result = result.split(`:${slot}`).join(String(value));
    }
  }
  return result;
}
