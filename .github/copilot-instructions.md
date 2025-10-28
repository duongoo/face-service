# Hướng dẫn cho AI agent trong repo này

Repo này là dịch vụ nhận diện khuôn mặt chạy Node.js (Express) dùng face-api.js trên CPU với node-canvas. Mục tiêu: đăng ký khuôn mặt và check-in so khớp với dữ liệu đã lưu trong SQL Server.

## Bức tranh tổng thể
- Kiến trúc: 1 service Express duy nhất (file `main.js`). Model nhận diện nạp cục bộ từ thư mục `models/` bằng `loadFromDisk` (không tải mạng lúc runtime).
- Lưu trữ: Bảng SQL Server `Customers(name NVARCHAR, descriptor NVARCHAR(MAX))`, trong đó `descriptor` là JSON array 128 số float (embedding).
- Ghép node-canvas vào face-api: `faceapi.env.monkeyPatch({ Canvas, Image, ImageData })` bắt buộc trước khi detect.
- Detector: dùng TinyFaceDetector với tham số khác nhau giữa server và seeder (server: `inputSize=512`; seeder: `416`). Nếu chỉnh, nhớ đồng bộ cả 2 bên kẻo lệch hành vi.

## API và luồng dữ liệu chính
- GET `/` → Health text.
- POST `/register` (multer memory): form-data gồm `imageFile` (file) và `customerName` (string).
	- Pipeline: `loadImage(buffer)` → `detectSingleFace(image, tinyOpts).withFaceLandmarks().withFaceDescriptor()` → `Array.from(descriptor)` → `INSERT INTO Customers` với `descriptor` stringify JSON.
- POST `/checkin` (multer memory): form-data `imageFile`.
	- Pipeline: đọc toàn bộ `Customers` → `JSON.parse(descriptor)` → bọc lại `new Float32Array(...)` → `new faceapi.LabeledFaceDescriptors(name, [float32])` → `new faceapi.FaceMatcher(list, 0.6).findBestMatch(queryDescriptor)`.
- GET `/customers`: debug xem nhanh dữ liệu đã lưu.
- CORS: chỉ cho `http://localhost:4200`; nếu thêm client mới nhớ cập nhật cấu hình trong `main.js`.

## Model và cấu hình
- `main.js` nạp: `tinyFaceDetector`, `ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet` từ `models/`. Hai model khác (age/gender, expressions) có comment sẵn nhưng không có weights.
- `facker.js` nạp: `tinyFaceDetector`, `faceLandmark68Net`, `faceRecognitionNet`.
- Thư mục ảnh seeder là `avatart/` (cố ý viết sai chính tả, đừng đổi nếu không refactor hết). Biến thể ảnh upload: 256×256 crop giữa.

## Truy cập DB (mssql)
- Server dùng helper ngắn gọn: `connectAndQuery(sql, params)` mở pool, chạy query, luôn đóng kết nối sau mỗi request (ổn cho tác vụ nhỏ).
- Seeder tái sử dụng 1 `mssql.ConnectionPool` cho hàng loạt thao tác (tối ưu nhiều bản ghi).
- Ghi: `JSON.stringify(number[])`. Đọc: `JSON.parse(...)` và khi so khớp phải chuyển sang `new Float32Array(parsed)`.

## Quy ước mã và giọng điệu
- Log/mesage chủ yếu tiếng Việt, giọng vui vẻ. Giữ nguyên phong cách và biến/tên đã dùng.
- Xử lý ảnh luôn từ buffer trong RAM (Multer `memoryStorage`) – không dùng file tạm.
- Port mặc định `3000`.

## Quy trình dev nhanh
- Cài deps 1 lần (không có npm scripts). Chạy server: `node main.js`. Seeder: `node facker.js [totalCustomers] [--reset]`.
- Điều kiện chạy: SQL Server theo `dbConfig.js` (đừng in lại secrets), bảng `Customers` đã tồn tại, thư mục `models/` có đủ weights.
- Debug nhanh: gọi `GET /customers` để xem DB; log server sẽ in tiến trình và kết quả match.

## Mẫu code quan trọng (áp dụng thống nhất)
- Lưu descriptor: `descriptor: Array.from(detection.descriptor)` → DB JSON.
- So khớp: `new faceapi.LabeledFaceDescriptors(name, [new Float32Array(parsedJson)])` + `new faceapi.FaceMatcher(..., 0.6)`.

Nếu mày thấy mục nào chưa rõ (ví dụ: format DB, tham số detector, CORS đa client), nói tau để bổ sung hoặc chỉnh sửa cho khớp thực tế triển khai.
