-- Pages-native plugin metadata protocol.
--
-- These tables store JSON manifests and administrator configuration only.
-- Original Blessing Skin PHP plugin packages (PHP/Composer/Blade/bootstrap.php)
-- cannot execute in Cloudflare Pages and are never unpacked or loaded.

CREATE TABLE IF NOT EXISTS plugin_manifests (
    name          TEXT PRIMARY KEY,
    manifest_json TEXT NOT NULL,
    readme        TEXT,
    enabled       INTEGER NOT NULL DEFAULT 0,
    source        TEXT NOT NULL DEFAULT 'upload',
    installed_at  TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugin_manifests_enabled
    ON plugin_manifests (enabled);

CREATE TABLE IF NOT EXISTS plugin_configs (
    plugin_name TEXT PRIMARY KEY,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plugin_audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_name  TEXT NOT NULL,
    action       TEXT NOT NULL,
    actor_uid    INTEGER NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugin_audit_plugin_created
    ON plugin_audit (plugin_name, created_at);
