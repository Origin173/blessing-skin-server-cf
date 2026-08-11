/**
 * 验证码,对应 app/Rules/Captcha.php + AuthController::captcha (gregwar)。
 * - 默认:服务端生成 SVG 验证码,短语存会话 (case-insensitive 比较,校验后消费)
 * - 配置 recaptcha_secretkey 时:调用 reCAPTCHA siteverify
 */

import { randomHex } from './types';
import { updateSession, SessionData } from './session';
import { getOption } from './options';

// 排除易混淆字符 (0/O/1/l/I)
const PHRASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generatePhrase(length = 4): string {
  let phrase = '';
  for (let i = 0; i < length; i++) {
    phrase += PHRASE_CHARS[Math.floor(Math.random() * PHRASE_CHARS.length)];
  }
  return phrase;
}

/** 生成带噪点的 SVG 验证码 (gregwar 风格:随机背景点 + 干扰线) */
export function svgCaptcha(phrase: string, width = 100, height = 34): string {
  const chars = phrase.split('');
  const charWidth = width / chars.length;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#f0f0f0"/>`;

  // 背景噪点
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    svg += `<circle cx="${x}" cy="${y}" r="1" fill="rgba(0,0,0,${0.1 + Math.random() * 0.3})"/>`;
  }
  // 干扰线
  for (let i = 0; i < 4; i++) {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>`;
  }

  // 字符:随机旋转与位移
  chars.forEach((ch, i) => {
    const x = i * charWidth + charWidth * 0.3;
    const y = height / 2 + Math.floor(Math.random() * 8 - 4);
    const rotate = Math.floor(Math.random() * 24 - 12);
    const hue = Math.floor(Math.random() * 360);
    svg += `<text x="${x}" y="${y}" font-size="${height * 0.7}" font-family="monospace" `;
    svg += `fill="hsl(${hue},60%,35%)" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
  });

  svg += '</svg>';
  return svg;
}

/** 生成验证码响应并写入会话 */
export async function captchaResponse(env: Env, sessionId: string, session: SessionData): Promise<Response> {
  const phrase = generatePhrase();
  session.captcha = phrase;
  await updateSession(env, sessionId, session);

  return new Response(svgCaptcha(phrase), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    },
  });
}

/** 校验验证码 (对应 Captcha rule)。校验后消费会话中的短语 */
export async function validateCaptcha(
  env: Env,
  sessionId: string,
  session: SessionData | null,
  value: string,
): Promise<boolean> {
  const secretkey = (await getOption(env, 'recaptcha_secretkey')) as string;
  if (secretkey) {
    const res = await fetch('https://www.recaptcha.net/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretkey, response: value }),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  }

  if (!session?.captcha) return false;
  const stored = session.captcha;
  session.captcha = undefined;
  if (sessionId) {
    await updateSession(env, sessionId, session).catch(() => {});
  }
  return stored.toLowerCase() === String(value).toLowerCase();
}

/** 校验失败提示 key (对应 message()) */
export function captchaMessageKey(env: Env): string {
  return 'validation.captcha';
}
