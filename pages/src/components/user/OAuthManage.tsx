'use client';

/** OAuth2 应用管理 (对照原版 views/user/OAuth/*): 应用列表 + 创建/改名/改回调/删除 */
import { useState } from 'react';

interface OAuthApp {
  id: number;
  name: string;
  redirect: string;
  secret?: string;
}

interface OAuthManageProps {
  initial: OAuthApp[];
}

const I18N = {
  create: '创建应用',
  id: '客户端 ID',
  name: '应用名',
  secret: '客户端 Secret',
  redirect: '回调 URL',
  modifyName: '更改应用名',
  modifyUrl: '更改回调 URL',
  confirmRemove: '确认要删除这个应用吗？此操作不可撤销。',
  delete: '删除',
};

export function OAuthManage({ initial }: OAuthManageProps) {
  const [apps, setApps] = useState<OAuthApp[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRedirect, setNewRedirect] = useState('');
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<OAuthApp | null>(null);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const api = async (path: string, method = 'POST', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: unknown };
  };

  const handleCreate = async () => {
    const r = await api('/oauth/clients', 'POST', { name: newName, redirect: newRedirect });
    if (r.code === 0) {
      setCreated(r.data as OAuthApp);
      setApps((list) => [...list, r.data as OAuthApp]);
      setCreating(false);
    } else {
      setMessage(r.message ?? '创建失败');
    }
  };

  const handleRename = async (app: OAuthApp) => {
    const name = window.prompt(I18N.modifyName, app.name);
    if (!name) return;
    const r = await api(`/oauth/clients/${app.id}`, 'PUT', { name });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleRedirect = async (app: OAuthApp) => {
    const redirect = window.prompt(I18N.modifyUrl, app.redirect);
    if (!redirect) return;
    const r = await api(`/oauth/clients/${app.id}`, 'PUT', { redirect });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleDelete = async (app: OAuthApp) => {
    if (!window.confirm(I18N.confirmRemove)) return;
    const r = await api(`/oauth/clients/${app.id}`, 'DELETE');
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h3 className="card-title">OAuth2 应用</h3>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {I18N.create}
        </button>
      </div>
      <div className="card-body p-0">
        {creating && (
          <div className="p-3 border-bottom">
            <div className="form-group">
              <label>{I18N.name}</label>
              <input className="form-control" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{I18N.redirect}</label>
              <input className="form-control" value={newRedirect} onChange={(e) => setNewRedirect(e.target.value)} />
            </div>
            <button className="btn btn-success" onClick={handleCreate}>
              {I18N.create}
            </button>
          </div>
        )}
        {message && <div className="alert alert-warning m-3">{message}</div>}
        <table className="table table-hover">
          <thead>
            <tr>
              <th>{I18N.id}</th>
              <th>{I18N.name}</th>
              <th>{I18N.secret}</th>
              <th>{I18N.redirect}</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center">
                  暂无应用
                </td>
              </tr>
            )}
            {apps.map((app) => (
              <tr key={app.id}>
                <td>{app.id}</td>
                <td>{app.name}</td>
                <td>
                  <code>{app.secret ?? ''}</code>
                </td>
                <td>{app.redirect}</td>
                <td className="d-flex">
                  <button className="btn btn-warning mr-1" onClick={() => handleRename(app)}>
                    {I18N.modifyName}
                  </button>
                  <button className="btn btn-info mr-1" onClick={() => handleRedirect(app)}>
                    {I18N.modifyUrl}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(app)}>
                    {I18N.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
