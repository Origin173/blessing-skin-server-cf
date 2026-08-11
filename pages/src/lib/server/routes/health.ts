import { CompatRouter } from '@/lib/server/compat';
import { jsonData } from '@/lib/server/response';
import { getOption } from '@/lib/server/options';
import { userToJson } from '../routes/helpers';
import { AppVariables } from '@/lib/server/guards';
import { createSession, sessionCookie } from '@/lib/server/session';

/**
 * 健康检查 + SPA 启动数据通道。
 * /api/bootstrap 替代原站 Twig 注入的 window.blessing 全局:
 *   { version, locale, base_url, site_name, route, user, extra }
 * user 从会话解析 (sessionMiddleware 已全局装载)。
 * 无会话时创建匿名会话 (与 Laravel web 中间件组行为一致),供 CSRF 使用。
 */
export const healthRoutes = new CompatRouter();

healthRoutes.get('/health', (c) => {
  return jsonData({ status: 'ok', version: '6.0.2' });
});

healthRoutes.get('/bootstrap', async (c) => {
  const user = c.get('user');
  const siteName = String(await getOption(c.env, 'site_name'));

  // 确保会话存在 (供 CSRF)
  let setCookie: string | null = null;
  let csrf = c.get('session')?.csrf ?? null;
  if (!c.get('sessionId')) {
    const { id, data } = await createSession(c.env, 0, false);
    const secure = new URL(c.req.url).protocol === 'https:';
    setCookie = sessionCookie(id, false, secure);
    csrf = data.csrf;
  }

  const navbarColor = String(await getOption(c.env, 'navbar_color', 'cyan'));
  const sidebarColor = String(await getOption(c.env, 'sidebar_color', 'dark-maroon'));
  const darkMode = Boolean(user?.is_dark_mode) ?? false;

  const res = jsonData({
    version: '6.0.2',
    locale: c.get('locale'),
    base_url: '',
    site_name: siteName,
    route: new URL(c.req.url).pathname,
    user: user ? userToJson(user as unknown as Record<string, unknown>) : null,
    extra: {
      csrf,
      requireVerification: (await getOption(c.env, 'require_verification')) === true,
      recaptcha: String(await getOption(c.env, 'recaptcha_sitekey')),
      invisible: (await getOption(c.env, 'recaptcha_invisible')) === true,
      // 保留 camelCase 别名,兼容已部署的 SPA 版本。
      recaptchaSitekey: String(await getOption(c.env, 'recaptcha_sitekey')),
      recaptchaInvisible: (await getOption(c.env, 'recaptcha_invisible')) === true,
      // chrome 选项 (对应原站 ViewServiceProvider 注入的共享变量)
      navbarColor,
      sidebarColor,
      colorMode: darkMode ? 'dark' : 'light',
      darkMode,
      transparentNavbar: (await getOption(c.env, 'transparent_navbar')) === true,
      fixedBg: (await getOption(c.env, 'fixed_bg')) === true,
      hideIntro: (await getOption(c.env, 'hide_intro')) === true,
      siteDescription: String(await getOption(c.env, 'site_description', '')),
      announcement: String(await getOption(c.env, 'announcement', '')),
      homePicUrl: String(await getOption(c.env, 'home_pic_url', './app/bg.webp')),
      copyright: Number(await getOption(c.env, 'copyright_prefer', '0')),
      copyrightText: String(await getOption(c.env, 'copyright_text', '')),
      siteUrl: String(await getOption(c.env, 'site_url', '')),
    },
  });
  if (setCookie) {
    res.headers.set('Set-Cookie', setCookie);
  }
  return res;
});

// 首页数据 (公告 + 背景图 + 站点描述)
healthRoutes.get('/home', async (c) => {
  return jsonData({
    announcement: String(await getOption(c.env, 'announcement', '')),
    homePicUrl: String(await getOption(c.env, 'home_pic_url', './app/bg.webp')),
    siteDescription: String(await getOption(c.env, 'site_description', '')),
  });
});
