# API Document — Face Recognition API

Tài liệu tóm tắt các endpoint chính của dịch vụ nhận dạng khuôn mặt (Fastify + TypeScript). Mọi ví dụ dùng host mặc định `http://localhost:3000`.

---

## Tổng quan endpoints
- POST `/register` — Đăng ký patient bằng ảnh (multipart/form-data)
- POST `/register/detection` — Đăng ký bằng descriptor (multipart/form-data)
- GET `/patients` — Lấy danh sách patient từ cache
- POST `/patients/refresh-cache` — Làm mới toàn bộ cache từ DB
- POST `/patients/add-to-cache` — Thêm/cập nhật patient trực tiếp vào cache (JSON hoặc form-urlencoded)
- POST `/checkin` — Check-in bằng ảnh (multipart/form-data)
- POST `/checkin/detection` — Check-in bằng descriptor (multipart/form-data)
- GET `/` — Health check
- GET `/cache-stats` — Thống kê cache

---

## Mô tả chi tiết

### 1) POST /register
Mục đích: Đăng ký patient mới bằng ảnh (server sẽ detect khuôn mặt, tính descriptor và lưu DB).

Request:
- Content-Type: multipart/form-data
- Fields:
  - `file` (file) — ảnh (field upload)
  - `name` (text) — tên patient
  - `PatientId` (text) — mã ID patient

Ví dụ curl:
```bash
curl -X POST http://localhost:3000/register \
  -F "file=@/path/to/photo.jpg" \
  -F "name=Nguyen Van A" \
  -F "PatientId=P123"
```

Response 201:
```json
{
  "message": "Đăng ký thành công cho \"Nguyen Van A\" ✓",
  "patient": "Nguyen Van A"
}
```

Lỗi thường gặp: 400 nếu thiếu file/name/PatientId hoặc không detect được khuôn mặt.

---

### 2) POST /register/detection
Mục đích: Đăng ký bằng descriptor được client tính sẵn (binary Float32Array gửi dưới dạng file).

Request:
- Content-Type: multipart/form-data
- Fields:
  - `descriptor` (file) — binary Float32Array
  - `name` (text)
  - `PatientId` (text)

Ví dụ curl:
```bash
curl -X POST http://localhost:3000/register/detection \
  -F "descriptor=@/path/to/descriptor.bin" \
  -F "name=Nguyen Van A" \
  -F "PatientId=P123"
```

Response 201: tương tự `/register`.

---

### 3) GET /patients
Mục đích: Lấy danh sách patient hiện trong cache.

Request: GET
Response:
```json
{
  "patients": [ /* array of patient objects */ ],
  "total": 123
}
```

---

### 4) POST /patients/refresh-cache
Mục đích: Buộc refresh cache từ database.

Request: POST
Response:
```json
{ "message": "Đã làm mới cache khách hàng thành công" }
```

---

### 5) POST /patients/add-to-cache
Mục đích: Thêm hoặc cập nhật patient trực tiếp vào cache (không ghi DB).

Hỗ trợ:
- JSON (recommended when sending structured data)
  - Header: `Content-Type: application/json`
  - Body: object Patient (ít nhất phải có `PatientId`)
- form-urlencoded (nếu client không gửi JSON)

Ví dụ (JSON):
```bash
curl -X POST http://localhost:3000/patients/add-to-cache \
  -H "Content-Type: application/json" \
  -d '{"PatientId":"P123","PatientName":"Nguyen Van A","Descriptor":[0.1,0.2, ...]}'
```

Ví dụ (form-urlencoded):
```bash
curl -X POST http://localhost:3000/patients/add-to-cache \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "PatientId=P123&PatientName=Nguyen Van A"
```

Response:
```json
{ "message": "Đã thêm/cập nhật Patient vào cache thành công" }
```

Lưu ý: Endpoint hiện chưa parse `multipart/form-data` cho body. Nếu cần gửi binary descriptor via form-data, dùng `/register/detection` hoặc thay đổi route để xử lý multipart.

---

### 6) POST /checkin
Mục đích: Check-in bằng ảnh (server detect và match với cache).

Request:
- Content-Type: multipart/form-data
- Field:
  - `file` (file) — ảnh để check-in

Ví dụ curl:
```bash
curl -X POST http://localhost:3000/checkin \
  -F "file=@/path/to/photo.jpg"
```

Response thành công:
```json
{
  "success": true,
  "patient": {
    "PatientName": "Nguyen Van A",
    "PatientId": "P123",
    "SortOrder": 1,
    "distance": 0.12,
    "confidence": 0.88
  },
  "message": "Check-in thành công! ✓"
}
```

Lỗi: 400 nếu không detect được khuôn mặt hoặc không có patient trong cache.

---

### 7) POST /checkin/detection
Mục đích: Check-in bằng descriptor gửi từ client (binary Float32 trong multipart).

Request:
- Content-Type: multipart/form-data
- Field:
  - `descriptor` (file) — binary Float32Array

Ví dụ curl:
```bash
curl -X POST http://localhost:3000/checkin/detection \
  -F "descriptor=@/path/to/descriptor.bin"
```

Response: tương tự `/checkin`.

---

### 8) GET /
Health check:
```json
{ "status": "ok", "message": "API nhận dạng khuôn mặt - Sẵn sàng ✓", "timestamp": "..." }
```

### 9) GET /cache-stats
Trả về thống kê cache:
```json
{
  "status": "ok",
  "cache": {
    "patientCount": 123,
    "lastUpdateSeconds": 60,
    "ttlSeconds": 300
  }
}
```

---

## Ghi chú kỹ thuật
- Các endpoint multipart sử dụng `@fastify/multipart`.
- Body JSON cần header `Content-Type: application/json`.
- Form-urlencoded được xử lý bởi `@fastify/formbody`.
- `/patients/add-to-cache` hiện hỗ trợ JSON và form-urlencoded. Nếu muốn hỗ trợ `multipart/form-data` cho descriptor, cần sửa route để dùng `request.file()`.

---

## Hướng dẫn test nhanh
- Chạy server: `npm run dev`
- Kiểm tra health: `curl http://localhost:3000/`
- Test check-in/register bằng `curl -F` như ví dụ ở trên.
