import { makeHandlers } from '@/lib/server/compat-route';
import { userRoutes } from '@/lib/server/routes/user';

// 用户中心 API 变体: 页面路径的 POST 被 page.tsx 拦截, 业务端点走 /api/user/*
// (userRoutes 注册相对路径, 双挂载 /user/[[...path]] + /api/user/[[...path]])
export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(userRoutes);
