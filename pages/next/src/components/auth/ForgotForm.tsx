'use client';

/** 忘记密码表单 (对照原版 Forgot.tsx): 邮箱 + 验证码 + 发送 */
import { useState } from 'react';

interface ForgotFormProps {
  requireCaptcha: boolean;
}

const I18N: Record<string, string> = {
  email: '电子邮箱',
  send: '发送',
  sending: '发送中',
  'login-link': '我又想起来了',
  captcha: '请输入验证码',
};

export function ForgotForm({ requireCaptcha }: ForgotFormProps) {
  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaTime, setCaptchaTime] = useState(Date.now());
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({ email, captcha: requireCaptcha ? captcha : undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      setIsError(body.code !== 0);
      setMessage(body.message ?? '');
      if (body.code !== 0) {
        setCaptcha('');
        setCaptchaTime(Date.now());
      }
    } catch {
      setIsError(true);
      setMessage('网络错误，请重试');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="input-group mb-3">
        <input
          type="email"
          className="form-control"
          placeholder={I18N.email}
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-envelope" />
          </div>
        </div>
      </div>

      {requireCaptcha && (
        <div className="input-group mb-3">
          <img
            src={`/auth/captcha?v=${captchaTime}`}
            alt="captcha"
            style={{ height: 38, cursor: 'pointer' }}
            onClick={() => setCaptchaTime(Date.now())}
            title="点击以更换图片"
          />
          <input
            type="text"
            className="form-control ml-2"
            placeholder={I18N.captcha}
            value={captcha}
            onChange={(e) => setCaptcha(e.target.value)}
            required
          />
        </div>
      )}

      {message && (
        <div className={`alert alert-${isError ? 'warning' : 'success'}`} role="alert">
          {message}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center">
        <a href="/auth/login">{I18N['login-link']}</a>
        <button className="btn btn-primary" type="submit" disabled={sending}>
          {sending ? (
            <>
              <i className="fas fa-spinner fa-spin mr-1" />
              {I18N.sending}
            </>
          ) : (
            I18N.send
          )}
        </button>
      </div>
    </form>
  );
}
