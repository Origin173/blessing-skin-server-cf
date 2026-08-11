import { makeHandlers } from '@/lib/server/compat-route';
import { closetRoutes } from '@/lib/server/routes/closet';

// 衣柜 API 变体: POST /user/closet (空路径) 被 page.tsx 拦截, 走 /api/user/closet
export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(closetRoutes);
