'use client';

/**
 * 登录表单 (对照原版 views/auth/Login.tsx 的 JSX 结构):
 *   EmailSuggestion 输入 (identification) / 密码 / 验证码 (tooManyFails 时) /
 *   warning Alert / 记住我 + 忘记密码 / 登录按钮 (loading 态)
 */
import { useState } from 'react';

interface LoginFormProps {
  /** 服务端注入: 登录失败次数过多时显示验证码 */
  tooManyFails: boolean;
  /** reCAPTCHA sitekey (服务端 recaptcha_sitekey 选项),为空则用内置验证码 */
  recaptchaSitekey: string;
  /** 忘记密码链接 */
  forgotLink: string;
}

const AUTH_I18N: Record<string, string> = {
  identification: 'Email 或角色名',
  password: '密码',
  keep: '记住我',
  'forgot-link': '忘记密码？',
  login: '登录',
  loggingIn: '登录中',
};

export function LoginForm({ tooManyFails, recaptchaSitekey, forgotLink }: LoginFormProps) {
  const [identification, setIdentification] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaTime, setCaptchaTime] = useState(Date.now());
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({
          identification,
          password,
          keep: remember,
          captcha: tooManyFails ? captcha : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
        data?: { redirectTo?: string };
      };
      if (body.code === 0) {
        const redirectTo = body.data?.redirectTo ?? '/user';
        window.location.href = redirectTo;
        return;
      }
      setWarning(body.message ?? '登录失败');
      setCaptcha('');
      setCaptchaTime(Date.now());
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
          type="text"
          className="form-control"
          placeholder={AUTH_I18N.identification}
          autoFocus
          required
          value={identification}
          onChange={(e) => setIdentification(e.target.value)}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-user" />
          </div>
        </div>
      </div>

      <div className="input-group mb-3">
        <input
          type="password"
          className="form-control"
          placeholder={AUTH_I18N.password}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <i className="fas fa-lock" />
          </div>
        </div>
      </div>

      {tooManyFails && (
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
            placeholder="请输入验证码"
            value={captcha}
            onChange={(e) => setCaptcha(e.target.value)}
            required
          />
        </div>
      )}

      {warning && (
        <div className="alert alert-warning" role="alert">
          {warning}
        </div>
      )}

      <div className="d-flex justify-content-between mb-3">
        <label>
          <input type="checkbox" className="mr-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {AUTH_I18N.keep}
        </label>
        <a href={forgotLink}>{AUTH_I18N['forgot-link']}</a>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? (
          <>
            <i className="fas fa-spinner fa-spin mr-1" />
            {AUTH_I18N.loggingIn}
          </>
        ) : (
          AUTH_I18N.login
        )}
      </button>
    </form>
  );
}
