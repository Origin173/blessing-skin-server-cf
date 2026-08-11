'use client';

/** 玩家管理操作: 改名/换主人/换材质/删除 */
import { useState } from 'react';

interface AdminPlayer {
  pid: number;
  name: string;
  uid: number;
  tid_skin: number;
  tid_cape: number;
  last_modified: string;
  nickname: string;
}

const I18N = {
  changePlayerName: '更改角色名',
  changeOwner: '更换角色拥有者',
  changeTexture: '更换材质',
  deletePlayer: '删除',
  newName: '请输入新的角色名：',
  newOwner: '请输入此角色要让渡至的用户 ID：',
  pidNotice: '输入要更换的材质的 ID，输入 0 即可清除该角色的材质',
  deleteNotice: '真的要删除此角色吗？此操作不可恢复',
  skin: '皮肤',
  cape: '披风',
};

export function AdminPlayers({ initial }: { initial: AdminPlayer[] }) {
  const [players, setPlayers] = useState<AdminPlayer[]>(initial);
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const api = async (pid: number, action: string, body?: unknown) => {
    const res = await fetch(`/admin/players/${pid}/${action}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? '');
    return r.code === 0;
  };

  const handleName = async (p: AdminPlayer) => {
    const name = window.prompt(I18N.newName, p.name);
    if (!name) return;
    if (await api(p.pid, 'name', { name })) window.location.reload();
  };
  const handleOwner = async (p: AdminPlayer) => {
    const uid = window.prompt(I18N.newOwner, String(p.uid));
    if (!uid) return;
    if (await api(p.pid, 'owner', { uid: Number(uid) })) window.location.reload();
  };
  const handleTexture = async (p: AdminPlayer) => {
    const tid = window.prompt(`${I18N.changeTexture} (${I18N.pidNotice})`, String(p.tid_skin));
    if (tid === null) return;
    if (await api(p.pid, 'textures', { tid: Number(tid) })) window.location.reload();
  };
  const handleDelete = async (p: AdminPlayer) => {
    if (!window.confirm(I18N.deleteNotice)) return;
    const res = await fetch(`/admin/players/${p.pid}`, {
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
              <th>PID</th>
              <th>角色名</th>
              <th>拥有者</th>
              <th>{I18N.skin}</th>
              <th>{I18N.cape}</th>
              <th>修改时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.pid}>
                <td>{p.pid}</td>
                <td>
                  {p.name}
                  <i className="fas fa-pen ml-1" style={{ cursor: 'pointer' }} onClick={() => handleName(p)} />
                </td>
                <td>
                  {p.nickname}（UID: {p.uid}）
                  <i className="fas fa-exchange-alt ml-1" style={{ cursor: 'pointer' }} onClick={() => handleOwner(p)} />
                </td>
                <td>{p.tid_skin}</td>
                <td>{p.tid_cape}</td>
                <td>{p.last_modified}</td>
                <td>
                  <button className="btn btn-warning mr-2" onClick={() => handleTexture(p)}>
                    {I18N.changeTexture}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(p)}>
                    {I18N.deletePlayer}
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
