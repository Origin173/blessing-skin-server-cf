import { makeHandlers } from '@/lib/server/compat-route';
import { authRoutes } from '@/lib/server/routes/auth';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(authRoutes);
