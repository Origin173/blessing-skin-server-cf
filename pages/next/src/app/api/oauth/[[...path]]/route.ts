/**
 * OAuth 端点变体 (POST/PUT/DELETE)。
 * /oauth/authorize 页面存在,其 POST 走 /api/oauth/authorize (oauthRoutes 分发)。
 */
import { makeMutationHandlers } from '@/lib/server/compat-route';
import { oauthRoutes } from '@/lib/server/routes/oauth';

export const dynamic = 'force-dynamic';
export const { POST, PUT, DELETE, PATCH } = makeMutationHandlers(oauthRoutes);
