import { makeHandlers } from '@/lib/server/compat-route';
import { playerRoutes } from '@/lib/server/routes/player';

// 角色管理 API 变体: 页面路径的 POST 被 page.tsx 拦截, 业务端点走 /api/user/player
export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(playerRoutes);
