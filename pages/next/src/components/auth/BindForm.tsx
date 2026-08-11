'use client';

/** 邮箱绑定表单 (对照 auth/bind.twig): email + 说明 + 按钮 */
import { useState } from 'react';

const I18N: Record<string, string> = {
  email: '电子邮箱',
  button: '绑定',
};

export function BindForm() {
  const [email, setEmail] = useState('');
  const [warning, setWarning] = useState('');
  const [pending, setPending] = useState(false);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setWarning('');
    try {
      const res = await fetch('/api/auth/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (body.code === 0) {
        window.location.href = '/user';
        return;
      }
      setWarning(body.message ?? '绑定失败');
    } catch {
      setWarning('网络错误，请重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} id="login-form">
      <div className="input-group mb-3">
        <input
          name="email"
          type="email"
          className="form-control"
          placeholder={I18N.email}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <span className="fas fa-envelope" />
          </div>
        </div>
      </div>

      <p>邮箱地址仅用于重置密码，我们不会向您发送任何垃圾邮件</p>

      {warning && (
        <div className="alert alert-warning">
          <i className="icon fas fa-exclamation-triangle" />
          {warning}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block mt-3" disabled={pending}>
        {I18N.button}
      </button>
    </form>
  );
}
