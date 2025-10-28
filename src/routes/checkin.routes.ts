import { FastifyPluginAsync } from 'fastify';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';
import { checkinSchema } from '../schemas/checkin.schema';

export const checkinRoutes: FastifyPluginAsync = async (fastify) => {
  const faceService: FaceService = fastify.faceService;
  const cache: CacheService = fastify.cache;
  
  // Check-in endpoint (OPTIMIZED FOR SPEED)
  fastify.post('/checkin', {
    schema: checkinSchema
  }, async (request, reply) => {
    try {
      // Get uploaded file
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({
          success: false,
          message: 'Thiếu ảnh để check-in'
        });
      }
      
      // Get image buffer
      const buffer = await data.toBuffer();
      
      // Step 1: Detect face (100-200ms)
      const detection = await faceService.detectFace(buffer);
      
      // Step 2: Get customers from cache (0-5ms) - KEY OPTIMIZATION!
      const customers = await cache.get();
      
      // Step 3: Match face (50-100ms)
      const match = await faceService.matchFace(detection.descriptor, customers);
      
      // Return success result
      return {
        success: true,
        customer: {
          name: match.customer.name,
          confidence: 1 - match.distance
        },
        message: 'Check-in thành công! ✓'
      };
      
    } catch (error) {
      fastify.log.error(error);
      
      if (error instanceof Error) {
        if (error.message === 'No face detected') {
          return reply.code(400).send({
            success: false,
            message: 'Không tìm thấy khuôn mặt trong ảnh'
          });
        }
        
        if (error.message === 'Customer not recognized') {
          return reply.code(400).send({
            success: false,
            message: 'Không nhận ra khách hàng! Vui lòng đăng ký trước.'
          });
        }
        
        if (error.message === 'No customers in database') {
          return reply.code(400).send({
            success: false,
            message: 'Chưa có khách hàng nào trong hệ thống'
          });
        }
      }
      
      return reply.code(500).send({
        message: 'Lỗi server khi check-in'
      });
    }
  });
};
