'use client';

/**
 * 暗色模式切换按钮 (对照 shared/dark-mode.twig + scripts/darkMode.tsx)。
 * 点击后 PUT /user/dark-mode 切换,成功后刷新页面。
 */
import { useState } from 'react';

export function DarkModeButton({ darkMode }: { darkMode: boolean }) {
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
      const res = await fetch('/user/dark-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="nav-item" id="toggle-dark-mode">
      <a className="nav-link" href="#" role="button" onClick={toggle}>
        <i className={`fas fa-${darkMode ? 'moon' : 'sun'}`} />
      </a>
    </li>
  );
}
