import { buildApp } from './app';
import { config } from './config';

async function start() {
  try {
    const app = await buildApp();
    
    await app.listen({
      port: config.port,
      host: '0.0.0.0'
    });
    
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 Máy chủ API nhận dạng khuôn mặt                     ║
║                                                       ║
║   Server:  http://localhost:${config.port}                    ║
║   Status:  Ready ✓                                   ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
    
  } catch (error) {
    console.error('❌ Đã xảy ra lỗi khi khởi động máy chủ:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Đã nhận được SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Đã nhận được SIGTERM');
  process.exit(0);
});

start();
