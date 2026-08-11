'use client';

/** 邮箱验证表单 (对照 auth/verify.twig): email + 提交 */
import { useState } from 'react';

interface VerifyFormProps {
  uid: string;
}

const I18N: Record<string, string> = {
  email: '电子邮箱',
  submit: '提交',
};

export function VerifyForm({ uid }: VerifyFormProps) {
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
      const res = await fetch(`/api/auth/verify/${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (body.code === 0) {
        window.location.href = '/user';
        return;
      }
      setWarning(body.message ?? '验证失败');
    } catch {
      setWarning('网络错误，请重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <form method="post" onSubmit={handleSubmit}>
      <div className="input-group mb-3">
        <input
          type="email"
          name="email"
          className="form-control"
          placeholder={I18N.email}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-envelope" />
          </div>
        </div>
      </div>
      {warning && (
        <div className="alert alert-danger">
          <i className="icon fas fa-exclamation-triangle" />
          {warning}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block mt-3" disabled={pending}>
        {I18N.submit}
      </button>
    </form>
  );
}
