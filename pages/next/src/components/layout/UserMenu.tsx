'use client';

/**
 * 用户下拉菜单 (对照 shared/user-menu.twig)。
 * 菜单数据由服务端注入 data-menu (RSC 渲染)。
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UserMenuProps {
  uid: number;
  nickname: string;
  email: string;
  isAdmin: boolean;
  /** 菜单项 [{label, link} | {divider: true}] (服务端组装) */
  menu: { label: string; link?: string; divider?: boolean }[];
  logoutLabel: string;
}

export function UserMenu({ uid, nickname, email, isAdmin, menu, logoutLabel }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 点击外部关闭 (对应 data-toggle="dropdown" 行为)
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-menu')) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!window.confirm('确定要登出吗？')) return;
    try {
      const res = await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '',
        },
      });
      if (res.ok) router.push('/auth/login');
      else window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <li className="nav-item dropdown user-menu">
      <a
        href="#"
        className="nav-link d-flex align-items-center"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <picture>
          <img src={`/avatar/user/${uid}?size=36&png`} className="bs-avatar mr-2" alt="User Image" />
        </picture>
        <span className="d-none d-md-inline d-sm-block" data-mark="nickname">
          {nickname || email}
        </span>
      </a>

      <div className={`dropdown-menu dropdown-menu-lg dropdown-menu-right${open ? ' show' : ''}`}>
        {menu.map((item, i) =>
          item.divider ? (
            <div className="dropdown-divider" key={i} />
          ) : (
            <a
              className="dropdown-item"
              key={i}
              href={item.link}
              onClick={(e) => {
                if (item.link && item.link.startsWith('/')) {
                  e.preventDefault();
                  router.push(item.link);
                }
              }}
            >
              {item.label}
            </a>
          ),
        )}
        <div className="dropdown-divider" />
        <a className="dropdown-item" href="#" onClick={handleLogout} id="logout-button">
          {logoutLabel}
        </a>
      </div>
    </li>
  );
}
