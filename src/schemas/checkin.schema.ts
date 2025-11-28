export const checkinSchema = {
  description: 'Check-in khách hàng bằng ảnh. Gửi ảnh qua multipart/form-data; server phát hiện khuôn mặt, so khớp với dữ liệu trong cache và trả về thông tin kết quả.',
  consumes: ['multipart/form-data'],
  response: {
    200: {
      properties: {
        success: { type: 'boolean', description: 'Trạng thái thành công của thao tác' },
        isOk: { type: 'boolean' },
        patient: {
          type: 'object',
          description: 'Thông tin patient được nhận dạng',
          properties: {
            PatientName: { type: 'string', description: 'Tên khách hàng' },
            PatientId: { type: 'string', description: 'Mã định danh khách hàng' },
            SortOrder: { type: 'number', description: 'Thứ tự sắp xếp (nếu có)' },
            distance: { type: 'number', description: 'Khoảng cách (distance) giữa descriptor' },
            confidence: { type: 'number', description: 'Độ tin cậy ước tính (1 - distance)' }
          }
        },
        message: { type: 'string', description: 'Thông báo trạng thái' }
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
  description: 'Check-in bằng descriptor (file nhị phân Float32). Gửi descriptor dưới dạng multipart/form-data với field `descriptor`.',
  consumes: ['multipart/form-data'],
  body: {
    properties: {
      confidence: { type: 'number', description: 'Ngưỡng confidence mong muốn (tuỳ chọn)' }
    }
  },
  response: checkinSchema.response
};
