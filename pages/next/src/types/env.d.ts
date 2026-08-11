/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Pages 运行时环境绑定 (wrangler.toml 中声明的 bindings 与 secrets)。
 * 与 @cloudflare/workers-types 的全局 Env 接口合并。
 */
declare global {
  interface Env {
    /** D1 数据库 (业务表 + Passport 表) */
    DB: D1Database;
    /** R2 纹理存储 (key = sha256 hex) */
    TEXTURES: R2Bucket;
    /** KV (会话 / captcha / 限流 / options 缓存) */
    KV_SKIN: KVNamespace;
    /** 密码哈希算法,与原站 PWD_METHOD 一致 */
    PWD_METHOD?: string;
    /** 加盐哈希变体用盐,与原站 SALT 一致 */
    SALT?: string;
    /** 签名 URL (密码重置/邮箱验证) HMAC 密钥,与原站 APP_KEY 一致 */
    APP_KEY?: string;
    /** OAuth2 JWT 密钥 (原站 storage/oauth-*.key) */
    PASSPORT_PRIVATE_KEY?: string;
    PASSPORT_PUBLIC_KEY?: string;
    /** Pages plugin registry URLs, comma-separated exact HTTPS manifest URLs. */
    PLUGIN_REGISTRY_URLS?: string;
    /** Singular alias for PLUGIN_REGISTRY_URLS. */
    PLUGIN_REGISTRY_URL?: string;
    /** Legacy config alias; exact URLs only, never archive URLs. */
    PLUGINS_REGISTRY?: string;
    /** 更新 manifest (HTTP(S) JSON URL) */
    UPDATE_MANIFEST_URL?: string;
    /** 外部 CI/CD 部署 webhook (不会由当前部署自我覆盖) */
    DEPLOY_WEBHOOK_URL?: string;
    /** 邮件 (Resend) */
    RESEND_API_KEY?: string;
    MAIL_FROM_ADDRESS?: string;
    MAIL_FROM_NAME?: string;
  }
}

export {};
