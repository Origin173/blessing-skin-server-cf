/**
 * 与原站 app/helpers.php json() 辅助函数行为一致的响应封装:
 *   json($message, $code = 1)         → HTTP 200 {code, message}
 *   json($message, 0, $data)          → HTTP 200 {code: 0, message, data}
 * 前端 scripts/net.ts 的解析约定:
 *   - 2xx → 直接返回 body,页面检查 body.code === 0
 *   - 422 → {message, errors:{field:[...]}} (校验失败)
 *   - 419 → CSRF 失败 (弹窗提示)
 *   - 403/400 → 弹窗提示 body.message
 */

interface JsonBody {
  code: number;
  message: string;
  data?: unknown;
}

export function json(message = '', code = 1, data?: unknown): Response {
  const body: JsonBody = { code, message };
  if (data !== undefined) {
    body.data = data;
  }
  return Response.json(body);
}

/** 成功响应 {code: 0, message, data} */
export function jsonData(data: unknown, message = ''): Response {
  return json(message, 0, data);
}

/** 业务失败 {code: 1, message},HTTP 200;可选携带 data */
export function jsonError(message: string, code = 1, data?: unknown): Response {
  return json(message, code, data);
}

/** 校验失败,对应 Laravel ValidationException 的 422 形状 */
export function jsonValidationError(errors: Record<string, string[]>): Response {
  const first = Object.values(errors).flat()[0] ?? 'Validation failed';
  return Response.json({ message: first, errors }, { status: 422 });
}

/** 403 禁止,对应 abort(403) */
export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ code: 1, message }, { status: 403 });
}

/** 404 */
export function notFound(message = 'Not Found'): Response {
  return Response.json({ code: 1, message }, { status: 404 });
}
