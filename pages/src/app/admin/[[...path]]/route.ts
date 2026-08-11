import { makeHandlers } from '@/lib/server/compat-route';
import { adminRoutes } from '@/lib/server/routes/admin';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(adminRoutes);

