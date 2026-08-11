'use client';

/**
 * 插件市场 (对照原版 PluginsMarket + SDK §8 市场协议):
 *   registry (PLUGIN_REGISTRY_URLS) 拉取 Composer 风格 packages.json →
 *   列表 (名称/版本/作者/描述/依赖/已安装) + 安装/更新
 */
import { useEffect, useState } from 'react';

interface MarketPlugin {
  name: string;
  version: string;
  author?: string;
  description?: string;
  installed?: string | boolean;
  can_update?: boolean;
  dependencies?: { all: Record<string, string>; unsatisfied: string[] };
}

const I18N = {
  install: '安装',
  updating: '正在更新...',
  installing: '正在安装...',
  update: '更新',
  noDependencies: '无要求',
  pluginAuthor: '作者',
  pluginVersion: '版本',
  pluginDescription: '描述',
  pluginDependencies: '依赖关系',
  connectionError: '无法连接插件市场。请检查 PLUGIN_REGISTRY_URLS 配置。',
};

export function PluginsMarket() {
  const [plugins, setPlugins] = useState<MarketPlugin[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  useEffect(() => {
    fetch('/api/admin/plugins/market/list', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((body) => {
        if (Array.isArray(body)) setPlugins(body as MarketPlugin[]);
        else if (body && typeof body === 'object' && 'code' in body) {
          setError(String((body as { message?: string }).message ?? ''));
          setPlugins([]);
        } else setPlugins([]);
      })
      .catch(() => {
        setError(I18N.connectionError);
        setPlugins([]);
      });
  }, []);

  const handleInstall = async (name: string) => {
    setBusy((b) => ({ ...b, [name]: true }));
    try {
      const res = await fetch('/api/admin/plugins/market/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ name }),
      });
      const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (r.code === 0) window.location.reload();
      else setError(r.message ?? '安装失败');
    } finally {
      setBusy((b) => ({ ...b, [name]: false }));
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">插件市场</h3>
      </div>
      <div className="card-body p-0">
        {error && <div className="alert alert-warning m-3">{error}</div>}
        {plugins === null && <div className="text-center py-5">加载中...</div>}
        {plugins !== null && plugins.length === 0 && !error && (
          <div className="text-center py-5">暂无可用插件</div>
        )}
        {plugins?.map((p) => {
          const deps = p.dependencies?.all ?? {};
          const installed = p.installed === false || p.installed === undefined ? false : String(p.installed);
          return (
            <div key={p.name} className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <div>
                <strong>{p.name}</strong>
                <span className="badge bg-info ml-2">{p.version}</span>
                {installed && (
                  <span className="badge bg-success ml-1">
                    已安装 {installed !== 'false' ? installed : ''}
                  </span>
                )}
                {p.can_update && <span className="badge bg-warning ml-1">有更新</span>}
                {p.description && <p className="mb-1 text-muted small">{p.description}</p>}
                <p className="mb-0 text-muted small">
                  {I18N.pluginAuthor}: {p.author ?? '未知'} · {I18N.pluginDependencies}:{' '}
                  {Object.keys(deps).length === 0
                    ? I18N.noDependencies
                    : Object.entries(deps)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(', ')}
                </p>
              </div>
              <div>
                {installed ? (
                  <button
                    className="btn btn-warning"
                    disabled={busy[p.name] || !p.can_update}
                    onClick={() => handleInstall(p.name)}
                  >
                    {busy[p.name] ? I18N.updating : I18N.update}
                  </button>
                ) : (
                  <button className="btn btn-success" disabled={busy[p.name]} onClick={() => handleInstall(p.name)}>
                    {busy[p.name] ? I18N.installing : I18N.install}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
