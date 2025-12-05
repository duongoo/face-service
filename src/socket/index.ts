import http from 'http';

/**
 * Socket signaling cho face-service (bằng tiếng Việt)
 *
 * Mô tả tổng quan:
 * - Mỗi `room` tương ứng với một `counterId`.
 * - Mỗi room chỉ chấp nhận tối đa 2 client: 1 thiết bị PC (role: 'pc') và 1 thiết bị iPad (role: 'ipad').
 * - Server chỉ đóng vai trò signaling relay: nhận offer/answer/candidate từ caller, and phát tới callee.
 *
 * Caller / Callee (quy ước):
 * - caller: phía khởi tạo offer (thường là iPad/camera) — gửi 'webrtc-offer' tới server.
 * - callee: phía nhận offer (thường là PC/viewer) — nhận 'webrtc-offer' từ server và trả 'webrtc-answer'.
 *
 * pendingOffers (ý nghĩa rõ ràng):
 * - Đây là bộ nhớ tạm (Map) lưu trạng thái offer chưa được deliver cho callee.
 * - Kiểu: Map<roomId, { from: socketId của caller, sdp: any }>
 * - Trường hợp sử dụng:
 *   1. iPad (caller) join trước: server sẽ tạo một entry pendingOffers với { from: socketId, sdp: null }
 *      để đánh dấu "publisher đang chờ PC". Khi iPad gửi offer thực tế, entry được cập nhật sdp.
 *   2. iPad gửi offer nhưng PC chưa join: server lưu offer vào pendingOffers để deliver sau khi PC join.
 *   3. Khi PC join: server kiểm tra pendingOffers, nếu có sdp => relay offer tới PC; nếu sdp === null => thông báo
 *      cho PC rằng publisher đang chờ (sự kiện 'publisher-waiting').
 *   4. Khi nhận answer từ PC, server xóa entry pendingOffers để tránh deliver lại offer cũ.
 *
 * Ghi chú:
 * - Server KHÔNG xử lý/biến đổi SDP hay ICE; chỉ relay (chỉ định toSocketId khi cần).
 * - Tên event và payload được viết rõ để dễ hiểu (caller -> server -> callee).
 */

type AnyServer = any;
type AnySocket = any;

/**
 * pendingOffers
 * - Key: roomId (string)
 * - Value: { from: socketId của caller, sdp: any | null }
 * - Giá trị sdp == null có nghĩa là "publisher đã join nhưng chưa gửi offer".
 */
const pendingOffers: Map<string, { from: string; sdp: any }> = new Map();

/* ---------- Helpers (chú thích tiếng Việt) ---------- */

/**
 * extractRoomId
 * - Input: payload có thể là string (roomId) hoặc object { roomId, counterId, ... }
 * - Output: roomId string hoặc null nếu không hợp lệ
 * - Caller: bất cứ handler nào nhận payload chứa roomId
 */
function extractRoomId(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    return payload.roomId || payload.counterId || null;
  }
  return null;
}

/**
 * safeAck
 * - Gọi ack nếu được cung cấp, tránh ném lỗi khi ack không tồn tại
 * - Dùng để trả về kết quả cho client caller
 */
function safeAck(ack?: Function, payload?: any) {
  if (typeof ack === 'function') {
    try { ack(payload); } catch (e) { /* ignore ack errors */ }
  }
}

/**
 * getRoomClients / countRoomClients
 * - Lấy tập client trong room và đếm số client
 * - Dùng để enforce giới hạn số client (max 2)
 */
function getRoomClients(io: AnyServer, roomId: string): Set<string> | undefined {
  return io.sockets.adapter.rooms.get(roomId);
}
function countRoomClients(io: AnyServer, roomId: string): number {
  const set = getRoomClients(io, roomId);
  return set ? set.size : 0;
}

/**
 * findRoleInRoom
 * - Tìm xem room đã có role tương ứng chưa (so sánh roleLower lưu trong socket.data)
 * - Lưu ý: socket.data có thể chứa { role, roleLower, roomId }
 */
