/**
 * 手动 multipart/form-data 解析。
 * 背景: OpenNext 传入 route handler 的 Request 是 undici polyfill,其 formData()
 *       在 workerd 上访问 File.path 导致崩溃。这里用 arrayBuffer + boundary
 *       分割自行解析,返回与 FormData 用法兼容的最小实现 (get/entries)。
 */

export interface CompatFile {
  name: string;
  filename: string;
  type: string;
  data: Uint8Array;
  /** 与 File.size 语义一致 */
  readonly size: number;
  /** 与 File.arrayBuffer() 语义一致 */
  arrayBuffer(): Promise<ArrayBuffer>;
}

export class CompatFormData {
  private entriesMap = new Map<string, string | CompatFile>();

  constructor(entries: [string, string | CompatFile][]) {
    for (const [k, v] of entries) this.entriesMap.set(k, v);
  }

  get(key: string): string | CompatFile | null {
    return this.entriesMap.get(key) ?? null;
  }

  entries(): IterableIterator<[string, string | CompatFile]> {
    return this.entriesMap.entries();
  }
}

const CRLF = '\r\n';

function decodeHeader(header: string): { name: string; filename?: string; type?: string } {
  const nameMatch = header.match(/name="([^"]*)"/);
  const filenameMatch = header.match(/filename="([^"]*)"/);
  const typeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
  return {
    name: nameMatch?.[1] ?? '',
    filename: filenameMatch?.[1],
    type: typeMatch?.[1]?.trim(),
  };
}

/** 解析 multipart 请求体 */
export async function parseMultipart(request: Request): Promise<CompatFormData> {
  const contentType = request.headers.get('content-type') ?? '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) return new CompatFormData([]);

  const buffer = new Uint8Array(await request.arrayBuffer());
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  const entries: [string, string | CompatFile][] = [];

  // 按 boundary 切分
  let pos = 0;
  while (pos < buffer.length) {
    // 找下一个 boundary
    const start = indexOf(buffer, boundaryBytes, pos);
    if (start === -1) break;
    // 找 part 结束 (boundary 后 CRLF 或 --)
    const afterBoundary = start + boundaryBytes.length;
    if (buffer[afterBoundary] === 0x2d && buffer[afterBoundary + 1] === 0x2d) break; // '--' 结束
    // 跳过 boundary 后的 CRLF
    let partStart = afterBoundary;
    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) partStart += 2;

    // 找 part 头结束 (空行 CRLF CRLF)
    const headerEnd = indexOfPair(buffer, [0x0d, 0x0a, 0x0d, 0x0a], partStart);
    if (headerEnd === -1) break;
    const header = new TextDecoder().decode(buffer.slice(partStart, headerEnd));
    const { name, filename, type } = decodeHeader(header);

    // 内容从 headerEnd+4 到下一个 boundary
    const contentStart = headerEnd + 4;
    const nextBoundary = indexOf(buffer, boundaryBytes, contentStart);
    if (nextBoundary === -1) break;

    // 去掉内容末尾的 CRLF (boundary 前)
    let contentEnd = nextBoundary;
    if (contentEnd - contentStart >= 2 && buffer[contentEnd - 2] === 0x0d && buffer[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    }

    const data = buffer.slice(contentStart, contentEnd);
    if (filename !== undefined) {
      const file: CompatFile = {
        name: filename,
        filename,
        type: type ?? 'application/octet-stream',
        data,
        get size() {
          return data.length;
        },
        arrayBuffer: () => Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.length) as ArrayBuffer),
      };
      entries.push([name, file]);
    } else {
      entries.push([name, new TextDecoder().decode(data)]);
    }
    pos = nextBoundary;
  }

  return new CompatFormData(entries);
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function indexOfPair(haystack: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
