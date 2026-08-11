/**
 * 校验器,对应 Laravel $request->validate() 的语义:
 *   - 规则字符串 DSL:'required|email|unique:users|min:8|max:32|in:a,b|mimes:png'
 *   - 自定义规则对象 { kind: 'custom', test: (value) => Promise<boolean> }
 *   - 失败 → { ok: false, errors: { field: [msg] } } (路由层转 422)
 * 消息来自 validation.yml,支持嵌套类型 (min.string / min.numeric ...) 与 attributes 映射。
 */

import { t } from './i18n';

export interface ValidationContext {
  env: Env;
  locale: string;
}

export type Rule = string | CustomRule;

export interface CustomRule {
  kind: 'custom';
  name: string; // 消息 key,如 'validation.captcha'
  test: (value: unknown, ctx: ValidationContext) => Promise<boolean> | boolean;
}

export type ValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: Record<string, string[]> };

type ValueType = 'string' | 'numeric' | 'file' | 'array';

function valueType(value: unknown): ValueType {
  if (value instanceof File || (value && typeof value === 'object' && 'data' in value)) return 'file';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'numeric';
  return 'string';
}

async function getMessage(
  ctx: ValidationContext,
  rule: string,
  field: string,
  value: unknown,
  params: Record<string, string | number>,
): Promise<string> {
  const type = valueType(value);
  const attribute =
    (await t(`validation.attributes.${field}`, undefined, { locale: ctx.locale })) !==
    `validation.attributes.${field}`
      ? await t(`validation.attributes.${field}`, undefined, { locale: ctx.locale })
      : field;

  const merged = { ...params, attribute };
  const nested = await t(`validation.${rule}.${type}`, merged, { locale: ctx.locale });
  if (nested !== `validation.${rule}.${type}`) return nested;
  const plain = await t(`validation.${rule}`, merged, { locale: ctx.locale });
  if (plain !== `validation.${rule}`) return plain;
  return `The ${field} field is invalid.`;
}

interface ParsedRule {
  name: string;
  param?: string;
}

function parseRule(rule: string): ParsedRule {
  const [name, ...rest] = rule.split(':');
  return { name: name!, param: rest.join(':') };
}

function isCustomRule(rule: ParsedRule | CustomRule): rule is CustomRule {
  return 'kind' in rule;
}

async function applyRule(
  rule: ParsedRule | CustomRule,
  field: string,
  value: unknown,
  data: Record<string, unknown>,
  ctx: ValidationContext,
): Promise<string | null> {
  // 自定义规则
  if (isCustomRule(rule)) {
    const ok = await rule.test(value, ctx);
    if (!ok) {
      const msg = await t(rule.name, undefined, { locale: ctx.locale });
      return msg === rule.name ? 'Invalid value.' : msg;
    }
    return null;
  }

  const isEmpty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  switch (rule.name) {
    case 'required':
      return isEmpty ? await getMessage(ctx, 'required', field, value, {}) : null;

    case 'email':
      if (isEmpty) return null;
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : await getMessage(ctx, 'email', field, value, {});

    case 'unique': {
      if (isEmpty) return null;
      const [table, column = field] = (rule.param ?? '').split(',');
      const { results } = await ctx.env.DB.prepare(
        `SELECT 1 AS found FROM ${table} WHERE ${column} = ? LIMIT 1`,
      )
        .bind(String(value))
        .all();
      return results.length === 0
        ? null
        : await getMessage(ctx, 'unique', field, value, {});
    }

    case 'min': {
      if (isEmpty) return null;
      const min = Number(rule.param);
      const type = valueType(value);
      let ok = false;
      if (type === 'string') ok = String(value).length >= min;
      else if (type === 'numeric') ok = Number(value) >= min;
      else if (type === 'file') ok = (value as File).size / 1024 >= min;
      else ok = (value as unknown[]).length >= min;
      return ok ? null : await getMessage(ctx, 'min', field, value, { min: rule.param! });
    }

    case 'max': {
      if (isEmpty) return null;
      const max = Number(rule.param);
      const type = valueType(value);
      let ok = false;
      if (type === 'string') ok = String(value).length <= max;
      else if (type === 'numeric') ok = Number(value) <= max;
      else if (type === 'file') ok = (value as File).size / 1024 <= max;
      else ok = (value as unknown[]).length <= max;
      return ok ? null : await getMessage(ctx, 'max', field, value, { max: rule.param! });
    }

    case 'integer':
    case 'numeric': {
      if (isEmpty) return null;
      const ok = /^-?\d+$/.test(String(value)) || (typeof value === 'number' && Number.isFinite(value));
      return ok ? null : await getMessage(ctx, rule.name, field, value, {});
    }

    case 'boolean': {
      if (isEmpty) return null;
      const ok = ['true', 'false', '0', '1', 'on', 'off'].includes(String(value));
      return ok ? null : await getMessage(ctx, 'boolean', field, value, {});
    }

    case 'in': {
      if (isEmpty) return null;
      const allowed = (rule.param ?? '').split(',');
      return allowed.includes(String(value))
        ? null
        : await getMessage(ctx, 'in', field, value, {});
    }

    case 'mimes': {
      if (
        isEmpty ||
        (!(value instanceof File) && !(value && typeof value === 'object' && 'data' in value))
      ) {
        return null;
      }
      const allowed = (rule.param ?? '').split(',');
      const fileValue = value as { name?: string };
      const ext = fileValue.name?.includes('.') ? fileValue.name.split('.').pop()!.toLowerCase() : '';
      return allowed.includes(ext)
        ? null
        : await getMessage(ctx, 'mimes', field, value, { values: allowed.join(', ') });
    }

    case 'regexp': {
      if (isEmpty) return null;
      try {
        return new RegExp(rule.param!).test(String(value))
          ? null
          : await getMessage(ctx, 'regexp', field, value, {});
      } catch {
        return null;
      }
    }

    case 'string':
    case 'image':
      return null; // 宽松处理,具体校验由业务逻辑完成

    case 'nullable':
      return null;

    default:
      return null; // 未知规则放行 (与原 Laravel 可扩展行为一致)
  }
}

/**
 * 校验数据。
 * rules: { field: 'rule1|rule2' | [rule1, rule2, customRule] }
 */
export async function validate(
  data: Record<string, unknown>,
  rules: Record<string, string | Rule[]>,
  ctx: ValidationContext,
): Promise<ValidationResult> {
  const errors: Record<string, string[]> = {};

  for (const [field, ruleSpec] of Object.entries(rules)) {
    const rulesList: (ParsedRule | CustomRule)[] = Array.isArray(ruleSpec)
      ? ruleSpec.map((r) => (typeof r === 'string' ? parseRule(r) : r))
      : ruleSpec.split('|').map(parseRule);

    for (const rule of rulesList) {
      const message = await applyRule(rule, field, data[field], data, ctx);
      if (message !== null) {
        (errors[field] ??= []).push(message);
        break; // 每个字段只报第一个错误 (与 Laravel 对前端的行为一致)
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data };
}
