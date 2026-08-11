'use client';

/**
 * 通知容器 (对照 shared/notifications.twig + scripts/notification.tsx)。
 * 服务端渲染空容器,客户端拉取未读通知并挂载 <NotificationsList>。
 */
import { useEffect, useState } from 'react';

interface NotificationItem {
  id: string;
  title: string;
}

export function NotificationsContainer() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/user/notifications/unread', { headers: { Accept: 'application/json' } })
      .then((res) => res.json())
      .then((body) => {
        const data = (body as { code?: number; data?: NotificationItem[] }).data ?? [];
        if (!cancelled) setItems(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const count = items?.length ?? 0;

  return (
    <li className="nav-item dropdown" data-t="无未读通知" data-notifications={JSON.stringify(items ?? [])}>
      <a className="nav-link" href="#">
        <i className="far fa-bell" />
        {count > 0 && <span className="badge badge-warning navbar-badge">{count}</span>}
      </a>
    </li>
  );
}
