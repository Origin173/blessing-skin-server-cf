/**
 * auth 表单端点 (POST/PUT/DELETE)。
 * 页面路径 (如 /auth/login) 的 POST 会被 page.tsx 渲染拦截,因此表单提交
 * 统一指向 /api/auth/* (URL 语义不变,仅内部路径迁移)。
 */
import { makeMutationHandlers } from '@/lib/server/compat-route';
import { authRoutes } from '@/lib/server/routes/auth';

export const dynamic = 'force-dynamic';
export const { POST, PUT, DELETE, PATCH } = makeMutationHandlers(authRoutes);
