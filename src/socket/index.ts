import http from 'http';
/**
 * Khởi tạo Socket.IO server và đăng ký các event dùng chung.
 * Mục tiêu:
 * - Mỗi quầy có room theo counterId
 * - Tablet và PC/printer/khách hàng sẽ join cùng room
 * - Event chuẩn: join-counter, trigger-capture, send-photo, send-stream
 *
 * Lưu ý: import 'socket.io' động để tránh lỗi biên dịch nếu chưa cài package/types.
 */

type AnyServer = any;

export function initSocket(server: http.Server) {
  // import động để tránh lỗi khi @types/socket.io chưa được cài
  // tại runtime nếu package chưa có thì require sẽ ném lỗi — người dùng cần cài socket.io cho môi trường chạy.
  // Đặt io lên globalThis để có thể đóng từ nơi khác khi shutdown.
  const { Server: IOServer } = require('socket.io') as any;
  const io: AnyServer = new IOServer(server, {
    cors: {
      origin: '*', // Dev: allow all. Trong production hãy cấu hình lại.
      methods: ['GET', 'POST']
    }
  });
  (globalThis as any).__socket_io__ = io;

  io.on('connection', (socket: any) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Join room theo counterId
    socket.on('join-counter', (counterId: string) => {
      if (!counterId || typeof counterId !== 'string') return;
      socket.join(counterId);
      console.log(`[socket] ${socket.id} joined room ${counterId}`);
    });

    // Hỗ trợ join với role (ví dụ: { counterId, role: 'staff' | 'customer' | 'tablet' })
    socket.on('join-counter-role', (payload: { counterId: string; role?: string }) => {
      const { counterId, role } = payload || {};
      if (!counterId) return;
      socket.join(counterId);
      // gắn role nếu cần sau này (ví dụ lưu vào socket.data)
      socket.data = { ...(socket.data || {}), role };
      console.log(`[socket] ${socket.id} joined room ${counterId} as ${role || 'unknown'}`);
    });

    // PC gửi lệnh yêu cầu Tablet chụp ảnh
    socket.on('trigger-capture', (counterId: string) => {
      if (!counterId) return;
      // Gửi tới tất cả trong room TRỪ chính socket gửi (thường là PC)
      socket.to(counterId).emit('req-take-photo');
      console.log(`[socket] ${socket.id} -> trigger-capture for ${counterId}`);
    });

    // Tablet gửi ảnh đã chụp (base64 string hoặc object) về server
    socket.on('send-photo', (data: { counterId: string; imageData: string; meta?: any }) => {
      if (!data || !data.counterId) return;
      // Phát tới các client khác trong room (ví dụ PC và màn hình khách)
      socket.to(data.counterId).emit('res-photo-received', {
        imageData: data.imageData,
        meta: data.meta || {}
      });
      console.log(`[socket] ${socket.id} -> send-photo to room ${data.counterId}`);
    });

    // Stream video: tablet có thể gửi các chunk (ArrayBuffer, base64 chunk, hoặc binary)
    socket.on('send-stream', (data: { counterId: string; chunk: any; meta?: any }) => {
      if (!data || !data.counterId) return;
      // Phát ngay tới các client trong room (thường với tên event res-stream)
      socket.to(data.counterId).emit('res-stream', {
        chunk: data.chunk,
        meta: data.meta || {}
      });
      // Không ghi log chi tiết chunk để tránh spam console
    });

    // Tùy: PC có thể yêu cầu dừng stream
    socket.on('stop-stream', (counterId: string) => {
      if (!counterId) return;
      socket.to(counterId).emit('res-stop-stream');
    });

    socket.on('disconnect', (reason: string) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}
