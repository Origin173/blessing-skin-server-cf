import { makeHandlers } from '@/lib/server/compat-route';
import { apiRoutes } from '@/lib/server/routes/api';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(apiRoutes);

