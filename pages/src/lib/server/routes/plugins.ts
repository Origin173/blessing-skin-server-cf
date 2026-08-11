/** Pages-native administrator plugin protocol.
 *
 * Only JSON metadata is accepted. Legacy PHP plugin archives are intentionally
 * not unpacked or executed because a Pages Worker cannot execute PHP,
 * Composer, Blade, or plugin bootstrap code.
 */

import { CompatRouter } from '@/lib/server/compat';
import { requireRole, AppVariables } from '@/lib/server/guards';
import {
  getPlugin,
  getPluginConfig,
  importRegistryManifest,
  isControlledRegistryUrl,
  listPlugins,
  marketData,
  parseManifest,
  recordPluginAudit,
  saveManifest,
  savePluginConfig,
  toPluginData,
  validateManifest,
} from '@/lib/server/plugins';
import { PERMISSION } from '@/lib/server/types';
import { json, jsonData, jsonError, jsonValidationError, notFound } from '@/lib/server/response';
import { readBody } from './helpers';

export const pluginRoutes = new CompatRouter();

pluginRoutes.use('*', requireRole(PERMISSION.ADMIN));

function validation(message: string): Response {
  return jsonValidationError({ manifest: [message] });
}

function requestedManifest(body: Record<string, unknown>): unknown {
  // Direct manifests are the native protocol. `{manifest: ...}` is accepted
  // as a convenience for API clients that wrap request payloads.
  if (body.manifest && typeof body.manifest === 'object' && !Array.isArray(body.manifest)) {
    return body.manifest;
  }
  return body;
}

function objectBody(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pluginName(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value) ? value : null;
}

// ---------- installed metadata ----------

pluginRoutes.get('/plugins/data', async (c) => {
  const rows = await listPlugins(c.env);
  return c.json(rows.map(toPluginData));
});

// ---------- registry market ----------

pluginRoutes.get('/plugins/market/list', async (c) => {
  try {
    return c.json(await marketData(c.env, c.get('locale')));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to read plugin registry.');
  }
});

// ---------- enable / disable / delete ----------

pluginRoutes.post('/plugins/manage', async (c) => {
  const body = objectBody(await readBody(c));
  const name = pluginName(body.name);
  const action = body.action;
  if (!name || action !== 'enable' && action !== 'disable' && action !== 'delete') {
    return jsonValidationError({
      name: ['A valid plugin name is required.'],
      action: ['Action must be enable, disable, or delete.'],
    });
  }

  const row = await getPlugin(c.env, name);
  if (!row) return jsonError(`Plugin '${name}' was not found.`);

  if (action === 'delete') {
    await recordPluginAudit(c.env, name, 'delete', c.get('user')!.uid, {
      execution: 'disabled',
    });
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM plugin_configs WHERE plugin_name = ?').bind(name),
      c.env.DB.prepare('DELETE FROM plugin_manifests WHERE name = ?').bind(name),
    ]);
    return json('Plugin deleted.', 0);
  }

  const enabled = action === 'enable' ? 1 : 0;
  await c.env.DB.prepare('UPDATE plugin_manifests SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?')
    .bind(enabled, name)
    .run();
  await recordPluginAudit(c.env, name, action, c.get('user')!.uid, {
    execution: 'disabled',
  });
  return json(action === 'enable' ? 'Plugin enabled.' : 'Plugin disabled.', 0, { reason: [] });
});

// ---------- JSON manifest upload ----------

pluginRoutes.post('/plugins/upload', requireRole(PERMISSION.SUPER_ADMIN), async (c) => {
  if (c.req.header('content-type')?.toLowerCase().includes('application/json') !== true) {
    return validation('Only a JSON plugin manifest is accepted; ZIP/PHP archives are not executed on Pages.');
  }
  const body = await readBody(c);
  try {
    const manifest = validateManifest(requestedManifest(body));
    await saveManifest(c.env, manifest, 'upload', c.get('user')!.uid);
    return json('Plugin manifest installed. PHP package code is not executed on Pages.', 0);
  } catch (error) {
    return validation(error instanceof Error ? error.message : 'Invalid plugin manifest.');
  }
});

// ---------- controlled registry import ----------

pluginRoutes.post('/plugins/wget', requireRole(PERMISSION.SUPER_ADMIN), async (c) => {
  const body = await readBody(c);
  if (typeof body.url !== 'string' || body.url.length === 0) {
    return jsonValidationError({ url: ['A registry manifest URL is required.'] });
  }
  const locale = c.get('locale');
  if (!isControlledRegistryUrl(c.env, body.url, locale)) {
    return jsonError(
      'Remote downloads are disabled. Use an exact HTTPS URL from the configured plugin registry.',
    );
  }
  try {
    await importRegistryManifest(c.env, body.url, locale, c.get('user')!.uid);
    return json('Plugin manifest imported. No archive code was downloaded or executed.', 0);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to import registry manifest.');
  }
});

// ---------- readme ----------

pluginRoutes.get('/plugins/readme/:name', async (c) => {
  const name = pluginName(c.req.param('name'));
  if (!name) return notFound('Plugin not found.');
  const row = await getPlugin(c.env, name);
  if (!row) return notFound('Plugin not found.');
  const manifest = parseManifest(row);
  const readme = row.readme ?? (typeof manifest.readme === 'string' ? manifest.readme : null);
  if (!readme) return notFound('This plugin has no readme.');
  return new Response(readme, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
});

// ---------- JSON config ----------

pluginRoutes.get('/plugins/config/:name', async (c) => {
  const name = pluginName(c.req.param('name'));
  if (!name) return notFound('Plugin not found.');
  const row = await getPlugin(c.env, name);
  if (!row || row.enabled !== 1) return notFound('Plugin is not enabled or has no config.');
  const manifest = parseManifest(row);
  if (manifest.config === undefined || manifest.config === false) {
    return notFound('This plugin has no config.');
  }
  return jsonData(await getPluginConfig(c.env, row));
});

pluginRoutes.post('/plugins/config/:name', async (c) => {
  const name = pluginName(c.req.param('name'));
  if (!name) return notFound('Plugin not found.');
  const row = await getPlugin(c.env, name);
  if (!row || row.enabled !== 1) return notFound('Plugin is not enabled or has no config.');
  const manifest = parseManifest(row);
  if (manifest.config === undefined || manifest.config === false) {
    return notFound('This plugin has no config.');
  }
  if (c.req.header('content-type')?.toLowerCase().includes('application/json') !== true) {
    return jsonError('Plugin config must be a JSON object.');
  }
  const body = await readBody(c);
  const config = Object.keys(body).length === 1 && body.config && typeof body.config === 'object'
    ? body.config
    : body;
  try {
    await savePluginConfig(c.env, row, config, c.get('user')!.uid);
    return json('Plugin config saved.', 0, config);
  } catch (error) {
    return jsonValidationError({ config: [error instanceof Error ? error.message : 'Invalid plugin config.'] });
  }
});

