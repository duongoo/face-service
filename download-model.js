const https = require('https' );
const fs = require('fs');
const path = require('path');

// Thư mục để lưu models
const modelsDir = path.resolve(__dirname, 'models');
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