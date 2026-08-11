/**
 * 安装向导页 (对照 setup/base.twig + wizard/*.twig,CF 适配版):
 *   欢迎 → 绑定检查 (替代 database 步骤) → 管理员信息 → finish
 * 页面直接调用 setup API (GET /setup 数据端点由本页替代)
 */
'use client';

import { useEffect, useState } from 'react';

interface SetupStatus {
  available: boolean;
  completed: boolean;
  has_users: boolean;
  checks: { d1: boolean; r2: boolean; kv: boolean; secrets: Record<string, boolean> };
}

interface SetupData extends SetupStatus {
  csrf: string;
  token: string;
}

const STEPS = ['欢迎', '环境检查', '管理员信息'] as const;

export default function SetupPage() {
  const [data, setData] = useState<SetupData | null>(null);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [siteName, setSiteName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/setup', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((body) => {
        if (body && typeof body === 'object' && 'token' in body) setData(body as SetupData);
        else setMessage(String((body as { message?: string })?.message ?? '安装向导不可用'));
      })
      .catch(() => setMessage('无法获取安装状态'));
  }, []);

  const handleFinish = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/setup/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': data?.csrf ?? '' },
        body: JSON.stringify({
          setup_token: data?.token,
          email,
          password,
          nickname,
          site_name: siteName,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (body.code === 0) {
        window.location.href = '/auth/login';
      } else {
        setMessage(body.message ?? '安装失败');
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="hero d-flex" style={{ minHeight: '100vh' }}>
        <div className="hero-body text-center">
          <h1>Blessing Skin Server</h1>
          <p>{message || '加载中...'}</p>
        </div>
      </div>
    );
  }

  if (data.completed) {
    return (
      <div className="hero d-flex" style={{ minHeight: '100vh' }}>
        <div className="hero-body text-center">
          <h1>Blessing Skin Server</h1>
          <p>站点已安装完成。</p>
          <a href="/" className="btn btn-primary">
            返回首页
          </a>
        </div>
      </div>
    );
  }

  const checks = data.checks;

  return (
    <div className="bg-secondary">
      <div className="hero d-flex" style={{ minHeight: '100vh' }}>
        <div className="hero-body">
          <h1 className="text-center">
            <a className="text-primary" href="https://github.com/bs-community/blessing-skin-server">
              Blessing Skin Server
            </a>
          </h1>
          <div className="divider" />
          <h3>{STEPS[step]}</h3>
          <div className="divider" />

          {message && <div className="toast toast-error">{message}</div>}

          {step === 0 && (
            <>
              <p>
                欢迎使用 Blessing Skin Server 6.0.2 (Cloudflare Pages)。请按照向导完成站点初始化。
              </p>
              <p className="step">
                <button className="btn btn-primary" onClick={() => setStep(1)}>
                  开始安装
                </button>
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <p>请确认以下 Cloudflare 资源已配置：</p>
              <table className="table">
                <tbody>
                  <tr>
                    <td>D1 数据库</td>
                    <td>{checks.d1 ? '✓' : '✗'}</td>
                  </tr>
                  <tr>
                    <td>R2 存储桶</td>
                    <td>{checks.r2 ? '✓' : '✗'}</td>
                  </tr>
                  <tr>
                    <td>KV 命名空间</td>
                    <td>{checks.kv ? '✓' : '✗'}</td>
                  </tr>
                </tbody>
              </table>
              <p className="step">
                <button className="btn btn-primary" onClick={() => setStep(2)}>
                  下一步
                </button>
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <p>请设置管理员账号与站点信息：</p>
              <div className="form-group">
                <label className="form-label">站点名称</label>
                <input
                  className="form-input"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="Blessing Skin"
                />
              </div>
              <div className="form-group">
                <label className="form-label">管理员邮箱</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">管理员昵称</label>
                <input className="form-input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">管理员密码</label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <p className="step">
                <button className="btn btn-primary" disabled={busy} onClick={handleFinish}>
                  {busy ? '安装中...' : '完成安装'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
