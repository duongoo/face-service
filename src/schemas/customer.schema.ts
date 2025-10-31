export const registerSchema = {
  consumes: ['multipart/form-data'],
  body: {
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        minLength: 2,
        maxLength: 50,
        description: 'Tên khách hàng'
      }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        customer: { type: 'string' }
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

export const getCustomersSchema = {
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
        customers: {
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
  consumes: ['multipart/form-data'],
  body: {
    required: ['name'],
    properties: {
      name: { type: 'string' }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        customer: { type: 'string' }
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
