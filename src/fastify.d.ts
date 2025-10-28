import { FastifyRequest } from 'fastify';
import { DatabaseService } from './services/database.service';
import { FaceService } from './services/face.service';
import { CacheService } from './services/cache.service';
import { MultipartFile } from '@fastify/multipart';

declare module 'fastify' {
  interface FastifyInstance {
    dbService: DatabaseService;
    faceService: FaceService;
    cache: CacheService;
  }
  
  interface FastifyRequest {
    file(): Promise<MultipartFile>;
  }
}
