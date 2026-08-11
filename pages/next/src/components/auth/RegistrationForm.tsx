'use client';

/**
 * 注册表单 (对照原版 views/auth/Registration.tsx 的 JSX 结构):
 *   邮箱 / 密码 / 确认密码 / 角色名或昵称 (register_with_player_name 选项) /
 *   验证码 / warning / 登录链接 + 注册按钮 (loading 态)
 */
import { useState } from 'react';

interface RegistrationFormProps {
  /** register_with_player_name 选项: true 填角色名,false 填昵称 */
  requirePlayer: boolean;
}

const AUTH_I18N: Record<string, string> = {
  email: '电子邮箱',
  password: '密码',
  'repeat-pwd': '重复密码',
  'player-name': '游戏内角色名',
  nickname: '昵称',
  'player-name-intro': '游戏内的角色名，注册后可修改',
  'nickname-intro': '昵称可使用汉字，不可包含特殊字符',
  'login-link': '已经有账号了？登录',
  register: '注册',
  registering: '注册中',
  captcha: '请输入验证码',
};

export function RegistrationForm({ requirePlayer }: RegistrationFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [nickName, setNickName] = useState('');
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
    if (password !== confirmation) {
      setWarning('密码和确认的密码不一样诶？');
      return;
    }
    setPending(true);
    setWarning('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({
          email,
          password,
          player_name: requirePlayer ? playerName : nickName,
          nickname: requirePlayer ? nickName || undefined : undefined,
          captcha,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
        data?: { redirectTo?: string };
      };
      if (body.code === 0) {
        window.location.href = body.data?.redirectTo ?? '/user';
        return;
      }
      setWarning(body.message ?? '注册失败');
      setCaptcha('');
      setCaptchaTime(Date.now());
    } catch {
      setWarning('网络错误，请重试');
    } finally {
      setPending(false);
    }
  };

  const icon = (name: string) => (
    <div className="input-group-append">
      <div className="input-group-text">
        <i className={`fas ${name}`} />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="input-group mb-3">
        <input
          type="email"
          required
          autoFocus
          className="form-control"
          placeholder={AUTH_I18N.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {icon('fa-envelope')}
      </div>

      <div className="input-group mb-3">
        <input
          type="password"
          required
          minLength={8}
          maxLength={32}
          className="form-control"
          placeholder={AUTH_I18N.password}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {icon('fa-lock')}
      </div>

      <div className="input-group mb-3">
        <input
          type="password"
          required
          minLength={8}
          maxLength={32}
          className="form-control"
          placeholder={AUTH_I18N['repeat-pwd']}
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {icon('fa-sign-in-alt')}
      </div>

      {requirePlayer ? (
        <div className="input-group mb-3" title={AUTH_I18N['player-name-intro']}>
          <input
            type="text"
            required
            className="form-control"
            placeholder={AUTH_I18N['player-name']}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          {icon('fa-gamepad')}
        </div>
      ) : (
        <div className="input-group mb-3" title={AUTH_I18N['nickname-intro']}>
          <input
            type="text"
            required
            className="form-control"
            placeholder={AUTH_I18N.nickname}
            value={nickName}
            onChange={(e) => setNickName(e.target.value)}
          />
          {icon('fa-gamepad')}
        </div>
      )}

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
          placeholder={AUTH_I18N.captcha}
          value={captcha}
          onChange={(e) => setCaptcha(e.target.value)}
          required
        />
      </div>

      {warning && (
        <div className="alert alert-warning" role="alert">
          {warning}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <a href="/auth/login">{AUTH_I18N['login-link']}</a>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? (
            <>
              <i className="fas fa-spinner fa-spin mr-1" />
              {AUTH_I18N.registering}
            </>
          ) : (
            AUTH_I18N.register
          )}
        </button>
      </div>
    </form>
  );
}
