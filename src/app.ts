import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import formbody from '@fastify/formbody';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { DatabaseService } from './services/database.service';
import { FaceService } from './services/face.service';
import { CacheService } from './services/cache.service';
import { VectorIndexService } from './services/vector-index.service';
import { healthRoutes } from './routes/health.routes';
import { patientRoutes } from './routes/patient.routes';
import { checkinRoutes } from './routes/checkin.routes';
import * as fs from 'fs';

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

  // Parse x-www-form-urlencoded bodies
  await fastify.register(formbody);

  // Swagger / OpenAPI (Tiếng Việt)
  // Cast to any to avoid strict typing issues with @fastify/swagger types
  await fastify.register(swagger as any, {
    openapi: {
      info: {
        title: 'API Nhận dạng khuôn mặt',
        description: 'Dịch vụ API nhận dạng khuôn mặt — quản lý đăng ký, cache và check-in',
        version: '2.0.0'
      }
    },
    exposeRoute: true
  } as any);

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });
  
  // Initialize services
  console.log('\n🔧 Initializing services...\n');
  
  const dbService = new DatabaseService();
  await dbService.connect();
  
  const vectorIndex = new VectorIndexService();
  const faceService = new FaceService(vectorIndex);
  await faceService.loadModels();
  
  const cache = new CacheService(dbService);
  await cache.refresh(); // Pre-load cache (tải dữ liệu ngay khi khởi động)
  
  // Build vector index nếu có nhiều bệnh nhân
  const patients = await cache.get();
  const patientCount = patients.length;
  
  console.log(`\n📊 Số lượng bệnh nhân: ${patientCount.toLocaleString()}`);
  
  // Tự động bật vector index nếu có >=10k bệnh nhân
  if (patientCount >= 10000) {
    console.log('🚀 Building vector index (recommended for large datasets, may take time)...');
    
    const indexPath = './storage/face-index.bin';
    
    // Thử load index từ file trước
    if (fs.existsSync(indexPath)) {
      try {
        await vectorIndex.loadIndex(indexPath, patients);
        console.log('✅ Đã load vector index từ file');
      } catch (error) {
        console.warn('⚠️  Không thể load index, sẽ build mới:', error);
        await faceService.buildVectorIndex(patients);
        vectorIndex.saveIndex(indexPath);
      }
    } else {
      await faceService.buildVectorIndex(patients);
      vectorIndex.saveIndex(indexPath);
      console.log(`✅ Đã lưu vector index vào ${indexPath}`);
    }
    
    faceService.setVectorIndexEnabled(true);
    console.log('✅ Vector index ENABLED - Tăng tốc ~1000x');
  } else {
    console.log('ℹ️  Brute-force mode (số lượng nhỏ, dùng brute-force cho đơn giản và chính xác)');
  }
  
  console.log('\n✓ Tất cả các dịch vụ được khởi tạo\n');
  
  // Decorate Fastify instance with services
  fastify.decorate('dbService', dbService);
  fastify.decorate('faceService', faceService);
  fastify.decorate('cache', cache);
  
  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(patientRoutes);
  await fastify.register(checkinRoutes);
  
  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    await dbService.close();
    console.log('\n✓ Graceful shutdown completed\n');
  });
  
  return fastify;
}
