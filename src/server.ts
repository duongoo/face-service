import { buildApp } from './app';
import { config } from './config';
import { initSocket } from './socket';

async function start() {
  let io: any;
  try {
    const app = await buildApp();

    // Khởi tạo Socket.IO trên http.Server của Fastify trước khi lắng nghe
    // (app.server là node http.Server)
    io = initSocket(app.server);

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
╚════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error('❌ Đã xảy ra lỗi khi khởi động máy chủ:', error);
    // Nếu io đã khởi tạo, đóng nó trước khi exit
    try { if (io && typeof io.close === 'function') io.close(); } catch (e) {}
    process.exit(1);
  }
}

// Handle process signals to shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Đã nhận được SIGINT');
  // Đóng Socket.IO nếu cần
  try { if (globalThis && (globalThis as any).__socket_io__) (globalThis as any).__socket_io__.close(); } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Đã nhận được SIGTERM');
  try { if (globalThis && (globalThis as any).__socket_io__) (globalThis as any).__socket_io__.close(); } catch (e) {}
  process.exit(0);
});

start();
