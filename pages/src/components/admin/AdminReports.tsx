'use client';

/** 举报管理操作 (对照原版 ReportsManagement): 查看详情/封禁/拒绝/删除 */
import { useState } from 'react';

interface AdminReport {
  id: number;
  tid: number;
  uploader: number;
  reporter: number;
  reason: string;
  status: number;
  report_at: string;
  reporter_nickname?: string;
}

const I18N = {
  delete: '删除',
  ban: '封禁',
  reject: '拒绝举报',
  status: ['正在处理', '处理完成', '已被拒绝'],
};

export function AdminReports({ initial }: { initial: AdminReport[] }) {
  const [reports, setReports] = useState<AdminReport[]>(initial);
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const review = async (id: number, decision: 'ban' | 'reject') => {
    const res = await fetch(`/admin/reports/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({ decision }),
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/admin/reports/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-TOKEN': csrf },
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  return (
    <div className="card">
      <div className="card-body p-0">
        {message && <div className="alert alert-warning m-3">{message}</div>}
        <table className="table table-hover">
          <thead>
            <tr>
              <th>材质 ID</th>
              <th>举报人</th>
              <th>举报原因</th>
              <th>状态</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center">
                  暂无举报
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.tid}
                  <a href={`/skinlib/show/${r.tid}`} target="_blank" className="ml-1">
                    <i className="fas fa-share" />
                  </a>
                </td>
                <td>{r.reporter_nickname ?? r.reporter}</td>
                <td>{r.reason}</td>
                <td>{I18N.status[r.status] ?? '未知'}</td>
                <td>{r.report_at}</td>
                <td>
                  <button className="btn btn-danger mr-1" onClick={() => review(r.id, 'ban')}>
                    {I18N.ban}
                  </button>
                  <button className="btn btn-warning mr-1" onClick={() => review(r.id, 'reject')}>
                    {I18N.reject}
                  </button>
                  <button className="btn btn-default" onClick={() => handleDelete(r.id)}>
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
