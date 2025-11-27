export const healthSchema = {
  description: 'Health check của API',
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Trạng thái service (ok/failed)' },
        message: { type: 'string', description: 'Mô tả ngắn về trạng thái' },
        timestamp: { type: 'string', description: 'Timestamp ISO' }
      }
    }
  }
};

export const cacheStatsSchema = {
  description: 'Trả về thống kê cache (số lượng patient, tuổi cache, TTL)',
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Trạng thái response' },
        cache: {
          type: 'object',
          properties: {
            patientCount: { type: 'number', description: 'Số lượng patient trong cache' },
            lastUpdateSeconds: { type: 'number', description: 'Thời gian (giây) kể từ lần cập nhật cuối' },
            ttlSeconds: { type: 'number', description: 'TTL của cache (giây)' }
          }
        }
      }
    }
  }
};
