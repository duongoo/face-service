export const checkinSchema = {
  consumes: ['multipart/form-data'],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        customer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            confidence: { type: 'number' }
          }
        },
        message: { type: 'string' }
      }
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
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
