import { FastifyPluginAsync } from 'fastify';
import { CacheService } from '../services/cache.service';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const cache: CacheService = fastify.cache;
  
  // Health check
  fastify.get('/', async (request, reply) => {
    return {
      status: 'ok',
      message: 'Face Recognition API - Ready ✓',
      timestamp: new Date().toISOString()
    };
  });
  
  // Cache stats
  fastify.get('/cache-stats', async (request, reply) => {
    const stats = cache.getStats();
    return {
      status: 'ok',
      cache: stats
    };
  });
};
