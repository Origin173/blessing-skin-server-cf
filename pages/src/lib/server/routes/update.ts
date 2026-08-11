/**
 * Cloudflare 语义的更新检查/部署触发接口。
 *
 * Pages/Workers 不能在请求中自我覆盖当前部署；本路由只读取公开 manifest，
 * 并在配置了 DEPLOY_WEBHOOK_URL 时调用外部 CI/CD webhook。
 */

import { CompatRouter } from '@/lib/server/compat';
import { csrfMiddleware, AppVariables, requireRole } from '@/lib/server/guards';
import { getOption } from '@/lib/server/options';
import { jsonData } from '@/lib/server/response';
import { PERMISSION } from '@/lib/server/types';

type UpdateEnv = { Bindings: Env; Variables: AppVariables };

interface UpdateManifest {
  version?: unknown;
  latest_version?: unknown;
  tag_name?: unknown;
  url?: unknown;
  release_url?: unknown;
  notes?: unknown;
  published_at?: unknown;
  [key: string]: unknown;
}

interface ManifestResult {
  configured: boolean;
  ok: boolean;
  url: string | null;
  manifest: UpdateManifest | null;
  latest_version: string | null;
  message: string;
}

const CURRENT_VERSION = '6.0.2';

export const updateRoutes = new CompatRouter();

updateRoutes.use('*', requireRole(PERMISSION.ADMIN));
updateRoutes.use('/trigger', csrfMiddleware);

function versionFromManifest(manifest: UpdateManifest): string | null {
  const candidates = [
    manifest.latest_version,
    manifest.version,
    manifest.tag_name,
    (manifest.release as UpdateManifest | undefined)?.version,
    (manifest.latest as UpdateManifest | undefined)?.version,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/^v/i, '');
  }
  return null;
}

/** 返回可比较的数字版本；非语义版本用字符串比较的保守回退。 */
function versionParts(version: string): number[] | null {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function isNewer(latest: string | null, current: string): boolean | null {
  if (!latest) return null;
  const a = versionParts(latest);
  const b = versionParts(current);
  if (!a || !b) return latest !== current;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

function manifestUrl(env: Env): string | null {
  const value = env.UPDATE_MANIFEST_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function readManifest(env: Env): Promise<ManifestResult> {
  const configuredUrl = env.UPDATE_MANIFEST_URL?.trim() || null;
  if (!configuredUrl) {
    return {
      configured: false,
      ok: false,
      url: null,
      manifest: null,
      latest_version: null,
      message: 'UPDATE_MANIFEST_URL is not configured',
    };
  }

  const url = manifestUrl(env);
  if (!url) {
    return {
      configured: true,
      ok: false,
      url: configuredUrl,
      manifest: null,
      latest_version: null,
      message: 'UPDATE_MANIFEST_URL must be a valid HTTP(S) URL',
    };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        url,
        manifest: null,
        latest_version: null,
        message: `Update manifest request failed with HTTP ${response.status}`,
      };
    }
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        configured: true,
        ok: false,
        url,
        manifest: null,
        latest_version: null,
        message: 'Update manifest must be a JSON object',
      };
    }
    const manifest = parsed as UpdateManifest;
    const latest = versionFromManifest(manifest);
    return {
      configured: true,
      ok: true,
      url,
      manifest,
      latest_version: latest,
      message: latest ? 'Update manifest loaded' : 'Update manifest has no version field',
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      url,
      manifest: null,
      latest_version: null,
      message: `Unable to load update manifest: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

async function updateStatus(env: Env): Promise<Record<string, unknown>> {
  const currentVersion = String(await getOption(env, 'version', CURRENT_VERSION, true) || CURRENT_VERSION);
  const manifest = await readManifest(env);
  const updateAvailable = manifest.ok ? isNewer(manifest.latest_version, currentVersion) : null;
  return {
    current_version: currentVersion,
    latest_version: manifest.latest_version,
    update_available: updateAvailable,
    manifest: manifest.manifest,
    manifest_url: manifest.url,
    manifest_configured: manifest.configured,
    status: !manifest.configured ? 'not_configured' : manifest.ok ? 'ok' : 'error',
    message: manifest.message,
  };
}

updateRoutes.get('/check', async (c) => {
  return jsonData(await updateStatus(c.env));
});

updateRoutes.post('/trigger', async (c) => {
  const check = await updateStatus(c.env);
  if (check.status === 'not_configured') {
    return jsonData({
      ...check,
      deployment_triggered: false,
      webhook_configured: Boolean(c.env.DEPLOY_WEBHOOK_URL?.trim()),
      message: 'Update trigger skipped: UPDATE_MANIFEST_URL is not configured',
    });
  }
  if (check.status === 'error') {
    return jsonData({
      ...check,
      deployment_triggered: false,
      webhook_configured: Boolean(c.env.DEPLOY_WEBHOOK_URL?.trim()),
      message: 'Update trigger skipped because the update manifest could not be loaded',
    });
  }

  const webhook = c.env.DEPLOY_WEBHOOK_URL?.trim() || null;
  if (!webhook) {
    return jsonData({
      ...check,
      deployment_triggered: false,
      webhook_configured: false,
      message: 'Update available/check completed, but DEPLOY_WEBHOOK_URL is not configured',
    });
  }

  let webhookUrl: URL;
  try {
    webhookUrl = new URL(webhook);
    if (webhookUrl.protocol !== 'https:' && webhookUrl.protocol !== 'http:') throw new Error('HTTP(S) required');
  } catch {
    return jsonData({
      ...check,
      deployment_triggered: false,
      webhook_configured: true,
      webhook_status: 'invalid_url',
      message: 'DEPLOY_WEBHOOK_URL must be a valid HTTP(S) URL',
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        event: 'blessing-skin.update',
        current_version: check.current_version,
        latest_version: check.latest_version,
        manifest_url: check.manifest_url,
      }),
    });
    return jsonData({
      ...check,
      deployment_triggered: response.ok,
      webhook_configured: true,
      webhook_status: response.status,
      message: response.ok
        ? 'Deployment webhook triggered; the external deployment system owns the rollout'
        : `Deployment webhook returned HTTP ${response.status}`,
    });
  } catch (error) {
    return jsonData({
      ...check,
      deployment_triggered: false,
      webhook_configured: true,
      webhook_status: 'request_failed',
      message: `Deployment webhook request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
  }
});
