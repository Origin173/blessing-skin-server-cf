'use client';

/** 重置密码表单 (对照原版 Reset.tsx): 新密码 + 确认密码 */
import { useState } from 'react';

interface ResetFormProps {
  /** 签名 URL 中的 uid (路由参数) */
  uid: string;
}

const I18N: Record<string, string> = {
  password: '密码',
  'repeat-pwd': '重复密码',
  reset: '重置',
  resetting: '重置中',
};

export function ResetForm({ uid }: ResetFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [warning, setWarning] = useState('');
  const [pending, setPending] = useState(false);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmation) {
      setWarning('密码和确认的密码不一样诶？');
      return;
    }
    setPending(true);
    setWarning('');
    try {
      const res = await fetch(`/api/auth/reset/${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ password, confirmation }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (body.code === 0) {
        window.location.href = '/auth/login';
        return;
      }
      setWarning(body.message ?? '重置失败');
    } catch {
      setWarning('网络错误，请重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="input-group mb-3">
        <input
          type="password"
          required
          autoFocus
          minLength={8}
          maxLength={32}
          className="form-control"
          placeholder={I18N.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-lock" />
          </div>
        </div>
      </div>
      <div className="input-group mb-3">
        <input
          type="password"
          required
          minLength={8}
          maxLength={32}
          className="form-control"
          placeholder={I18N['repeat-pwd']}
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-sign-in-alt" />
          </div>
        </div>
      </div>

      {warning && (
        <div className="alert alert-warning" role="alert">
          {warning}
        </div>
      )}

      <button className="btn btn-primary float-right" type="submit" disabled={pending}>
        {pending ? (
          <>
            <i className="fas fa-spinner fa-spin mr-1" />
            {I18N.resetting}
          </>
        ) : (
          I18N.reset
        )}
      </button>
    </form>
  );
}
