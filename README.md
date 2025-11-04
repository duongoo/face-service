# Face Recognition API Service

Face Recognition API Service là một backend REST API cho quản lý khách hàng và check‑in bằng nhận diện khuôn mặt, xây dựng bằng Fastify + TypeScript. Tài liệu này tập trung vào việc dễ đọc, dễ bảo trì và cung cấp hướng dẫn triển khai, vận hành, và mở rộng.

## Tóm tắt
Mục tiêu: cung cấp API nhẹ, nhanh, dễ tích hợp để đăng ký khách hàng bằng ảnh khuôn mặt và thực hiện check‑in tự động bằng nhận diện khuôn mặt.

Điểm nổi bật:
- Fastify + TypeScript (hiệu năng cao, type‑safe)
- In‑memory cache để giảm tải DB
- MS SQL Server làm datastore
- Face recognition (face-api.js models) — hỗ trợ TinyFaceDetector

---

## Tính năng chính
- Đăng ký khách hàng (kèm ảnh)
- Check‑in bằng ảnh khuôn mặt (thời gian ~150–250ms)
- Lấy danh sách khách hàng
- Thống kê cache / trạng thái ứng dụng
- Scripts hỗ trợ: tải models, seed dữ liệu

---

## Kiến trúc & Thành phần chính

```text
📦 face-services/
├── 📁 src/                # Source code chính
│   ├── 📁 @types/         # TypeScript declarations mở rộng
│   ├── 📁 routes/         # Định nghĩa API routes
│   ├── 📁 services/       # Business logic (face, db, cache)
│   ├── 📁 schemas/        # Validation schemas
│   ├── app.ts            # Fastify app setup
│   ├── server.ts         # Entrypoint khởi động server
│   ├── config.ts         # Đọc cấu hình từ .env
│   └── types.ts          # Định nghĩa types chung
├── 📁 scripts/            # Script tiện ích (setup, seed)
│   ├── setup-models.js   # Tải model nhận diện khuôn mặt
│   └── seed-customers.js # Sinh dữ liệu mẫu
├── 📁 models/             # Lưu trữ models của face‑api.js
├── 📁 storage/            # Lưu runtime data (avatars, uploads) — gitignored
├── 📁 memory-bank/        # Tài liệu dự án (nếu có)
├── .env.example          # Mẫu biến môi trường
├── package.json          # Quản lý dependency & scripts
├── tsconfig.json         # Cấu hình TypeScript
└── README.md             # Tài liệu dự án
```

Luồng chính:

Luồng chính:
1. Khi khởi động, ứng dụng nạp danh sách khách hàng vào cache (tối ưu truy vấn DB).
2. Endpoint `POST /register` xử lý upload ảnh, crop & trích descriptor, lưu descriptor vào DB.
3. Endpoint `POST /checkin` xử lý upload ảnh, trích descriptor, so khớp với descriptors trong cache → trả về kết quả tương tự nhất (confidence).

---

## Yêu cầu hệ thống
- Node.js >= 18
- MS SQL Server (phiên bản tương thích)
- RAM tối thiểu 512MB (khuyến nghị 1GB cho môi trường production)
- Port mặc định: `3000` (tùy chỉnh bằng biến môi trường)

---

## Cài đặt nhanh (local / dev)

1. Clone repo:
```bash
git clone <repo-url>
cd face-services
```

2. Cài dependencies:
```bash
npm install
```

3. Tạo file `.env` từ mẫu:
```bash
copy .env.example .env   # Windows
# hoặc
cp .env.example .env     # macOS / Linux
```
Sửa các biến trong `.env` (DB_USER, DB_PASSWORD, DB_SERVER, DB_DATABASE, v.v.)

4. Tải models face‑api (bắt buộc trước khi test register/checkin):
```bash
node scripts/setup-models.js
```

5. (Tùy chọn) Seed dữ liệu mẫu:
```bash
node scripts/seed-customers.js
```

6. Chạy dev:
```bash
npm run dev
```

Build & chạy production:
```bash
npm run build
npm start
```

---

## Biến môi trường (tóm tắt từ `.env.example`)
- `PORT` — port server (mặc định 3000)
- `CORS_ORIGIN` — nguồn cho CORS
- `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_DATABASE` — cấu hình MS SQL Server
- `FACE_MATCH_THRESHOLD` — ngưỡng khớp mặt (0..1)
- `FACE_DETECTOR_INPUT_SIZE` — kích thước input cho detector
- `FACE_DETECTOR_SCORE_THRESHOLD` — ngưỡng score detector
- `CACHE_TTL` — TTL cache (ms)