function findRoleInRoom(io: AnyServer, roomId: string, roleLower: string): boolean {
  const clients = getRoomClients(io, roomId);
  if (!clients) return false;
  for (const id of clients) {
    const s = io.sockets.sockets.get(id) as AnySocket | undefined;
    const stored = s?.data;
    const rLower =
      typeof stored?.roleLower === 'string'
        ? stored.roleLower
        : (typeof stored?.role === 'string' ? stored.role.toLowerCase() : undefined);
    if (rLower === roleLower) return true;
  }
  return false;
}

/* ---------- Init socket.io ---------- */

export function initSocket(server: http.Server) {
  const { Server: IOServer } = require('socket.io') as any;
  const io: AnyServer = new IOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
    allowEIO3: true
  });

  // Lưu tham chiếu global để debug / shutdown gọn
  (globalThis as any).__socket_io__ = io;

  io.on('connection', (socket: AnySocket) => {
    console.log('[socket] connected', socket.id);

    /* --- Xử lý join-room (caller: client -> server, callee: server -> client) --- */
    const handleJoin = (payload: any) => {
      const roomId = extractRoomId(payload);
      const role = payload?.role;
      const roleLower = typeof role === 'string' ? role.toLowerCase() : '';

      if (!roomId) {
        // Trả về cho client: tham gia thất bại do roomId không hợp lệ
        socket.emit('room-joined', { roomId: null, success: false, message: 'roomId không hợp lệ' });
        return;
      }

      // Quy tắc nghiệp vụ: chỉ cho phép 1 'ipad' (thiết bị camera) trong phòng
      if (roleLower === 'ipad' && findRoleInRoom(io, roomId, 'ipad')) {
        socket.emit('room-joined', {
          roomId,
          success: false,
          message: 'Phòng đã có thiết bị camera (ipad), không thể join thêm.'
        });
        return;
      }

      // Thực hiện join và lưu role đã chuẩn hóa vào socket.data
      socket.join(roomId);
      socket.data = { ...(socket.data || {}), role, roleLower, roomId };

      console.log(`[socket] ${socket.id} joined room ${roomId} as ${roleLower || 'unknown'}`);
      socket.emit('room-joined', { roomId, success: true, message: 'Tham gia phòng thành công' });

      /**
       * Xử lý ordering:
       * - Trường hợp iPad (caller) join trước: đánh dấu publisher đang chờ bằng pendingOffers entry với sdp = null.
       *   Sau đó khi iPad gửi 'webrtc-offer', server sẽ cập nhật sdp vào pendingOffers.
       * - Khi PC (callee) join sau: nếu pendingOffers có sdp => deliver offer ngay cho PC.
       *   Nếu pendingOffers tồn tại nhưng sdp === null => notify PC rằng publisher đang chờ ('publisher-waiting').
       */
      if (roleLower === 'ipad') {
        if (!pendingOffers.has(roomId)) {
          try {
            pendingOffers.set(roomId, { from: socket.id, sdp: null });
            console.log(`[socket] publisher (ipad) joined and waiting for PC in room ${roomId}`);
          } catch (e) {
            /* ignore */
          }
        }
      }

      if (roleLower === 'pc' && pendingOffers.has(roomId)) {
        const pending = pendingOffers.get(roomId);
        if (pending && pending.sdp) {
          // pending có offer sẵn -> relay tới PC ngay
          io.to(socket.id).emit('webrtc-get-offer', pending);
          console.log(`[socket] delivered pending offer for room ${roomId} -> ${socket.id}`);
        } else if (pending) {
          // pending tồn tại nhưng chưa có sdp -> publisher đã join nhưng chưa gửi offer
          io.to(socket.id).emit('publisher-waiting', { from: pending.from });
          console.log(`[socket] publisher waiting in room ${roomId}; notified PC ${socket.id}`);
        }
      }
    };

    // Hỗ trợ các alias event join-room
    socket.on('join-room', handleJoin);
    socket.on('join-room-role', handleJoin);
    socket.on('join-counter-role', handleJoin);

    /* --- Control events (caller -> server -> callee) --- */

    /**
     * trigger-capture
     * - caller: PC (gửi yêu cầu chụp ảnh)
     * - callee: iPad (nhận req-take-photo)
     * - payload: roomId (string) hoặc { roomId, ... }
     */
    socket.on('trigger-capture', (payload: any, ack?: Function) => {
      const roomId = extractRoomId(payload);
      if (!roomId) { safeAck(ack, { success: false, message: 'roomId không hợp lệ' }); return; }
      socket.to(roomId).emit('req-take-photo');
      console.log(`[socket] ${socket.id} -> trigger-capture ${roomId}`);
      safeAck(ack, { success: true });
    });

    /**
     * send-photo
     * - caller: iPad (gửi ảnh base64/dataURL)
     * - callee: PC (nhận res-photo-received)
     * - payload: { roomId, imageData, meta? }
     */
    socket.on('send-photo', (data: any, ack?: Function) => {
      const roomId = extractRoomId(data);
      if (!data || !roomId) { safeAck(ack, { success: false, message: 'payload không hợp lệ' }); return; }
      socket.to(roomId).emit('res-photo-received', { imageData: data.imageData, meta: data.meta || {} });
      console.log(`[socket] ${socket.id} -> send-photo to ${roomId}`);
      safeAck(ack, { success: true });
    });

    /**
     * close-camera
     * - caller: PC (yêu cầu đóng camera)
     * - callee: iPad (nhận event 'close-camera' và dừng publish)
     * - payload: roomId
     */
    socket.on('close-camera', (payload: any, ack?: Function) => {
      const roomId = extractRoomId(payload);
      if (!roomId) { safeAck(ack, { success: false, message: 'roomId không hợp lệ' }); return; }
      socket.to(roomId).emit('close-camera');
      console.log(`[socket] ${socket.id} -> close-camera ${roomId}`);
      safeAck(ack, { success: true });
    });

    /**
     * trigger-start-camera
     * - caller: PC (gửi yêu cầu bật camera)
     * - callee: iPad (nhận event 'trigger-start-camera')
     * - payload: roomId (string) hoặc { roomId, ... }
     */
    socket.on('trigger-start-camera', (payload: any, ack?: Function) => {
      const roomId = extractRoomId(payload);
      if (!roomId) { safeAck(ack, { success: false, message: 'roomId không hợp lệ' }); return; }
      socket.to(roomId).emit('trigger-start-camera');
      console.log(`[socket] ${socket.id} -> trigger-start-camera ${roomId}`);
      safeAck(ack, { success: true });
    });

    /**
     * trigger-stop-camera
     * - caller: PC (gửi yêu cầu tắt camera)
     * - callee: iPad (nhận event 'trigger-stop-camera')
     * - payload: roomId (string) hoặc { roomId, ... }
     */
    socket.on('trigger-stop-camera', (payload: any, ack?: Function) => {
      const roomId = extractRoomId(payload);
      if (!roomId) { safeAck(ack, { success: false, message: 'roomId không hợp lệ' }); return; }
      socket.to(roomId).emit('trigger-stop-camera');
      console.log(`[socket] ${socket.id} -> trigger-stop-camera ${roomId}`);
      safeAck(ack, { success: true });
    });

    /* --- WebRTC signaling (relay only) --- */

    /**
     * webrtc-offer
     * - caller -> server: iPad gửi offer (SDP) tới server
     * - server: lưu pendingOffers[roomId] = { from: socket.id, sdp } (nếu PC chưa join sẽ deliver sau)
     * - server -> callee: phát event 'webrtc-offer' tới các client khác trong room (thường là PC)
     * - payload: { roomId, sdp }
     */
    socket.on('webrtc-offer', (data: { roomId?: string; counterId?: string; sdp: any }) => {
      const roomId = extractRoomId(data);
      if (!data || !roomId) return;

      // Lưu hoặc cập nhật pending offer (trường hợp iPad join trước hoặc gửi lại offer)
      try {
        pendingOffers.set(roomId, { from: socket.id, sdp: data.sdp });
        // Log tóm tắt SDP để debug (không log toàn bộ để tránh spam)
        try {
          const sdpSummary = typeof data.sdp === 'string' ? (`string len=${data.sdp.length}`) : (data.sdp && data.sdp.sdp ? (`type=${data.sdp.type || 'unknown'} len=${String(data.sdp.sdp).length}`) : 'sdp=<unknown>');
          console.log(`[socket] saved pending offer for ${roomId} from ${socket.id} (${sdpSummary})`);
        } catch (_) {
          console.log(`[socket] saved pending offer for ${roomId} from ${socket.id}`);
        }
      } catch (e) {
        console.warn('[socket] pendingOffers.set failed', e);
      }

      // Relay offer tới room (trừ sender)
      socket.to(roomId).emit('webrtc-get-offer', { from: socket.id, sdp: data.sdp });
      console.log(`[socket] ${socket.id} -> webrtc-get-offer to room ${roomId}`);
    });

    /**
     * webrtc-answer
     * - caller -> server: PC gửi answer cho offer đã nhận
     * - server: relay answer tới toSocketId nếu có, hoặc broadcast trong room
     * - server: xóa pendingOffers[roomId] để tránh gửi lại offer cũ
     * - payload: { roomId, sdp, toSocketId? }
     */
    socket.on('webrtc-answer', (data: { roomId?: string; counterId?: string; sdp: any; toSocketId?: string }) => {
      const roomId = extractRoomId(data);
      if (!data || !roomId) return;

      // Khi đã có answer => xóa pending offer để tránh deliver lại
     // try { pendingOffers.delete(roomId); } catch (e) { /* ignore */ }

      if (data.toSocketId && typeof data.toSocketId === 'string') {
        io.to(data.toSocketId).emit('webrtc-get-answer', { from: socket.id, sdp: data.sdp });
        console.log(`[socket] ${socket.id} -> webrtc-get-answer to ${data.toSocketId}`);
      } else {
        socket.to(roomId).emit('webrtc-get-answer', { from: socket.id, sdp: data.sdp });
        console.log(`[socket] ${socket.id} -> webrtc-get-answer to room ${roomId}`);
      }
    });

    /**
     * webrtc-candidate
     * - caller -> server: client gửi ICE candidate
     * - server: relay candidate tới toSocketId nếu có, hoặc broadcast trong room
     * - payload: { roomId, candidate, toSocketId? }
     */
    socket.on('webrtc-candidate', (data: { roomId?: string; candidate: any; toSocketId?: string }) => {
      const roomId = extractRoomId(data);
      if (!data || !roomId) return;

      // Log tóm tắt candidate để debug (không log toàn bộ nội dung)
      try {
        const cand = data.candidate;
        let candSummary = '<empty>';
        if (!cand) candSummary = '<null>';
        else if (typeof cand === 'string') candSummary = `string len=${cand.length} preview=${cand.slice(0,120)}`;
        else if (cand && typeof cand === 'object') {
          candSummary = cand.candidate ? (`candidate len=${String(cand.candidate).length} preview=${String(cand.candidate).slice(0,120)}`) : JSON.stringify(cand).slice(0,120);
        } else {
          candSummary = String(cand).slice(0,120);
        }
        console.log(`[socket] webrtc-get-candidate received from ${socket.id} for room ${roomId}: ${candSummary}`);
      } catch (e) {
        console.log('[socket] webrtc-get-candidate summary log failed', e);
      }

      if (data.toSocketId && typeof data.toSocketId === 'string') {
        io.to(data.toSocketId).emit('webrtc-get-candidate', { from: socket.id, candidate: data.candidate });
        console.log(`[socket] ${socket.id} -> webrtc-get-candidate to ${data.toSocketId}`);
      } else {
        socket.to(roomId).emit('webrtc-get-candidate', { from: socket.id, candidate: data.candidate });
        console.log(`[socket] ${socket.id} -> webrtc-get-candidate to room ${roomId}`);
      }
    });

    /* --- Disconnect --- */

    /**
     * disconnect
     * - Khi client rời: broadcast 'peer-disconnected' cho các client còn lại trong room
     * - Caller: client rời -> server xử lý -> callee nhận thông báo
     */
    socket.on('disconnect', (reason: string) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
      try {
        const roomId = socket.data?.roomId;
        if (roomId) socket.to(roomId).emit('peer-disconnected', { socketId: socket.id });
      } catch (e) {
        /* ignore */
      }
    });
  });

  return io;
}
