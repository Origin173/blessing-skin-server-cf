-- Blessing Skin Server → D1 schema
-- 由 Laravel 迁移转换 (database/migrations/*.php + Passport v11 表)
-- SQLite 方言: TEXT 存日期 ('Y-m-d H:i:s' 字符串,与旧库一致),布尔为 0/1
-- 原库无外键约束,此处同样不建外键;仅为热路径补充索引

-- ============ users ============
-- 2016_11_18_133939_create_all_tables.php
-- + 2018_07_26_130617 (verified/verification_token)
-- + 2018_08_21_105514 (remember_token)
-- + 2019_12_14_095751 / 2020_03_10_145738 (ip 长度)
-- + 2020_06_28_155519 (locale)
-- + 2021_06_06_111049 (is_dark_mode)
CREATE TABLE IF NOT EXISTS users (
    uid                 INTEGER PRIMARY KEY AUTOINCREMENT,
    email               TEXT    NOT NULL,
    nickname            TEXT    NOT NULL DEFAULT '',
    locale              TEXT,
    score               INTEGER NOT NULL,
    avatar              INTEGER NOT NULL DEFAULT 0,
    password            TEXT    NOT NULL,
    ip                  TEXT    NOT NULL,
    is_dark_mode        INTEGER NOT NULL DEFAULT 0,
    permission          INTEGER NOT NULL DEFAULT 0,  -- -1 封禁 / 0 普通 / 1 管理员 / 2 超级管理员
    last_sign_at        TEXT    NOT NULL,
    register_at         TEXT    NOT NULL,
    verified            INTEGER NOT NULL DEFAULT 0,
    verification_token  TEXT    NOT NULL DEFAULT '',
    remember_token      TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============ players ============
-- 2016_11_18_133939 + 2019_03_01_131420 (tid_skin) + 2019_03_13_130311 (player_name → name)
CREATE TABLE IF NOT EXISTS players (
    pid           INTEGER PRIMARY KEY AUTOINCREMENT,
    uid           INTEGER NOT NULL,
    name          TEXT    NOT NULL,
    tid_skin      INTEGER NOT NULL DEFAULT -1,
    tid_cape      INTEGER NOT NULL DEFAULT 0,
    last_modified TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_uid ON players (uid);
CREATE INDEX IF NOT EXISTS idx_players_name ON players (name);

-- ============ textures ============
-- 2016_11_18_133939 + 2019_05_05_103143 (likes)
CREATE TABLE IF NOT EXISTS textures (
    tid       INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    type      TEXT    NOT NULL,  -- steve / alex / cape
    hash      TEXT    NOT NULL,  -- sha256 hex,即 R2 对象 key
    size      INTEGER NOT NULL,  -- KB
    uploader  INTEGER NOT NULL,
    public    INTEGER NOT NULL,
    likes     INTEGER NOT NULL DEFAULT 0,
    upload_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_textures_hash ON textures (hash);
CREATE INDEX IF NOT EXISTS idx_textures_uploader ON textures (uploader);

-- ============ options ============
-- 2016_11_18_133939;键值对,值一律为字符串 ('true'/'false'/数字/文本)
CREATE TABLE IF NOT EXISTS options (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    option_name  TEXT NOT NULL,
    option_value TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_options_name ON options (option_name);

-- ============ user_closet ============
-- 2019_03_14_174727;纯枢轴表,无主键
CREATE TABLE IF NOT EXISTS user_closet (
    user_uid     INTEGER NOT NULL,
    texture_tid  INTEGER NOT NULL,
    item_name    TEXT
);
CREATE INDEX IF NOT EXISTS idx_closet_user ON user_closet (user_uid);
CREATE INDEX IF NOT EXISTS idx_closet_texture ON user_closet (texture_tid);

-- ============ reports ============
-- 2019_03_23_171728;status: 0 待处理 / 1 已解决 / 2 已驳回
CREATE TABLE IF NOT EXISTS reports (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    tid      INTEGER NOT NULL,
    uploader INTEGER NOT NULL,
    reporter INTEGER NOT NULL,
    reason   TEXT    NOT NULL,
    status   INTEGER NOT NULL,
    report_at TEXT   NOT NULL
);

-- ============ notifications ============
-- 2019_07_03_094434;id 为 UUID 字符串
CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT    PRIMARY KEY,
    type            TEXT    NOT NULL,
    notifiable_type TEXT    NOT NULL,
    notifiable_id   INTEGER NOT NULL,
    data            TEXT    NOT NULL,
    read_at         TEXT,
    created_at      TEXT,
    updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_notifiable
    ON notifications (notifiable_type, notifiable_id);

-- ============ language_lines ============
-- 2019_09_05_130811 (spatie/laravel-translation-loader,后台 i18n 覆盖)
CREATE TABLE IF NOT EXISTS language_lines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    "group"    TEXT NOT NULL,
    "key"      TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_language_lines_group ON language_lines ("group");

-- ============ scopes ============
-- 2021_04_14_181300 (OAuth2 scope 描述)
CREATE TABLE IF NOT EXISTS scopes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
);

-- ============ Passport (OAuth2) 表 ============
-- 来自 vendor/laravel/passport v11.8.4 迁移
-- + 2020_06_26_090510 (oauth_clients.provider)

CREATE TABLE IF NOT EXISTS oauth_clients (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                INTEGER,
    name                   TEXT    NOT NULL,
    secret                 TEXT,
    provider               TEXT,
    redirect               TEXT    NOT NULL,
    personal_access_client INTEGER NOT NULL DEFAULT 0,
    password_client        INTEGER NOT NULL DEFAULT 0,
    revoked                INTEGER NOT NULL DEFAULT 0,
    created_at             TEXT,
    updated_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_user ON oauth_clients (user_id);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    client_id  INTEGER NOT NULL,
    scopes     TEXT,
    revoked    INTEGER NOT NULL,
    expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_user ON oauth_auth_codes (user_id);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER,
    client_id  INTEGER NOT NULL,
    name       TEXT,
    scopes     TEXT,
    revoked    INTEGER NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_user ON oauth_access_tokens (user_id);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
    id              TEXT    PRIMARY KEY,
    access_token_id TEXT    NOT NULL,
    revoked         INTEGER NOT NULL,
    expires_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_access
    ON oauth_refresh_tokens (access_token_id);

CREATE TABLE IF NOT EXISTS oauth_personal_access_clients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  INTEGER NOT NULL,
    created_at TEXT,
    updated_at TEXT
);
