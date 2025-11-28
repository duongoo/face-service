import { FastifyPluginAsync } from 'fastify';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';
import { DatabaseService } from '../services/database.service';
import { checkinSchema, detectionCheckinSchema } from '../schemas/checkin.schema';


/**
 * Routes xử lý check-in khách hàng bằng nhận diện khuôn mặt
 * 
 * Module này cung cấp các endpoint cho việc check-in khách hàng thông qua
 * việc so khớp khuôn mặt với dữ liệu đã đăng ký trong hệ thống.
 * 
 * @module checkin.routes
 * 
 * Danh sách Routes:
 * - POST /checkin - Check-in khách hàng bằng nhận diện khuôn mặt
 * 
 * Flow xử lý check-in:
 * 1. Nhận ảnh từ client (multipart/form-data)
 * 2. Phát hiện khuôn mặt trong ảnh (100-200ms)
 * 3. Lấy danh sách khách hàng từ cache (0-5ms)
 * 4. So khớp khuôn mặt với dữ liệu đã lưu (50-100ms)
 * 5. Trả về kết quả check-in
 * 
 * Tối ưu hóa:
 * - Sử dụng cache để tránh truy vấn database nhiều lần
 * - Xử lý bất đồng bộ để tối đa hiệu năng
 * - Tổng thời gian xử lý: ~150-300ms
 * 
 * @requires FaceService - Service xử lý nhận diện khuôn mặt
 * @requires CacheService - Service quản lý cache khách hàng
 */

export const checkinRoutes: FastifyPluginAsync = async (fastify) => {
  const faceService: FaceService = fastify.faceService;
  const cache: CacheService = fastify.cache;
  const dbService: DatabaseService = fastify.dbService;
  
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
      
      // Step 2: Get patients from cache (0-5ms) - KEY OPTIMIZATION!
      const patients = await cache.get();
      
      // Step 3: Match face (50-100ms)
      const match = await faceService.matchFace(detection.descriptor, patients);
      
      // Return success result
      return {
        success: true,
        patient: {
          PatientName: match.patient.PatientName,
          PatientId: match.patient.PatientId,
          SortOrder: match.patient.SortOrder,
          distance : match.distance,
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
        
        if (error.message === 'Patient not recognized') {
          return reply.code(400).send({
            success: false,
            message: 'Không nhận ra khách hàng! Vui lòng đăng ký trước.'
          });
        }
        
        if (error.message === 'No patients in database') {
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

  // New endpoint: check-in using descriptor sent from client (binary Float32 via multipart/form-data)
  fastify.post('/checkin/detection', {
    schema: detectionCheckinSchema
  }, async (request, reply) => {
    try {
      // Expect multipart/form-data with a file field named 'descriptor'
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          success: false,
          message: 'Thiếu descriptor để check-in'
        });
      }

      // Read uploaded file into a Buffer
      const buf = await data.toBuffer();

      // Convert Buffer -> Float32Array safely taking byteOffset into account
      const descriptor = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / Float32Array.BYTES_PER_ELEMENT
      );

      if (!descriptor || descriptor.length === 0) {
        return reply.code(400).send({
          success: false,
          message: 'Descriptor rỗng hoặc không hợp lệ'
        });
      }

      const patients = await cache.get();
      const match = await faceService.matchFace(descriptor, patients);

      return {
        success: true,
        isOk:true,
        patient: {
          PatientName: match.patient.PatientName,
          PatientId: match.patient.PatientId,
          SortOrder: match.patient.SortOrder,
          distance: match.distance,
          confidence: 1 - match.distance
        },
        message: 'Check-in thành công! ✓'
      };
    } catch (error) {
      fastify.log.error(error);

      if (error instanceof Error) {
        if (error.message === 'Patient not recognized') {
          return reply.code(400).send({
            success: false,
            message: 'Không nhận ra khách hàng! Vui lòng đăng ký trước.'
          });
        }

        if (error.message === 'No patients in database') {
          return reply.code(400).send({
            success: false,
            message: 'Chưa có khách hàng nào trong hệ thống'
          });
        }
      }

      return reply.code(500).send({
        message: 'Lỗi server khi check-in bằng descriptor'
      });
    }
  });

  
};
