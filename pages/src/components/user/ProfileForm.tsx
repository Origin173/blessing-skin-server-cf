'use client';

/** 个人资料表单 (对照 user/widgets/profile/*): 头像/昵称/密码/邮箱/删除账号 */
import { useState } from 'react';

interface ProfileFormProps {
  nickname: string;
  email: string;
  siteName: string;
  isAdmin: boolean;
}

const I18N = {
  avatarTitle: '更改头像？',
  avatarNotice:
    '在衣柜中任意皮肤的右下角「<i class="fa fa-cog"></i>」图标处点击「设为头像」，即可自动截取该皮肤的头部作为头像。如果看不到这个图标，请尝试关闭你的广告过滤扩展。',
  resetAvatar: '重置头像',
  nicknameTitle: '更改昵称',
  passwordTitle: '更改密码',
  old: '原密码',
  new: '新密码',
  confirm: '确认密码',
  changePassword: '修改密码',
  emailTitle: '更改邮箱',
  newEmail: '新邮箱',
  password: '当前密码',
  changeEmail: '修改邮箱',
  deleteTitle: '删除账号',
  deleteNotice: '确定要删除你在 {site} 上的账号吗？',
  deleteButton: '删除我的账号',
  submit: '提交',
  adminDeleteNotice: '拥有管理员权限的账号不能被删除',
};

export function ProfileForm({ nickname, email, siteName, isAdmin }: ProfileFormProps) {
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const submit = async (action: string, body: Record<string, unknown>) => {
    setMessage('');
    setIsError(false);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ action, ...body }),
      });
      const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      setIsError(r.code !== 0);
      setMessage(r.message ?? '');
      if (r.code === 0) {
        // 密码/邮箱修改后重新登录
        if (action === 'password' || action === 'email') {
          setTimeout(() => {
            window.location.href = '/auth/login';
          }, 800);
        } else {
          window.location.reload();
        }
      }
    } catch {
      setIsError(true);
      setMessage('网络错误，请重试');
    }
  };

  const handleResetAvatar = async () => {
    await submit('resetAvatar', {});
  };

  const handleDelete = async () => {
    if (!window.confirm(I18N.deleteNotice.replace('{site}', siteName))) return;
    const password = window.prompt('输入密码以继续');
    if (!password) return;
    await submit('deleteAccount', { password });
  };

  return (
    <div className="row">
      <div className="col-md-6">
        {/* 头像 */}
        <div className="card card-primary">
          <div className="card-header">
            <h3 className="card-title">{I18N.avatarTitle}</h3>
          </div>
          <div className="card-body">
            <div dangerouslySetInnerHTML={{ __html: I18N.avatarNotice }} />
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" id="reset-avatar" onClick={handleResetAvatar}>
              {I18N.resetAvatar}
            </button>
          </div>
        </div>

        {/* 密码 */}
        <form
          className="card card-warning"
          id="change-password"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            submit('password', {
              oldPassword: fd.get('oldPassword'),
              newPassword: fd.get('newPassword'),
              confirm: fd.get('confirm'),
            });
          }}
        >
          <div className="card-header">
            <h3 className="card-title">{I18N.passwordTitle}</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>{I18N.old}</label>
              <input type="password" className="form-control" name="oldPassword" required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label>{I18N.new}</label>
              <input type="password" className="form-control" name="newPassword" required minLength={8} maxLength={32} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>{I18N.confirm}</label>
              <input type="password" className="form-control" name="confirm" required minLength={8} maxLength={32} autoComplete="new-password" />
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" type="submit">
              {I18N.changePassword}
            </button>
          </div>
        </form>
      </div>

      <div className="col-md-6">
        {/* 昵称 */}
        <form
          className="card card-primary"
          id="change-nickname"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            submit('nickname', { nickname: fd.get('nickname') });
          }}
        >
          <div className="card-header">
            <h3 className="card-title">{I18N.nicknameTitle}</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <input type="text" className="form-control" name="nickname" required defaultValue={nickname} />
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" type="submit">
              {I18N.submit}
            </button>
          </div>
        </form>

        {/* 邮箱 */}
        <form
          className="card card-warning"
          id="change-email"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            submit('email', { email: fd.get('email'), password: fd.get('password') });
          }}
        >
          <div className="card-header">
            <h3 className="card-title">{I18N.emailTitle}</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <input type="email" className="form-control" name="email" required defaultValue={email} placeholder={I18N.newEmail} />
            </div>
            <div className="form-group">
              <input type="password" className="form-control" name="password" required placeholder={I18N.password} autoComplete="current-password" />
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" type="submit">
              {I18N.changeEmail}
            </button>
          </div>
        </form>

        {/* 删除账号 */}
        <div className="card card-danger">
          <div className="card-header">
            <h3 className="card-title">{I18N.deleteTitle}</h3>
          </div>
          <div className="card-body">
            {isAdmin ? I18N.adminDeleteNotice : I18N.deleteNotice.replace('{site}', siteName)}
          </div>
          <div className="card-footer">
            <button className="btn btn-danger" disabled={isAdmin} onClick={handleDelete}>
              {I18N.deleteButton}
            </button>
          </div>
        </div>

        {message && (
          <div className={`alert alert-${isError ? 'warning' : 'success'}`} role="alert">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
