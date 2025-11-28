
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
      // Cập nhật vector index incremental (nếu đang bật)
      try {
        if (faceService.isVectorIndexEnabled() && patient.Descriptor && patient.Descriptor.length > 0) {
          for (const desc of patient.Descriptor) {
            faceService.addDescriptorToIndex(patient.PatientId, desc);
          }
        }
      } catch (e) {
        fastify.log.warn('Vector index update failed for PatientId=' + patient.PatientId + ': ' + (e instanceof Error ? e.message : String(e)));
      }

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
      // Cập nhật vector index incremental (nếu đang bật)
      try {
        if (faceService.isVectorIndexEnabled() && patient.Descriptor && patient.Descriptor.length > 0) {
          for (const desc of patient.Descriptor) {
            faceService.addDescriptorToIndex(patient.PatientId, desc);
          }
        }
      } catch (e) {
        fastify.log.warn('Vector index update failed for PatientId=' + patient.PatientId + ': ' + (e instanceof Error ? e.message : String(e)));
      }

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
  // API thêm/cập nhật patient vào cache trực tiếp — có thể chọn lưu thêm vào DB nếu client gửi `saveToDb: true`
  fastify.post('/patients/add-to-cache', { schema: addToCacheSchema }, async (request, reply) => {
    try {
      const patient = request.body as any;
      if (!patient || !patient.PatientId) {
        return reply.code(400).send({ message: 'Patient data invalid' });
      }

      // Normalize descriptor field name if client used different casing
      // and accept Descriptor sent as a JSON string (from some clients)
      const rawDescriptor = patient.Descriptor ?? patient.descriptor;
      let normalizedDescriptor: number[][] = [];

      if (typeof rawDescriptor === 'string') {
        try {
          const parsed = JSON.parse(rawDescriptor);
          if (Array.isArray(parsed)) {
            // parsed may be number[] (single descriptor) or number[][]
            if (parsed.length === 0) {
              normalizedDescriptor = [];
            } else if (typeof parsed[0] === 'number') {
              normalizedDescriptor = [parsed as number[]];
            } else if (Array.isArray(parsed[0])) {
              normalizedDescriptor = parsed as number[][];
            }
          }
        } catch (e) {
          fastify.log.warn('Invalid JSON descriptor string received for PatientId=' + String(patient.PatientId));
          normalizedDescriptor = [];
        }
      } else if (Array.isArray(rawDescriptor)) {
        // rawDescriptor might be number[] or number[][]
        if (rawDescriptor.length === 0) {
          normalizedDescriptor = [];
        } else if (typeof rawDescriptor[0] === 'number') {
          normalizedDescriptor = [rawDescriptor as number[]];
        } else if (Array.isArray(rawDescriptor[0])) {
          normalizedDescriptor = rawDescriptor as number[][];
        }
      }

      const normalizedPatient: Patient = {
        PatientId: String(patient.PatientId),
        PatientName: patient.PatientName || patient.Name || '',
        Descriptor: normalizedDescriptor
      } as unknown as Patient;

      const saveToDb = Boolean(patient.saveToDb);

      if (saveToDb) {
        // Lưu vào database trước, dùng kết quả trả về để cập nhật cache (đảm bảo thông tin nhất quán)
        try {
          // Chuẩn hoá descriptor cho dbService.savePatient (expects number[])
          let descriptorForDb: number[] = [];
          const desc = normalizedPatient.Descriptor as any;
          if (Array.isArray(desc)) {
            if (desc.length === 0) {
              descriptorForDb = [];
            } else if (typeof desc[0] === 'number') {
              // desc is number[]
              descriptorForDb = desc as number[];
            } else if (Array.isArray(desc[0])) {
              // desc is number[][]
              const arr2 = desc as number[][];
              descriptorForDb = arr2[arr2.length - 1] || [];
            }
          }

          const saved = await dbService.savePatient(
            normalizedPatient.PatientId,
            normalizedPatient.PatientName,
            descriptorForDb
          );
          cache.addOrUpdatePatient(saved);
          // Cập nhật vector index incremental (nếu bật)
          try {
            if (faceService.isVectorIndexEnabled() && saved.Descriptor && saved.Descriptor.length > 0) {
              for (const desc of saved.Descriptor) {
                faceService.addDescriptorToIndex(saved.PatientId, desc);
              }
            }
          } catch (e) {
            fastify.log.warn('Vector index update failed for PatientId=' + saved.PatientId + ': ' + (e instanceof Error ? e.message : String(e)));
          }
          return reply.send({ isOk:true, success:true, message: 'Đã thêm/cập nhật Patient vào cache và database thành công' });
        } catch (dbError) {
          fastify.log.error(dbError);
          return reply.code(500).send({ isOk:false, success:false,message: 'Lỗi server khi lưu Patient vào database' });
        }
      } else {
        cache.addOrUpdatePatient(normalizedPatient);
        // Cập nhật vector index incremental (nếu bật và có descriptor)
        try {
          if (faceService.isVectorIndexEnabled() && normalizedPatient.Descriptor && normalizedPatient.Descriptor.length > 0) {
            for (const desc of normalizedPatient.Descriptor) {
              faceService.addDescriptorToIndex(normalizedPatient.PatientId, desc);
            }
          }
        } catch (e) {
          fastify.log.warn('Vector index update failed for PatientId=' + normalizedPatient.PatientId + ': ' + (e instanceof Error ? e.message : String(e)));
        }
        return reply.send({ isOk:true, success:true, message: 'Đã thêm/cập nhật Patient vào cache thành công' });
      }
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
            message: { type: 'string', description: 'Thông báo kết quả' },
            isOk: { type: 'boolean' },
            success: { type: 'boolean' }
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
        isOk:true, success:true,
        message: 'Đã làm mới cache khách hàng thành công'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        isOk:false, success:false,
        message: 'Lỗi server khi làm mới cache khách hàng'
      });
    }
  });
};
