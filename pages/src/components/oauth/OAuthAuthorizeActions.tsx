'use client';

/** OAuth2 授权操作按钮: 授权/拒绝 (POST /api/oauth/authorize) */
import { useState } from 'react';

interface OAuthAuthorizeActionsProps {
  clientId: number;
  redirectUri: string;
  scope: string;
  state: string;
}

export function OAuthAuthorizeActions({ clientId, redirectUri, scope, state }: OAuthAuthorizeActionsProps) {
  const [busy, setBusy] = useState(false);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          approve,
        }),
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      // 拒绝或错误: 回退到首页
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <div className="d-flex justify-content-between">
      <button className="btn btn-danger" disabled={busy} onClick={() => decide(false)}>
        拒绝
      </button>
      <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
        授权
      </button>
    </div>
  );
}
