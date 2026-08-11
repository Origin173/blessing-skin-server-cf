'use client';

/** 用户管理操作 (对照原版 UsersManagement Row): 改邮箱/昵称/积分/权限/验证/密码/删除 */
import { useState } from 'react';

interface AdminUser {
  uid: number;
  email: string;
  nickname: string;
  score: number;
  permission: number;
  verified: number;
  register_at: string;
}

interface AdminUsersProps {
  initial: AdminUser[];
  currentUid: number;
}

const I18N = {
  changeEmail: '修改邮箱',
  changeNickName: '修改昵称',
  changeScore: '更改积分',
  changePermission: '更改权限',
  toggleVerification: '修改邮箱验证状态',
  changePassword: '更改密码',
  deleteUser: '删除',
  deleteNotice: '真的要删除此用户吗？此操作不可恢复',
  newEmail: '请输入新邮箱：',
  newNickname: '请输入新昵称：',
  newScore: '请输入积分值：',
  newPassword: '请输入新密码：',
  newPermission: '请选择新的权限：',
  banned: '封禁',
  normal: '普通用户',
  admin: '管理员',
  superAdmin: '超级管理员',
  unverified: '未验证',
  verified: '已验证',
};

function permissionText(p: number): string {
  if (p === -1) return I18N.banned;
  if (p === 0) return I18N.normal;
  if (p === 1) return I18N.admin;
  return I18N.superAdmin;
}

export function AdminUsers({ initial, currentUid }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUser[]>(initial);
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const api = async (uid: number, action: string, body: unknown) => {
    const res = await fetch(`/admin/users/${uid}/${action}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify(body),
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? '');
    return r.code === 0;
  };

  const canModify = (u: AdminUser) => u.uid !== currentUid;

  const handleEmail = async (u: AdminUser) => {
    const email = window.prompt(I18N.newEmail, u.email);
    if (!email) return;
    if (await api(u.uid, 'email', { email })) window.location.reload();
  };
  const handleNickname = async (u: AdminUser) => {
    const nickname = window.prompt(I18N.newNickname, u.nickname);
    if (!nickname) return;
    if (await api(u.uid, 'nickname', { nickname })) window.location.reload();
  };
  const handleScore = async (u: AdminUser) => {
    const score = window.prompt(I18N.newScore, String(u.score));
    if (!score) return;
    if (await api(u.uid, 'score', { score: Number(score) })) window.location.reload();
  };
  const handlePermission = async (u: AdminUser) => {
    const input = window.prompt(I18N.newPermission, String(u.permission));
    if (!input) return;
    if (await api(u.uid, 'permission', { permission: Number(input) })) window.location.reload();
  };
  const handleVerification = async (u: AdminUser) => {
    if (await api(u.uid, 'verification', { verification: u.verified === 1 ? 0 : 1 })) {
      window.location.reload();
    }
  };
  const handlePassword = async (u: AdminUser) => {
    const password = window.prompt(I18N.newPassword);
    if (!password) return;
    if (await api(u.uid, 'password', { password })) window.location.reload();
  };
  const handleDelete = async (u: AdminUser) => {
    if (!window.confirm(I18N.deleteNotice)) return;
    const res = await fetch(`/admin/users/${u.uid}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-TOKEN': csrf },
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const editIcon = (title: string, onClick: () => void) => (
    <i className="fas fa-pen ml-1" title={title} style={{ cursor: 'pointer' }} onClick={onClick} />
  );

  return (
    <div className="card">
      <div className="card-body p-0">
        {message && <div className="alert alert-warning m-3">{message}</div>}
        <table className="table table-hover">
          <thead>
            <tr>
              <th>UID</th>
              <th>邮箱</th>
              <th>昵称</th>
              <th>积分</th>
              <th>权限</th>
              <th>验证</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid}>
                <td>{u.uid}</td>
                <td>
                  {u.email}
                  {canModify(u) && editIcon(I18N.changeEmail, () => handleEmail(u))}
                </td>
                <td>
                  {u.nickname}
                  {canModify(u) && editIcon(I18N.changeNickName, () => handleNickname(u))}
                </td>
                <td>
                  {u.score}
                  {canModify(u) && editIcon(I18N.changeScore, () => handleScore(u))}
                </td>
                <td>
                  {permissionText(u.permission)}
                  {canModify(u) && editIcon(I18N.changePermission, () => handlePermission(u))}
                </td>
                <td>
                  {u.verified ? I18N.verified : I18N.unverified}
                  {canModify(u) && (
                    <a
                      className="ml-1"
                      href="#"
                      title={I18N.toggleVerification}
                      onClick={(e) => {
                        e.preventDefault();
                        handleVerification(u);
                      }}
                    >
                      <i className={`fas fa-toggle-${u.verified ? 'on' : 'off'}`} />
                    </a>
                  )}
                </td>
                <td>{u.register_at}</td>
                <td>
                  <button className="btn btn-default mr-2" disabled={!canModify(u)} onClick={() => handlePassword(u)}>
                    {I18N.changePassword}
                  </button>
                  <button className="btn btn-danger" disabled={!canModify(u)} onClick={() => handleDelete(u)}>
                    {I18N.deleteUser}
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
