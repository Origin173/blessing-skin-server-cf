'use client';

/** 插件管理操作: 启用/禁用/删除 + 上传 (super admin) */
import Link from 'next/link';
import { useState } from 'react';

interface PluginRow {
  name: string;
  manifest: Record<string, unknown>;
  enabled: boolean;
  source: string;
}

interface PluginsManagerProps {
  initial: PluginRow[];
  isSuperAdmin: boolean;
}

const I18N = {
  enable: '启用',
  disable: '禁用',
  delete: '删除',
  configure: '配置',
  readme: '说明',
  upload: '上传压缩包',
  uploadNotice: '通过上传 Zip 压缩包来安装插件。',
  confirmDelete: '真的要删除这个插件吗？',
  noDependencies: '无要求',
  dependencies: '依赖关系',
};

export function PluginsManager({ initial, isSuperAdmin }: PluginsManagerProps) {
  const [plugins, setPlugins] = useState<PluginRow[]>(initial);
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const manage = async (name: string, action: 'enable' | 'disable' | 'delete') => {
    if (action === 'delete' && !window.confirm(I18N.confirmDelete)) return;
    const res = await fetch('/api/admin/plugins/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({ name, action }),
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('plugin', file);
    const res = await fetch('/api/admin/plugins/upload', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrf },
      body: fd,
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? '');
    if (r.code === 0) window.location.reload();
  };

  const manifest = (p: PluginRow) => p.manifest;

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h3 className="card-title">插件</h3>
        {isSuperAdmin && (
          <label className="btn btn-primary mb-0" title={I18N.uploadNotice}>
            {I18N.upload}
            <input
              type="file"
              accept=".zip"
              className="d-none"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
        )}
      </div>
      <div className="card-body p-0">
        {message && <div className="alert alert-warning m-3">{message}</div>}
        {plugins.length === 0 && <div className="text-center py-5">暂无插件</div>}
        {plugins.map((p) => {
          const m = manifest(p);
          const require = (m.require as Record<string, string> | undefined) ?? {};
          return (
            <div key={p.name} className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <div>
                <strong>{String(m.title ?? p.name)}</strong>
                <span className="badge bg-info ml-2">{String(m.version ?? '')}</span>
                {p.enabled && <span className="badge bg-success ml-1">已启用</span>}
                <p className="mb-1 text-muted small">{String(m.description ?? '')}</p>
                <p className="mb-0 text-muted small">
                  {I18N.dependencies}:{' '}
                  {Object.keys(require).length === 0
                    ? I18N.noDependencies
                    : Object.entries(require)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(', ')}
                </p>
              </div>
              <div className="d-flex">
                <Link href={`/admin/plugins/readme/${p.name}`} className="btn btn-default mr-1">
                  {I18N.readme}
                </Link>
                <Link href={`/admin/plugins/config/${p.name}`} className="btn btn-info mr-1">
                  {I18N.configure}
                </Link>
                <button
                  className={`btn ${p.enabled ? 'btn-warning' : 'btn-success'} mr-1`}
                  onClick={() => manage(p.name, p.enabled ? 'disable' : 'enable')}
                >
                  {p.enabled ? I18N.disable : I18N.enable}
                </button>
                <button className="btn btn-danger" onClick={() => manage(p.name, 'delete')}>
                  {I18N.delete}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
