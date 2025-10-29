
import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../services/database.service';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';
import { registerSchema, getCustomersSchema } from '../schemas/customer.schema';

/**
 * Định nghĩa các route liên quan đến khách hàng cho Fastify.
 *
 * @param fastify - Instance của Fastify, đã được inject các service cần thiết.
 *
 * Các route bao gồm:
 * - POST `/register`: Đăng ký khách hàng mới bằng cách upload ảnh và tên. Ảnh sẽ được kiểm tra khuôn mặt, lưu descriptor vào database, và làm mới cache.
 * - GET `/customers`: Lấy danh sách tất cả khách hàng từ cache.
 *
 * Sử dụng các service:
 * - DatabaseService: Lưu thông tin khách hàng.
 * - FaceService: Phát hiện khuôn mặt và trích xuất descriptor từ ảnh.
 * - CacheService: Lưu và làm mới cache danh sách khách hàng.
 *
 * Schema xác thực:
 * - registerSchema: Xác thực dữ liệu đầu vào cho đăng ký khách hàng.
 * - getCustomersSchema: Xác thực cho lấy danh sách khách hàng.
 */
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
      
      return reply.code(500).send({
        message: 'Không thể lấy danh sách khách hàng'
      });
    }
  });
};
