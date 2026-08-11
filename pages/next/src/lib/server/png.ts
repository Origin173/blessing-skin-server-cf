/**
 * PNG 处理 (对应 Intervention Image + Imagick 的重新编码管线):
 * 解码 → 校验 → 重新编码 (deflate level 9,剥离所有 chunk)。
 * 使用 fast-png (纯 JS,基于 fflate) — 不依赖 node:zlib,
 * 兼容 workerd 的 zlib 限制 (pngjs 的 Inflate 无 new 调用会抛错)。
 */

import { decode, encode } from 'fast-png';

export interface PngResult {
  ok: boolean;
  /** 重新编码后的字节 (与原站 $image->encode('png') 对应) */
  data?: Uint8Array;
  width?: number;
  height?: number;
  error?: string;
}

export function sanitizePng(input: Uint8Array): PngResult {
  try {
    const png = decode(input);
    const encoded = encode(
      { width: png.width, height: png.height, data: png.data },
      { zlib: { level: 9 } }, // 与原站 png:compression-level 9 对应
    );
    return {
      ok: true,
      data: new Uint8Array(encoded),
      width: png.width,
      height: png.height,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** sha256 hex (对应 hash('sha256', ...)) */
export async function sha256hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
