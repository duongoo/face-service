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
    origin: (origin, cb) => {
      const allowed = (Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin]).map(s => String(s).trim());
      console.log(`[CORS] request origin: ${origin} | allowed: ${JSON.stringify(allowed)}`);
      // Allow non-browser requests (no origin)
      if (!origin) return cb(null, true);
      // Exact match after trimming
      if (allowed.includes(origin.trim())) return cb(null, true);
      // Temporary: allow any localhost origin to help debugging (ports vary)
      if (origin && origin.startsWith('http://localhost')) {
        console.log(`[CORS] auto-allow localhost origin: ${origin}`);
        return cb(null, true);
      }
      return cb(null, false);
    },
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
  await cache.refresh(); // Pre-load cache (tải dữ liệu ngay khi khởi động)
  
  console.log('\n✓ Tất cả các dịch vụ được khởi tạo\n');
  
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
