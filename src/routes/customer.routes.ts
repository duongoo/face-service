import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../services/database.service';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';
import { registerSchema, getCustomersSchema } from '../schemas/customer.schema';

export const customerRoutes: FastifyPluginAsync = async (fastify) => {
  const dbService: DatabaseService = fastify.dbService;
  const faceService: FaceService = fastify.faceService;
  const cache: CacheService = fastify.cache;
  
  // Register new customer
  fastify.post('/register', {
    schema: registerSchema
  }, async (request, reply) => {
    try {
      // Get uploaded file
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({
          message: 'Thiếu ảnh hoặc tên khách hàng'
        });
      }
      
      // Get name from fields
      const fields = data.fields;
      let name = '';
      
      if (fields.name) {
        const nameField = fields.name;
        if ('value' in nameField) {
          name = nameField.value as string;
        }
      }
      
      if (!name) {
        return reply.code(400).send({
          message: 'Thiếu tên khách hàng'
        });
      }
      
      // Get image buffer
      const buffer = await data.toBuffer();
      
      // Detect face
      const detection = await faceService.detectFace(buffer);
      
      // Save to database
      await dbService.saveCustomer(name, Array.from(detection.descriptor));
      
      // Invalidate cache to reload customers
      await cache.invalidate();
      
      return reply.code(201).send({
        message: `Đăng ký thành công cho "${name}" ✓`,
        customer: name
      });
      
    } catch (error) {
      fastify.log.error(error);
      
      if (error instanceof Error) {
        if (error.message === 'No face detected') {
          return reply.code(400).send({
            message: 'Không tìm thấy khuôn mặt trong ảnh'
          });
        }
      }
      
      return reply.code(500).send({
        message: 'Lỗi server khi đăng ký khách hàng'
      });
    }
  });
  
  // Get all customers
  fastify.get('/customers', {
    schema: getCustomersSchema
  }, async (request, reply) => {
    try {
      const customers = await cache.get();
      
      return reply.send({
        customers,
        total: customers.length
      });
    } catch (error) {
      fastify.log.error(error);
      
      return reply.code(200).send({
        message: 'Không thể lấy danh sách khách hàng'
      });
    }
  });
};
