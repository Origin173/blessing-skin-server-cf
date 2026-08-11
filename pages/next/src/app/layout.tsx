/**
 * 根布局: 全局样式链 + HTML 壳。
 * 样式链与既有 SPA (web/src/main.tsx) 一致:
 *   bootstrap 4.6 + AdminLTE 3.2 (core/components/pages/light) +
 *   fontawesome + spectre + 自定义样式
 */
import type { Metadata, Viewport } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'admin-lte/dist/css/alt/adminlte.core.min.css';
import 'admin-lte/dist/css/alt/adminlte.components.min.css';
import 'admin-lte/dist/css/alt/adminlte.pages.min.css';
import 'admin-lte/dist/css/alt/adminlte.light.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'spectre.css/dist/spectre.min.css';
import '@/styles/common.css';
import '@/styles/home.css';
import '@/styles/auth.css';
import '@/styles/avatar.css';
import '@/styles/admin.css';
import '@/styles/dropdown.css';
import '@/styles/spectre.css';

export const metadata: Metadata = {
  title: 'Blessing Skin',
  description: 'Open-source PHP Minecraft Skin Hosting Service',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh_CN">
      <body>{children}</body>
    </html>
  );
}
