import { makeHandlers } from '@/lib/server/compat-route';
import { setupRoutes } from '@/lib/server/routes/setup';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(setupRoutes);

