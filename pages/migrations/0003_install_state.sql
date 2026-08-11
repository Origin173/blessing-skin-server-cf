-- Cloudflare 安装向导状态。
-- 单例行用于区分“尚未安装”和已有用户的旧站/已完成安装，
-- 同时保存一次性安装 token 的摘要，避免把 token 明文写入 D1。
CREATE TABLE IF NOT EXISTS install_state (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    completed                INTEGER NOT NULL DEFAULT 0,
    setup_token_hash         TEXT,
    setup_token_expires_at   INTEGER,
    completed_at             TEXT
);

INSERT OR IGNORE INTO install_state (id, completed)
VALUES (1, 0);
