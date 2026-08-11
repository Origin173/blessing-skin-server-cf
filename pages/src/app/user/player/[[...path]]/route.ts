import { makeHandlers } from '@/lib/server/compat-route';
import { playerRoutes } from '@/lib/server/routes/player';

export const dynamic = 'force-dynamic';
export const { GET, POST, PUT, DELETE, PATCH } = makeHandlers(playerRoutes);

