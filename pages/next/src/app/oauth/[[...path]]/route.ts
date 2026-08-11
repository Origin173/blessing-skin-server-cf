import { makeHandlers } from '@/lib/server/compat-route';
import { oauthRoutes } from '@/lib/server/routes/oauth';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(oauthRoutes);

