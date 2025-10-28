import { DatabaseService } from '../services/database.service';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';

declare module 'fastify' {
  export interface FastifyInstance {
    dbService: DatabaseService;
    faceService: FaceService;
    cache: CacheService;
  }
}
