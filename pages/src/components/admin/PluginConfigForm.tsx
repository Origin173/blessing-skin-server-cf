'use client';

/** 插件配置表单 (SDK §6: config-schema.json 自动渲染) */
import { useState } from 'react';

interface Field {
  key: string;
  label: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'textarea' | 'secret';
  default?: unknown;
  hint?: string;
  options?: { value: string; label: string }[];
}

interface PluginConfigFormProps {
  pluginName: string;
  schema: { fields?: Field[] };
  values: Record<string, unknown>;
}

export function PluginConfigForm({ pluginName, schema, values }: PluginConfigFormProps) {
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const f of schema.fields ?? []) {
      out[f.key] = values[f.key] ?? f.default ?? (f.type === 'boolean' ? false : '');
    }
    return out;
  });
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleSave = async () => {
    const res = await fetch(`/admin/plugins/config/${pluginName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify(form),
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? (r.code === 0 ? '保存成功' : '保存失败'));
  };

  const fields = schema.fields ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">插件配置：{pluginName}</h3>
      </div>
      <div className="card-body">
        {fields.length === 0 && <p>此插件没有可配置项。</p>}
        {fields.map((f) => (
          <div className="form-group" key={f.key}>
            <label htmlFor={`cfg-${f.key}`}>{f.label}</label>
            {f.type === 'boolean' ? (
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`cfg-${f.key}`}
                  checked={Boolean(form[f.key])}
                  onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.checked }))}
                />
              </div>
            ) : f.type === 'select' ? (
              <select
                className="form-control"
                id={`cfg-${f.key}`}
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                className="form-control"
                id={`cfg-${f.key}`}
                rows={4}
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                type={f.type === 'secret' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                className="form-control"
                id={`cfg-${f.key}`}
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
            {f.hint && <small className="form-text text-muted">{f.hint}</small>}
          </div>
        ))}
        {message && <div className="alert alert-warning">{message}</div>}
      </div>
      <div className="card-footer">
        <button className="btn btn-primary" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
}
