import { FastifyPluginAsync } from 'fastify';
import { CacheService } from '../services/cache.service';
import { healthSchema, cacheStatsSchema } from '../schemas/health.schema';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const cache: CacheService = fastify.cache;
  
  // Health check
  fastify.get('/', { schema: healthSchema }, async (request, reply) => {
    return {
      status: 'ok',
      message: 'API nhận dạng khuôn mặt - Sẵn sàng ✓',
      timestamp: new Date().toISOString()
    };
  });
  
  // Cache stats
  fastify.get('/cache-stats', { schema: cacheStatsSchema }, async (request, reply) => {
    const stats = cache.getStats();
    return {
      status: 'ok',
      cache: stats
    };
  });
};
