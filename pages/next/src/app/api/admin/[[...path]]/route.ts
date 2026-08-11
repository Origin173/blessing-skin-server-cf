/**
 * admin 表单端点变体 (POST/PUT/DELETE)。
 * 与 admin 页面路径冲突的操作走 /api/admin/* (如 POST /admin/i18n)。
 */
import { makeMutationHandlers } from '@/lib/server/compat-route';
import { adminRoutes } from '@/lib/server/routes/admin';

export const dynamic = 'force-dynamic';
export const { POST, PUT, DELETE, PATCH } = makeMutationHandlers(adminRoutes);
