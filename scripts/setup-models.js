/**
 * Tài liệu mô tả file setup-models.js
 *
 * Mục đích:
 *   - Script này dùng để tự động tải về các file model cần thiết cho face-api.js từ GitHub về thư mục lưu trữ cục bộ.
 *   - Đảm bảo các model luôn sẵn sàng để sử dụng cho dịch vụ nhận diện khuôn mặt.
 *
 * Luồng xử lý chính:
 *   1. Xác định thư mục lưu trữ models (../storage/models). Nếu chưa tồn tại thì tự động tạo mới.
 *   2. Khai báo danh sách các file model cần tải về (modelFiles).
 *   3. Định nghĩa hàm downloadFile để tải từng file model qua HTTPS.
 *   4. Định nghĩa hàm downloadModels:
 *      - Lặp qua từng file trong danh sách modelFiles.
 *      - Tải từng file về thư mục models.
 *      - Ghi log quá trình tải và xử lý lỗi nếu có.
 *   5. Thực thi hàm downloadModels để bắt đầu quá trình tải models.
 *
 * Lưu ý:
 *   - Script này chỉ cần chạy một lần khi setup dự án hoặc khi cần cập nhật models.
 *   - Các thông báo, tên biến, hàm đều sử dụng tiếng Việt để dễ bảo trì và phù hợp chuẩn dự án.
 */
const https = require('https' );
const fs = require('fs');
const path = require('path');
// Thư mục để lưu models (lên thư mục cha vì script nằm trong scripts/)
const modelsDir = path.resolve(__dirname, '..', 'storage', 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir);
}

// Danh sách các file model cần thiết
const modelFiles = [
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'ssd_mobilenetv1_model-weights_manifest.json', // Phát hiện khuôn mặt
  'face_landmark_68_model-shard1',
  'face_landmark_68_model-weights_manifest.json', // Mốc nhận diện khuôn mặt
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  'face_recognition_model-weights_manifest.json', // Nhận diện khuôn mặt - "Số Hóa" Khuôn Mặt (Face Recognition)
  'tiny_face_detector_model-shard1',
  'tiny_face_detector_model-weights_manifest.json' // Phát Hiện Khuôn Mặt (Phiên bản Tí Nị)
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function downloadModels() {
  console.log('Bắt đầu tải models...');
  for (const file of modelFiles) {
    const url = baseUrl + file;
    const dest = path.join(modelsDir, file);
    console.log(`Đang tải: ${file}`);
    try {
      await downloadFile(url, dest);
      console.log(` -> Tải xong: ${file}`);
    } catch (error) {
      console.error(`Lỗi khi tải ${file}:`, error.message);
    }
  }
  console.log('Tất cả models đã được tải xong! ✨');
}

downloadModels();
