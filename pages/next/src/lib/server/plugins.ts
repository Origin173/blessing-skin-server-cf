/**
 * Pages-native plugin metadata service.
 *
 * This is deliberately a metadata-only protocol. Cloudflare Pages cannot load
 * the PHP classes, Composer autoloaders, Blade views, or bootstrap.php files
 * shipped in an original Blessing Skin plugin package. Manifests are stored as
 * JSON and are never unpacked, required, or executed.
 */

import { now } from './types';

export const PLUGIN_MANIFEST_LIMIT = 256 * 1024;
export const PLUGIN_README_LIMIT = 512 * 1024;

export interface PluginManifest {
  name: string;
  version: string;
  title?: unknown;
  description?: unknown;
  author?: unknown;
  require?: unknown;
  readme?: unknown;
  config?: unknown;
  enchants?: unknown;
  [key: string]: unknown;
}

export interface PluginManifestRow {
  name: string;
  manifest_json: string;
  readme: string | null;
  enabled: number;
  source: string;
  installed_at: string;
  updated_at: string;
}

export interface PluginData {
  name: string;
  title: string;
  description: string;
  version: string;
  enabled: boolean;
  readme: boolean;
  config: boolean;
  icon: { fa: string; faType: 'fas' | 'fab'; bg: string };
}

export interface RegistryPackage {
  name: string;
  version: string;
  title?: unknown;
  description?: unknown;
  author?: unknown;
  require?: unknown;
  [key: string]: unknown;
}

const DEFAULT_ICON: PluginData['icon'] = { fa: 'plug', faType: 'fas', bg: 'navy' };
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function jsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Validate a JSON-only manifest without accepting executable package content. */
export function validateManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new Error('A plugin JSON manifest object is required.');
  }
  if (typeof value.name !== 'string' || !NAME_PATTERN.test(value.name)) {
    throw new Error('Plugin name must contain only letters, numbers, dot, dash, or underscore.');
  }
  if (typeof value.version !== 'string' || value.version.length === 0 || value.version.length > 64) {
    throw new Error('Plugin version is required and must be at most 64 characters.');
  }
  if (typeof value.title !== 'undefined' && typeof value.title !== 'string') {
    throw new Error('Plugin title must be a string.');
  }
  if (typeof value.description !== 'undefined' && typeof value.description !== 'string') {
    throw new Error('Plugin description must be a string.');
  }
  if (typeof value.readme !== 'undefined' && typeof value.readme !== 'string') {
    throw new Error('Plugin readme must be a string.');
  }
  if (typeof value.readme === 'string' && value.readme.length > PLUGIN_README_LIMIT) {
    throw new Error('Plugin readme is too large.');
  }
  if (jsonSize(value) > PLUGIN_MANIFEST_LIMIT) {
    throw new Error('Plugin manifest is too large.');
  }
  return value as PluginManifest;
}

export function parseManifest(row: PluginManifestRow): PluginManifest {
  try {
    return validateManifest(JSON.parse(row.manifest_json));
  } catch {
    // A malformed row should not break every admin request. It remains visible
    // with a minimal safe representation until an administrator replaces it.
    return { name: row.name, version: '0.0.0', title: row.name };
  }
}

function hasConfig(manifest: PluginManifest): boolean {
  return Object.prototype.hasOwnProperty.call(manifest, 'config') && manifest.config !== false;
}

function iconFromManifest(manifest: PluginManifest): PluginData['icon'] {
  const enchants = isRecord(manifest.enchants) ? manifest.enchants : {};
  const icon = isRecord(enchants.icon) ? enchants.icon : {};
  const faType = icon.faType === 'fab' ? 'fab' : 'fas';
  return {
    fa: text(icon.fa, DEFAULT_ICON.fa),
    faType,
    bg: text(icon.bg, DEFAULT_ICON.bg),
  };
}

export function toPluginData(row: PluginManifestRow): PluginData {
  const manifest = parseManifest(row);
  return {
    name: row.name,
    title: text(manifest.title, row.name),
    description: text(manifest.description, ''),
    version: text(manifest.version, '0.0.0'),
    enabled: row.enabled === 1,
    readme: Boolean(row.readme || manifest.readme),
    config: hasConfig(manifest),
    icon: iconFromManifest(manifest),
  };
}

export async function listPlugins(env: Env): Promise<PluginManifestRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT name, manifest_json, readme, enabled, source, installed_at, updated_at FROM plugin_manifests ORDER BY name',
  ).all<PluginManifestRow>();
  return results;
}

export async function getPlugin(env: Env, name: string): Promise<PluginManifestRow | null> {
  const row = await env.DB.prepare(
    'SELECT name, manifest_json, readme, enabled, source, installed_at, updated_at FROM plugin_manifests WHERE name = ? LIMIT 1',
  )
    .bind(name)
    .first<PluginManifestRow>();
  return row ?? null;
}