Lưu ý: nếu mật khẩu DB chứa ký tự đặc biệt, bọc trong dấu ngoặc kép.

---

## Database — cấu trúc mẫu
Ví dụ tạo bảng `Customers`:
```sql
CREATE TABLE Customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  descriptor NVARCHAR(MAX),
  created_at DATETIME DEFAULT GETDATE()
);

CREATE INDEX idx_customer_name ON Customers(name);
```
- `descriptor` lưu vector nhận dạng (serialize dạng JSON/string).

---

## API (tóm tắt)
1. Health
- GET `/`
- Response:
```json
{ "status": "ok", "message": "Face Recognition API - Ready ✓", "timestamp": "..." }
```

2. Register
- POST `/register`
- Content-Type: `multipart/form-data`
- Fields:
  - `name`: string
  - `imageFile`: file
- Mô tả: lưu thông tin customer + descriptor vào DB, cập nhật cache.

3. Check‑in
- POST `/checkin`
- Content-Type: `multipart/form-data`
- Fields:
  - `imageFile`: file
- Response: customer tìm được + confidence score

4. Get customers
- GET `/customers`
- Trả về danh sách khách hàng (từ cache)

5. Cache stats
- GET `/cache-stats`
- Trả về thông tin cache (số lượng, TTL, last update)

6. Làm mới cache khách hàng thủ công
- POST `/customers/refresh-cache`
- Mô tả: gọi endpoint này để cập nhật lại cache khách hàng từ database (không cần restart server). Nên gọi sau khi thêm/xóa/sửa khách hàng từ hệ thống khác hoặc khi muốn đồng bộ dữ liệu mới nhất vào cache.

Ghi chú: chi tiết schema request/response nằm trong `src/schemas/` — luôn cập nhật khi sửa API.

---

## Scripts hữu ích
- `npm run dev` — chạy dev with hot reload
- `npm run build` — build TypeScript → JavaScript
- `npm start` — chạy production build
- `npm run clean` — xóa `dist/`
- `node scripts/setup-models.js` — tải face‑api models
- `node scripts/seed-customers.js` — tạo dữ liệu mẫu (dev/testing)

---

## Vận hành & Bảo trì (Best practices)
- Models: nếu thay đổi model, chạy lại `scripts/setup-models.js` và restart service.
- Cache: cache làm giảm số query đến DB; nếu thấy dữ liệu không đồng bộ, hãy gọi API `POST /customers/refresh-cache` để làm mới cache ngay lập tức (không cần restart server).
- DB: thực hiện backup định kỳ; khi thay đổi schema, tạo migration và chạy trên môi trường staging trước khi deploy.
- Tuning:
  - Điều chỉnh `FACE_MATCH_THRESHOLD` để cân bằng false positive/negative.
  - Điều chỉnh `FACE_DETECTOR_INPUT_SIZE` để trade‑off giữa tốc độ & độ chính xác.
- Giám sát: log request errors, latency; cấu hình health check cho orchestrator (k8s / Windows service).

---

## Troubleshooting nhanh
- "Models not loaded": kiểm tra thư mục `models/`, chạy `node scripts/setup-models.js`.
- "Database connection failed": kiểm tra `.env`, mạng tới `DB_SERVER`, credentials, firewall và SQL Server listening port.
- Lỗi TypeScript: `npm run build` → đọc lỗi compiler, sửa types hoặc cấu hình tsconfig.

---

## Hướng dẫn phát triển & đóng góp
- Coding style: TypeScript, prefer `async/await`, tách logic vào `services/`, validation bằng `schemas/`.
- Tạo PR nhỏ, kèm test/manual steps để review.
- Khi thêm endpoint:
  1. Thêm schema trong `src/schemas/` nếu cần validation.
  2. Tạo route trong `src/routes/`.
  3. Nếu cần logic phức tạp, thêm service trong `src/services/`.
  4. Cập nhật README (API docs) & tests.

---

## Kiểm thử
Hiện chưa có test suite tự động trong repo — khuyến nghị bổ sung:
- Unit tests: jest / vitest cho services
- Integration tests: supertest để test các route Fastify
Ví dụ test manual (curl):
```bash
# Health
curl http://localhost:3000/

# Register
curl -X POST http://localhost:3000/register \
  -F "name=Test User" \
  -F "imageFile=@/path/to/image.jpg"

# Check-in
curl -X POST http://localhost:3000/checkin \
  -F "imageFile=@/path/to/image.jpg"
```

---

