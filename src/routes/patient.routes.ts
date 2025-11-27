
import { FastifyPluginAsync } from 'fastify';
import { Patient } from '../types';
import { DatabaseService } from '../services/database.service';
import { FaceService } from '../services/face.service';
import { CacheService } from '../services/cache.service';
import { registerSchema, detectionRegisterSchema, getPatientsSchema, addToCacheSchema } from '../schemas/patient.schema';

/**
 * Định nghĩa các route liên quan đến khách hàng cho Fastify.
 *
 * @param fastify - Instance của Fastify, đã được inject các service cần thiết.
 *
 * Các route bao gồm:
 * - POST `/register`: Đăng ký khách hàng mới bằng cách upload ảnh và tên. Ảnh sẽ được kiểm tra khuôn mặt, lưu descriptor vào database, và làm mới cache.
 * - GET `/patients`: Lấy danh sách tất cả khách hàng từ cache.
 *
 * Sử dụng các service:
 * - DatabaseService: Lưu thông tin khách hàng.
 * - FaceService: Phát hiện khuôn mặt và trích xuất descriptor từ ảnh.
 * - CacheService: Lưu và làm mới cache danh sách khách hàng.
 *
 * Schema xác thực:
 * - registerSchema: Xác thực dữ liệu đầu vào cho đăng ký khách hàng.
 * - getPatientsSchema: Xác thực cho lấy danh sách khách hàng.
 */
export const patientRoutes: FastifyPluginAsync = async (fastify) => {
  const dbService: DatabaseService = fastify.dbService;
  const faceService: FaceService = fastify.faceService;
  const cache: CacheService = fastify.cache;
  
  // Register new patient
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
      let PatientId = '';
      
      if (fields.name) {
        const nameField = fields.name;
        if ('value' in nameField) {
          name = nameField.value as string;
        }
      }
      
      if (fields.PatientId) {
        const nameField = fields.PatientId;
        if ('value' in nameField) {
          PatientId = nameField.value as string;
        }
      }
      
      if (!name) {
        return reply.code(400).send({
          message: 'Thiếu tên khách hàng'
        });
      }
      
      if (!PatientId) {
        return reply.code(400).send({
          message: 'Thiếu PatientId khách hàng'
        });
      }
      
      // Get image buffer
      const buffer = await data.toBuffer();
      
      // Detect face
      const detection = await faceService.detectFace(buffer);
      
      // Save to database
      const patient = await dbService.savePatient(PatientId, name, Array.from(detection.descriptor));
      // Update cache ngay lập tức
      cache.addOrUpdatePatient(patient);

      return reply.code(201).send({
        message: `Đăng ký thành công cho "${name}" ✓`,
        patient: name
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

  // New endpoint: register using descriptor sent from client (binary Float32 via multipart/form-data)
  fastify.post('/register/detection', {
    schema: detectionRegisterSchema
  }, async (request, reply) => {
    try {
      // Expect multipart/form-data with file field named 'descriptor' and field 'name'
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          message: 'Thiếu tên hoặc descriptor để đăng ký'
        });
      }

      // Get name from fields
      const fields = data.fields;
      let name = '';
      let PatientId = '';

      if (fields.name) {
        const nameField = fields.name;
        if ('value' in nameField) {
          name = nameField.value as string;
        }
      }
      
      if (fields.PatientId) {
        const nameField = fields.PatientId;
        if ('value' in nameField) {
          PatientId = nameField.value as string;
        }
      }

      if (!name) {
        return reply.code(400).send({
          message: 'Thiếu tên khách hàng'
        });
      }
      
      if (!PatientId) {
        return reply.code(400).send({
          message: 'Thiếu ID khách hàng'
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
          message: 'Descriptor rỗng hoặc không hợp lệ'
        });
      }

      const patient = await dbService.savePatient( PatientId, name, Array.from(descriptor));
      cache.addOrUpdatePatient(patient);

      return reply.code(201).send({
        message: `Đăng ký thành công cho "${name}" ✓`,
        patient: name
      });
    } catch (error) {
      fastify.log.error(error);

      return reply.code(500).send({
        message: 'Lỗi server khi đăng ký khách hàng bằng descriptor'
      });
    }
  });

  
  // Get all patients
  fastify.get('/patients', {
    schema: getPatientsSchema
  }, async (request, reply) => {
    try {
      const patients = await cache.get();
      
      return reply.send({
        patients,
        total: patients.length
      });
    } catch (error) {
      fastify.log.error(error);
      
      return reply.code(500).send({
        message: 'Không thể lấy danh sách khách hàng'
      });
    }
  });
  // API thêm/cập nhật patient vào cache trực tiếp
  fastify.post('/patients/add-to-cache', { schema: addToCacheSchema }, async (request, reply) => {
    try {
      const patient = request.body as any;
      if (!patient || !patient.PatientId) {
        return reply.code(400).send({ message: 'Patient data invalid' });
      }

      // Normalize descriptor field name if client used different casing
      const descriptor = Array.isArray(patient.Descriptor)
        ? patient.Descriptor
        : Array.isArray(patient.descriptor)
        ? patient.descriptor
        : [];

      const normalizedPatient: Patient = {
        PatientId: String(patient.PatientId),
        PatientName: patient.PatientName || patient.Name || '',
        Descriptor: descriptor
      } as unknown as Patient;

      cache.addOrUpdatePatient(normalizedPatient);
      return reply.send({ message: 'Đã thêm/cập nhật Patient vào cache thành công' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ message: 'Lỗi server khi thêm Patient vào cache' });
    }
  });

  // API cập nhật lại cache khách hàng thủ công
  fastify.post('/patients/refresh-cache', { 
    schema: {
      description: 'Làm mới toàn bộ cache patient từ database.',
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Thông báo kết quả' }
          }
        },
        500: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Lỗi server' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      await cache.refresh();
      return reply.send({
        message: 'Đã làm mới cache khách hàng thành công'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        message: 'Lỗi server khi làm mới cache khách hàng'
      });
    }
  });
};
