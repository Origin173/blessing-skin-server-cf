'use client';

/** 多语言管理 (对照原版 Translations 组件): 分组/键/文本 CRUD */
import { useState } from 'react';

interface Line {
  id: number;
  group: string;
  key: string;
  text: string;
}

const I18N = {
  group: '分组',
  key: '键',
  text: '文本',
  modify: '修改',
  delete: '删除',
  empty: '（空）',
  update: '请输入新的文本内容：',
  confirmDelete: '确认删除吗？此操作不可恢复。',
  newGroup: '请输入分组名：',
  newKey: '请输入键名：',
  newText: '请输入文本内容：',
};

export function AdminTranslations({ initial }: { initial: Line[] }) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [message, setMessage] = useState('');

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
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? '');
    return r.code === 0;
  };

  const handleCreate = async () => {
    const group = window.prompt(I18N.newGroup);
    if (!group) return;
    const key = window.prompt(I18N.newKey);
    if (!key) return;
    const text = window.prompt(I18N.newText) ?? '';
    if (await api('/api/admin/i18n', 'POST', { group, key, text })) window.location.reload();
  };

  const handleUpdate = async (line: Line) => {
    const text = window.prompt(I18N.update, line.text);
    if (text === null) return;
    if (await api(`/admin/i18n/${line.id}`, 'PUT', { text })) window.location.reload();
  };

  const handleDelete = async (line: Line) => {
    if (!window.confirm(I18N.confirmDelete)) return;
    if (await api(`/admin/i18n/${line.id}`, 'DELETE')) window.location.reload();
  };

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h3 className="card-title">多语言</h3>
        <button className="btn btn-primary" onClick={handleCreate}>
          新建
        </button>
      </div>
      <div className="card-body p-0">
        {message && <div className="alert alert-warning m-3">{message}</div>}
        <table className="table table-hover">
          <thead>
            <tr>
              <th>{I18N.group}</th>
              <th>{I18N.key}</th>
              <th>{I18N.text}</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.group}</td>
                <td>{line.key}</td>
                <td>{line.text || I18N.empty}</td>
                <td>
                  <button className="btn btn-warning mr-1" onClick={() => handleUpdate(line)}>
                    {I18N.modify}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(line)}>
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
