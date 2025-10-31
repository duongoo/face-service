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
    matchThreshold: Number(process.env.FACE_MATCH_THRESHOLD) || 0.55,
    detectorOptions: {
      inputSize: Number(process.env.FACE_DETECTOR_INPUT_SIZE) || 256,
      scoreThreshold: Number(process.env.FACE_DETECTOR_SCORE_THRESHOLD) || 0.5
    }
  },
  
  // Cache
  cache: {
    ttl: Number(process.env.CACHE_TTL) || 5 * 60 * 1000 // 5 phút
  }
};