export async function recordPluginAudit(
  env: Env,
  pluginName: string,
  action: string,
  actorUid: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO plugin_audit (plugin_name, action, actor_uid, details_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(pluginName, action, actorUid, JSON.stringify(details), now())
    .run();
}

export async function saveManifest(
  env: Env,
  manifest: PluginManifest,
  source: 'upload' | 'registry',
  actorUid: number,
): Promise<void> {
  const timestamp = now();
  const readme = typeof manifest.readme === 'string' ? manifest.readme : null;
  await env.DB.prepare(
    `INSERT INTO plugin_manifests
       (name, manifest_json, readme, enabled, source, installed_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       manifest_json = excluded.manifest_json,
       readme = excluded.readme,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  )
    .bind(manifest.name, JSON.stringify(manifest), readme, source, timestamp, timestamp)
    .run();
  await recordPluginAudit(env, manifest.name, source === 'upload' ? 'upload' : 'registry', actorUid, {
    source,
    execution: 'disabled',
  });
}

export async function getPluginConfig(env: Env, row: PluginManifestRow): Promise<unknown> {
  const stored = await env.DB.prepare(
    'SELECT config_json FROM plugin_configs WHERE plugin_name = ? LIMIT 1',
  )
    .bind(row.name)
    .first<{ config_json: string }>();
  if (stored) {
    try {
      return JSON.parse(stored.config_json);
    } catch {
      return {};
    }
  }

  const manifest = parseManifest(row);
  return isRecord(manifest.config) ? manifest.config : {};
}

export async function savePluginConfig(
  env: Env,
  row: PluginManifestRow,
  config: unknown,
  actorUid: number,
): Promise<void> {
  if (!isRecord(config) || jsonSize(config) > PLUGIN_MANIFEST_LIMIT) {
    throw new Error('Plugin config must be a JSON object within the size limit.');
  }
  await env.DB.prepare(
    `INSERT INTO plugin_configs (plugin_name, config_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(plugin_name) DO UPDATE SET
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
  )
    .bind(row.name, JSON.stringify(config), now())
    .run();
  await recordPluginAudit(env, row.name, 'config', actorUid);
}

function configuredRegistryPatterns(env: Env): string[] {
  const configured = env.PLUGIN_REGISTRY_URLS ?? env.PLUGIN_REGISTRY_URL ?? env.PLUGINS_REGISTRY ?? '';
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function registryUrls(env: Env, locale: string): string[] {
  return configuredRegistryPatterns(env).map((pattern) => pattern.replaceAll('{lang}', locale));
}

/** Exact URL allow-list; redirects are disabled by the caller as well. */
export function isControlledRegistryUrl(env: Env, candidate: string, locale: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false;
  }
  return registryUrls(env, locale).some((allowed) => allowed === candidate);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Registry request failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Registry response is not valid JSON.');
  }
}

export function registryPackages(value: unknown): RegistryPackage[] {
  const packages = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.packages) ? value.packages : [value];
  return packages.filter((item): item is RegistryPackage => {
    if (!isRecord(item)) return false;
    try {
      validateManifest(item);
      return true;
    } catch {
      return false;
    }
  });
}

function versionParts(version: string): number[] {
  const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : [0, 0, 0];
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]! ? 1 : -1;
  }
  return 0;
}

function satisfiesVersion(version: string, constraint: string): boolean {
  const rule = constraint.trim();
  if (!rule || rule === '*' || rule.toLowerCase() === 'latest') return true;
  const alternatives = rule.split('||').map((item) => item.trim());
  if (alternatives.length > 1) return alternatives.some((item) => satisfiesVersion(version, item));
  const operator = rule.match(/^(\^|~|>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2})/)?.[1] ?? '=';
  const wanted = rule.match(/(\d+(?:\.\d+){0,2})/)?.[1];
  if (!wanted) return false;
  const comparison = compareVersions(version, wanted);
  if (operator === '^') return versionParts(version)[0] === versionParts(wanted)[0] && comparison >= 0;
  if (operator === '~') return versionParts(version)[0] === versionParts(wanted)[0] && versionParts(version)[1] === versionParts(wanted)[1] && comparison >= 0;
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}

async function installedVersions(env: Env): Promise<Map<string, string>> {
  const rows = await listPlugins(env);
  return new Map(rows.map((row) => [row.name, parseManifest(row).version]));
}

function dependencyInfo(requirement: unknown, installed: Map<string, string>): { all: Record<string, string>; unsatisfied: Record<string, string> } {
  const all: Record<string, string> = {};
  const unsatisfied: Record<string, string> = {};
  if (!isRecord(requirement)) return { all, unsatisfied };
  for (const [name, constraintValue] of Object.entries(requirement)) {
    if (typeof constraintValue !== 'string') continue;
    all[name] = constraintValue;
    const installedVersion = installed.get(name);
    if (!installedVersion || !satisfiesVersion(installedVersion, constraintValue)) {
      unsatisfied[name] = constraintValue;
    }
  }
  return { all, unsatisfied };
}

export async function marketData(env: Env, locale: string): Promise<Record<string, unknown>[]> {
  const urls = registryUrls(env, locale);
  if (urls.length === 0) return [];
  const installed = await installedVersions(env);
  const output: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!isControlledRegistryUrl(env, url, locale)) continue;
    const packages = registryPackages(await fetchJson(url));
    for (const item of packages) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      const itemVersion = item.version;
      const installedVersion = installed.get(item.name);
      const dependencies = dependencyInfo(item.require, installed);
      const result: Record<string, unknown> = { ...item };
      delete result.require;
      result.installed = installedVersion ?? false;
      result.can_update = Boolean(installedVersion && compareVersions(itemVersion, installedVersion) > 0);
      result.dependencies = dependencies;
      output.push(result);
    }
  }
  return output;
}

export async function importRegistryManifest(
  env: Env,
  url: string,
  locale: string,
  actorUid: number,
): Promise<PluginManifest> {
  if (!isControlledRegistryUrl(env, url, locale)) {
    throw new Error('Remote downloads are disabled. The URL must exactly match a configured plugin registry manifest URL.');
  }
  const value = await fetchJson(url);
  const packages = registryPackages(value);
  if (packages.length !== 1) {
    throw new Error('The registry URL must return exactly one plugin JSON manifest.');
  }
  const manifest = validateManifest(packages[0]);
  await saveManifest(env, manifest, 'registry', actorUid);
  return manifest;
}
