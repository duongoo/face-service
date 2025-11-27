export const registerSchema = {
  description: 'Đăng ký khách hàng bằng ảnh. Ảnh được gửi dưới dạng multipart/form-data; server phát hiện khuôn mặt, sinh descriptor, lưu vào database và cập nhật cache.',
  consumes: ['multipart/form-data'],
  body: {
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        minLength: 2,
        maxLength: 50,
        description: 'Tên khách hàng'
      },
      PatientId: {
        type: 'string',
        description: 'Mã định danh duy nhất của khách hàng'
      }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        patient: { type: 'string' }
      }
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  }
};

export const getPatientsSchema = {
  description: 'Lấy danh sách khách hàng hiện có trong cache.',
  response: {
    500 :{
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    200: {
      type: 'object',
      properties: {
        patients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              descriptors: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'number' }
                }
              }
            }
          }
        },
        total: { type: 'number' }
      }
    }
  }
};

/**
 * Schema cho endpoint nhận descriptor từ client (binary file upload)
 * Expect multipart/form-data with file field 'descriptor' and field 'name'
 */
export const detectionRegisterSchema = {
  description: 'Đăng ký khách hàng bằng descriptor gửi từ client (file nhị phân Float32). Không cần ảnh, descriptor sẽ được lưu vào DB và cập nhật cache.',
  consumes: ['multipart/form-data'],
  body: {
    required: ['name'],
    properties: {
      name: { type: 'string' },
      PatientId: { type: 'string', description: 'Mã định danh duy nhất của khách hàng' }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        patient: { type: 'string' }
      }
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  }
};

/**
 * Schema cho API thêm/cập nhật patient vào cache (không ghi DB)
 */
export const addToCacheSchema = {
  description: 'Thêm hoặc cập nhật patient vào cache. Chỉ thao tác cache, không ghi vào database.',
  body: {
    required: ['PatientId'],
    properties: {
      PatientId: { type: 'string', description: 'Mã định danh duy nhất của khách hàng' },
      PatientName: { type: 'string', description: 'Tên khách hàng' },
      Descriptor: {
        type: 'array',
        items: { type: 'number' },
        description: 'Mảng số đại diện descriptor (nếu có)'
      }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  }
};
