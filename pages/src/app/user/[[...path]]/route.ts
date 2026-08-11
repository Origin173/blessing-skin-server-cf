import { makeHandlers } from '@/lib/server/compat-route';
import { userRoutes } from '@/lib/server/routes/user';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(userRoutes);

