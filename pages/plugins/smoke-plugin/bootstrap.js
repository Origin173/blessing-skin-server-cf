/**
 * SDK 冒烟测试插件 (P0 验收用)。
 * 验证: rendering.header 注入 / head_links 过滤器 / 路由注册。
 */
export function bootstrap({ event, hook, asset, logger }) {
  logger.info('smoke-plugin booted');

  // rendering.header: 注入 meta 标签
  event.on('rendering.header', ({ addContent }) => {
    addContent('<meta name="x-smoke-plugin" content="1">');
  });

  // 样式注入 (全站)
  hook.addStyleFileToPage([asset('style.css')]);

  // 路由注册: /plugins/smoke/ping
  hook.addRoute((router) => {
    router.get('plugins/smoke/ping', (req) => {
      return req.json({ code: 0, message: 'pong' });
    });
  });
}
