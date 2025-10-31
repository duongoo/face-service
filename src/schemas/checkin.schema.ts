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
            distance: { type: 'number' },
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

/**
 * Schema cho endpoint nhận descriptor từ client (binary file upload)
 * Expect multipart/form-data with file field 'descriptor' containing Float32 binary
 */
export const detectionCheckinSchema = {
  consumes: ['multipart/form-data'],
  body: {
    properties: {
      confidence: { type: 'number' }
    }
  },
  response: checkinSchema.response
};
