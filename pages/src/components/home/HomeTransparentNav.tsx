'use client';

/**
 * 首页透明导航栏滚动行为 (对照 scripts/homePage.ts 的 scrollHandler):
 * 滚动超过 2/3 视口高度时移除 transparent 类,否则添加。
 */
import { useEffect } from 'react';

export function HomeTransparentNav({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const header = document.querySelector('.navbar');
    if (!header) return;
    const handler = () => {
      if (window.scrollY >= (window.innerHeight * 2) / 3) {
        header.classList.remove('transparent');
      } else {
        header.classList.add('transparent');
      }
    };
    handler();
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, [enabled]);

  return null;
}
