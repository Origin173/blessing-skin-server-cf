/** 玩家名规则,对应 app/Rules/PlayerName.php */

export interface PlayerNameOptions {
  rule: string; // official / cjk / utf8 / custom
  customRegexp: string;
}

/** Mojang 官方用户名规则 */
const OFFICIAL_RE = /^[A-Za-z0-9_]+$/;
/** CJK Unified Ideographs + 英文/数字/下划线/§ */
const CJK_RE = /^[A-Za-z0-9_§\u4e00-\u9fff]+$/;

export function validatePlayerName(value: string, options: PlayerNameOptions): boolean {
  switch (options.rule) {
    case 'official':
      return OFFICIAL_RE.test(value);
    case 'cjk':
      return CJK_RE.test(value);
    case 'utf8':
      // mb_check_encoding($value, 'UTF-8') && 不含空白
      return !/\s/.test(value);
    case 'custom': {
      const regexp = options.customRegexp || '.*';
      try {
        return new RegExp(regexp).test(value);
      } catch {
        return true;
      }
    }
    default:
      return true;
  }
}
