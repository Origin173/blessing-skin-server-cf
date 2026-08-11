import { makeHandlers } from '@/lib/server/compat-route';
import { closetRoutes } from '@/lib/server/routes/closet';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(closetRoutes);

