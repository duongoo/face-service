import 'dotenv/config';

export const config = {
  // App
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200', 'http://localhost:62502'],
  
  // Database
  database: {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    server: process.env.DB_SERVER || '192.168.20.100',
    database: process.env.DB_DATABASE || 'deepface',
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000
    },
    options: {
      encrypt: true,
      trustServerCertificate: true,
      requestTimeout: 30000
    }
  },
  
  // Face recognition
  face: {
    modelPath: './storage/models',
    // Khoảng cách tối đa để coi là khớp, số càng nhỏ càng chính xác
    // Hạ ngưỡng từ 0.45 (lỏng) xuống 0.35 (chặt hơn)
    matchThreshold: Number(process.env.FACE_MATCH_THRESHOLD) || 0.35,
    detectorOptions: {
      inputSize: Number(process.env.FACE_DETECTOR_INPUT_SIZE) || 256, // Kích thước ảnh đầu vào cho bộ phát hiện khuôn mặt (nếu dùng TinyFaceDetector)
      scoreThreshold: Number(process.env.FACE_DETECTOR_SCORE_THRESHOLD) || 0.7, // Ngưỡng phát hiện khuôn mặt; tăng để giảm false positives
      // Tỷ lệ diện tích khuôn mặt tối thiểu so với ảnh (ví dụ: 0.02 => 2%)
      minFaceRatio: Number(process.env.FACE_MIN_FACE_RATIO) || 0.02
    },
    // Tùy chọn bổ sung
    maxDescriptorDistanceForAcceptance: Number(process.env.FACE_MAX_DESCRIPTOR_DISTANCE) || 0.35 // Khoảng cách tối đa giữa 2 descriptor để coi là cùng 1 người
  },
  
  // Cache
  cache: {
    ttl: Number(process.env.CACHE_TTL) || 5 * 60 * 1000 // 5 phút
  }
};
