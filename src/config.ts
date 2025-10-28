export const config = {
  // App
  port: Number(process.env.PORT) || 3000,
  corsOrigin: 'http://localhost:4200',
  
  // Database
  database: {
    user: 'emr',
    password: 'Simmed@!@#$',
    server: '192.168.20.100',
    database: 'deepface',
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
    modelPath: './models',
    matchThreshold: 0.55,
    detectorOptions: {
      inputSize: 256,
      scoreThreshold: 0.5
    }
  },
  
  // Cache
  cache: {
    ttl: 5 * 60 * 1000 // 5 phút
  }
};