## Roadmap & đề xuất cải tiến
- Thêm unit/integration tests và CI pipeline (GitHub Actions).
- Thêm migration tool (e.g., `migrate` hoặc `knex` migrations) cho DB schema.
- Thêm monitoring & metrics (Prometheus / Grafana).
- Hỗ trợ storage cho descriptors (blob storage) nếu lượng data lớn.
- Tối ưu memory usage và connection pooling cấu hình theo môi trường.

---

## Hướng dẫn commit
### Quy tắc commit chuẩn cho dự án

#### Conventional Commit types (bắt buộc dùng):

- **feat:** (Feature) Thêm một tính năng mới.
- **fix:** (Bug fix) Sửa một lỗi.
- **docs:** (Documentation) Chỉ thay đổi về tài liệu (document, comment code).
- **style:** Thay đổi về định dạng code (linting, bỏ dấu chấm phẩy, thụt lề) - không ảnh hưởng đến logic.
- **refactor:** Tái cấu trúc (refactor) code, không thêm tính năng mới hay sửa lỗi.
- **test:** Thêm hoặc sửa test case.
- **chore:** Các công việc "lặt vặt" không liên quan đến code (build scripts, cập nhật dependencies, config file).
- **perf:** (Performance) Cải thiện hiệu suất.

1. **Luôn commit nhỏ, rõ ràng, tập trung 1 mục đích**
   - Mỗi commit chỉ nên giải quyết 1 vấn đề (bug, feature, refactor, doc...)
   - Tránh commit dồn nhiều thay đổi không liên quan

2. **Đặt message ngắn gọn, mô tả đúng bản chất thay đổi**
   - Dùng tiếng Việt không dấu hoặc tiếng Anh, nhất quán trong repo
   - Không dùng các từ chung chung kiểu "update", "fix bug" mà phải rõ: `fix: xử lý lỗi không nhận diện khuôn mặt`, `feat: thêm API /customers`, `refactor: tách logic cache ra service riêng`

3. **Cấu trúc message**
   - Theo chuẩn [Conventional Commits](https://www.conventionalcommits.org/):
     ```
     <type>(scope?): <short summary>
     
     [body - optional]
     [footer - optional]
     ```
   - Ví dụ:
     - `feat(api): thêm endpoint check-in bằng khuôn mặt`
     - `fix(db): sửa lỗi lưu descriptor dạng JSON`
     - `docs(readme): bổ sung hướng dẫn seed dữ liệu`
     - `style: chuẩn hóa indent toàn bộ project`
     - `refactor(face): tách logic detect ra service riêng`
     - `test: thêm test cho service cache`
     - `chore: update dependencies, bump version package`
     - `perf(face): tăng tốc so khớp descriptor`

4. **Commit body (nếu cần)**
   - Giải thích lý do, ảnh hưởng, hướng dẫn test nếu là thay đổi lớn
   - Có thể liệt kê các file chính bị ảnh hưởng

5. **Không commit file thừa, file tạm, secrets**
   - Đảm bảo `.env`, file data cá nhân, node_modules, dist... đã nằm trong `.gitignore`

6. **Kiểm tra lại code trước khi commit**
   - Chạy linter, build thử, test thủ công endpoint chính
   - Đảm bảo không có lỗi syntax, không push code đang dở

7. **Squash commit khi merge PR**
   - Nếu merge nhiều commit nhỏ, nên squash để giữ lịch sử gọn gàng

### Mẫu commit message tốt

```
feat(customer): thêm API đăng ký khách hàng mới

- Xử lý upload ảnh, trích xuất descriptor
- Lưu vào DB, cập nhật cache
- Viết schema validate cho request
```

```
fix(face): sửa lỗi không detect được khuôn mặt khi ảnh quá nhỏ

Nguyên nhân do inputSize cấu hình thấp, đã tăng lên 256.
```

```
docs(readme): bổ sung hướng dẫn commit chuẩn
```

```
style: chuẩn hóa indent toàn bộ project
```

```
refactor(face): tách logic detect ra service riêng
```

```
test: thêm test cho service cache
```

```
chore: update dependencies, bump version package
```

```
perf(face): tăng tốc so khớp descriptor
```

### Lưu ý
- Nếu commit liên quan đến bảo mật, migration DB, hoặc breaking change, phải ghi rõ trong message/body.
- Luôn review lại diff trước khi push.


## License
MIT


## Tác giả & Liên hệ
Dự án được phát triển và duy trì bởi **Phước Dưỡng IT**  
Email: [phuocduong.it@gmail.com](mailto:phuocduong.it@gmail.com)

Vui lòng liên hệ qua email để trao đổi, góp ý hoặc hợp tác phát triển dự án.
