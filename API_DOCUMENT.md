# Tài liệu API (Tiếng Việt) — Face Recognition API

Host mặc định: `http://localhost:3000`  
Swagger UI: `http://localhost:3000/docs`

--- 

## Tổng quan endpoints
- POST `/register` — Đăng ký patient bằng ảnh (multipart/form-data) -> Lưu DB + cập nhật cache  
- POST `/register/detection` — Đăng ký bằng descriptor (multipart/form-data) -> Lưu DB + cập nhật cache  
- GET `/patients` — Lấy danh sách patient từ cache  
- POST `/patients/refresh-cache` — Làm mới cache từ DB  
- POST `/patients/add-to-cache` — Thêm/cập nhật patient chỉ trong cache (JSON hoặc form-urlencoded)  
- POST `/checkin` — Check-in bằng ảnh (multipart/form-data)  
- POST `/checkin/detection` — Check-in bằng descriptor (multipart/form-data)  
- GET `/` — Health check  
- GET `/cache-stats` — Thống kê cache

---

## Kiểu dữ liệu chính (types)
- Patient
  - PatientId: string (bắt buộc) — mã định danh duy nhất
  - PatientName: string — tên khách hàng
  - Descriptor: number[] | number[][] — mảng descriptor (một hoặc nhiều descriptor)
  - SortOrder?: number — thứ tự (tuỳ chọn)

- Descriptor: mảng số (float) biểu diễn embedding khuôn mặt (Float32)

---

## Chi tiết endpoint

### 1) POST /register
- Mục đích: Đăng ký patient bằng ảnh. Server detect khuôn mặt -> sinh descriptor -> lưu vào DB -> update cache.
- Content-Type: `multipart/form-data`
- Trường (form-data):
  - `file` (file) — ảnh (bắt buộc)
  - `name` (string) — tên khách hàng (bắt buộc)
  - `PatientId` (string) — mã ID (bắt buộc)
- Response 201:
```json
{ "message": "Đăng ký thành công cho \"Nguyen Van A\" ✓", "patient": "Nguyen Van A" }
```
- Lỗi: 400 nếu thiếu file/name/PatientId hoặc không detect được khuôn mặt; 500 lỗi server.

---

### 2) POST /register/detection
- Mục đích: Đăng ký bằng descriptor do client gửi (binary Float32).
- Content-Type: `multipart/form-data`
- Trường (form-data):
  - `descriptor` (file) — file nhị phân Float32Array (bắt buộc)
  - `name` (string) — tên (bắt buộc)
  - `PatientId` (string) — mã ID (bắt buộc)
- Response 201: giống `/register`

---

### 3) GET /patients
- Mục đích: Lấy danh sách patient trong cache
- Response 200:
```json
{
  "patients": [
    {
      "PatientId": "P123",
      "PatientName": "Nguyen Van A",
      "Descriptor": [[0.1, 0.2, ...]]
    }
  ],
  "total": 1
}
```

---

### 4) POST /patients/refresh-cache
- Mục đích: Buộc làm mới cache từ database
- Content-Type: `application/json` (no body required)
- Response 200:
```json
{ "message": "Đã làm mới cache khách hàng thành công" }
```

---

### 5) POST /patients/add-to-cache
- Mục đích: Thêm hoặc cập nhật patient CHỈ trong cache (không ghi DB).
- Hỗ trợ Content-Type:
  - `application/json` (khuyến nghị) — gửi object JSON
  - `application/x-www-form-urlencoded` — gửi form-urlencoded
- Body (JSON) mẫu / Schema:
  - PatientId (string) — bắt buộc
  - PatientName (string) — tuỳ chọn
  - Descriptor (array of number) — tuỳ chọn (mảng float)
- Ví dụ JSON:
```bash
curl -X POST http://localhost:3000/patients/add-to-cache \
  -H "Content-Type: application/json" \
  -d '{
    "PatientId":"P123",
    "PatientName":"Nguyễn Văn A",
    "Descriptor":[0.12, 0.34, 0.56, ...]
  }'
```
- Ví dụ form-urlencoded:
```bash
curl -X POST http://localhost:3000/patients/add-to-cache \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "PatientId=P123&PatientName=Nguyen+Van+A"
```
- Response 200:
```json
{ "message": "Đã thêm/cập nhật Patient vào cache thành công" }
```
- Lưu ý:
  - Endpoint này KHÔNG xử lý `multipart/form-data` (nếu cần upload descriptor nhị phân, dùng `/register/detection`).
  - Swagger UI sẽ hiển thị body schema cho endpoint này (đã bổ sung schema).

---

### 6) POST /checkin
- Mục đích: Check-in bằng ảnh. Server detect descriptor từ ảnh và so khớp với cache.
- Content-Type: `multipart/form-data`
- Field:
  - `file` (file) — ảnh (bắt buộc)
- Response 200 mẫu:
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
- Lỗi 400 khi không detect được khuôn mặt hoặc không có patient tương ứng.

---

### 7) POST /checkin/detection
- Mục đích: Check-in bằng descriptor do client gửi (binary Float32).
- Content-Type: `multipart/form-data`
- Field:
  - `descriptor` (file) — file nhị phân Float32Array
  - (optional) `confidence` (number) — ngưỡng confidence
- Response: giống `/checkin`.

---

### 8) GET / (health)
- Response 200:
```json
{ "status":"ok", "message":"API nhận dạng khuôn mặt - Sẵn sàng ✓", "timestamp":"..." }
```

### 9) GET /cache-stats
- Response 200:
```json
{
  "status":"ok",
  "cache": {
    "patientCount": 123,
    "lastUpdateSeconds": 60,
    "ttlSeconds": 300
  }
}
```

---

## Swagger / OpenAPI
- Đã bổ sung schema (tiếng Việt) cho hầu hết endpoint; Swagger UI hiển thị:
  - Mô tả endpoint (description)
  - Schema request body (nếu có)
  - Schema response mẫu
- Truy cập: `http://localhost:3000/documentation`

---

## Kiểm tra & Lưu ý khi test
- Nếu body undefined:
  - Với JSON: đảm bảo header `Content-Type: application/json`
  - Với form-urlencoded: `Content-Type: application/x-www-form-urlencoded`
  - Với multipart/uploads: dùng `-F` (curl) hoặc Postman form-data
- Descriptor nhị phân: gửi như file (multipart), server đọc Buffer -> Float32Array
- `/patients/add-to-cache` chỉ thao tác cache — không ghi DB

---

## Hành động tiếp theo (gợi ý)
- Nếu cần: bổ sung ví dụ response mẫu cho tất cả status code trong Swagger.  
- Nếu muốn `/patients/add-to-cache` hỗ trợ multipart file descriptor, mình sẽ sửa route để xử lý `request.file()`.
