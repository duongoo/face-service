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
║   🚀 Face Recognition API Server                     ║
║                                                       ║
║   Server:  http://localhost:${config.port}                    ║
║   Status:  Ready ✓                                   ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

start();
