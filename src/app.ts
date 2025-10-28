import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { DatabaseService } from './services/database.service';
import { FaceService } from './services/face.service';
import { CacheService } from './services/cache.service';
import { healthRoutes } from './routes/health.routes';
import { customerRoutes } from './routes/customer.routes';
import { checkinRoutes } from './routes/checkin.routes';

export async function buildApp() {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  });
  
  // Register plugins
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true
  });
  
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  });
  
  // Initialize services
  console.log('\n🔧 Initializing services...\n');
  
  const dbService = new DatabaseService();
  await dbService.connect();
  
  const faceService = new FaceService();
  await faceService.loadModels();
  
  const cache = new CacheService(dbService);
  await cache.get(); // Pre-load cache
  
  console.log('\n✓ All services initialized\n');
  
  // Decorate Fastify instance with services
  fastify.decorate('dbService', dbService);
  fastify.decorate('faceService', faceService);
  fastify.decorate('cache', cache);
  
  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(customerRoutes);
  await fastify.register(checkinRoutes);
  
  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    await dbService.close();
    console.log('\n✓ Graceful shutdown completed\n');
  });
  
  return fastify;
}
