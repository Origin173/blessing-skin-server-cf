import { makeHandlers } from '@/lib/server/compat-route';
import { yggdrasilRoutes } from '@/lib/server/routes/yggdrasil';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(yggdrasilRoutes);
