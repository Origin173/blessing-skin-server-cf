/** 客户端 IP 检测 (对应 vectorface/whip:优先 CF-Connecting-IP) */
export function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return '0.0.0.0';
}
