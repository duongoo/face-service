export const registerSchema = {
  description: 'Đăng ký khách hàng bằng ảnh. Ảnh được gửi dưới dạng multipart/form-data; server phát hiện khuôn mặt, sinh descriptor, lưu vào database và cập nhật cache.',
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
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
    500: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Thông báo lỗi server' }
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
              PatientId: { type: 'string', description: 'Mã định danh khách hàng' },
              PatientName: { type: 'string', description: 'Tên khách hàng' },
              Descriptor: {
                type: 'string',
                description: 'Danh sách các vector đặc trưng khuôn mặt',
                // items: {
                //   type: 'array',
                //   items: { type: 'number', description: 'Giá trị vector đặc trưng' }
                // }
              },
              SortOrder: { type: 'number', description: 'Thứ tự sắp xếp', nullable: true }
            },
            required: ['PatientId', 'PatientName', 'Descriptor']
          }
        },
        total: { type: 'number', description: 'Tổng số khách hàng' }
      },
      required: ['patients', 'total']
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
    type: 'object',
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
        isOk: { type: 'boolean' },
        success: { type: 'boolean' },
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
 * Schema cho API thêm/cập nhật patient vào cache. Nếu `saveToDb` = true thì sẽ lưu thêm vào database.
 */
export const addToCacheSchema = {
  description: 'Thêm hoặc cập nhật patient vào cache. Mặc định chỉ thao tác cache; nếu `saveToDb` = true thì sẽ lưu thêm vào database.',
  body: {
    type: 'object',
    required: ['PatientId'],
    properties: {
      PatientId: { type: 'string', description: 'Mã định danh duy nhất của khách hàng' },
      PatientName: { type: 'string', description: 'Tên khách hàng' },
      Descriptor: {
        type: 'string',
        items: { type: 'number' },
        description: 'Mảng số đại diện descriptor (nếu có)'
      },
      saveToDb: { type: 'boolean', description: 'Nếu true thì lưu patient vào database ngoài việc cập nhật cache' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        isOk: { type: 'boolean' },
        success: { type: 'boolean' }
      }
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        isOk: { type: 'boolean' },
        success: { type: 'boolean' }
      }
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        isOk: { type: 'boolean' },
        success: { type: 'boolean' }
      }
    }
  }
};
