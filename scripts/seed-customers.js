/**
 * Seeder tạo dữ liệu khách hàng giả cho hệ thống nhận diện khuôn mặt.
 *
 * - Sử dụng API randomuser.me để lấy ảnh khuôn mặt ngẫu nhiên.
 * - Phát hiện khuôn mặt, trích xuất descriptor bằng face-api.js.
 * - Lưu descriptor và tên khách hàng vào bảng Customers (SQL Server).
 * - Lưu ảnh gốc đã tải về vào thư mục storage/avatars/downloaded.
 * - Hỗ trợ chế độ RESET để xoá dữ liệu cũ và tạo lại từ đầu.
 *
 * Luồng xử lý chính:
 * 1. Chuẩn bị môi trường (tạo thư mục, nạp models nhận diện khuôn mặt).
 * 2. Kết nối cơ sở dữ liệu.
 * 3. (Nếu bật RESET) Xoá dữ liệu cũ trong bảng Customers và thư mục ảnh.
 * 4. Lặp lại cho đến khi đủ số lượng khách hàng:
 *    - Tải ảnh khuôn mặt ngẫu nhiên.
 *    - Phát hiện và trích xuất descriptor khuôn mặt.
 *    - Lưu descriptor và tên vào database.
 *    - Lưu ảnh vào thư mục.
 *    - Nếu thất bại nhận diện nhiều lần liên tiếp thì dừng.
 * 5. Đóng kết nối và kết thúc.
 *
 * Các hàm chính:
 * - fetchJson, fetchBuffer: Tải dữ liệu JSON hoặc binary qua HTTPS.
 * - fetchFaceBuffer: Lấy ảnh khuôn mặt từ randomuser.me.
 * - computeDescriptor: Trích xuất descriptor khuôn mặt từ ảnh.
 * - storeCustomer: Lưu thông tin khách hàng vào database.
 * - createCustomer: Tạo một khách hàng giả (ảnh, descriptor, lưu DB).
 * - main: Hàm điều phối toàn bộ quá trình seed dữ liệu.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Canvas, Image, ImageData, loadImage, createCanvas } = require('canvas');
const faceapi = require('face-api.js');
const mssql = require('mssql');
const dbConfig = require('../dbConfig');

const MODELS_PATH = path.join(__dirname, '..', 'storage', 'models');
const AVATARS_ROOT = path.join(__dirname, '..', 'storage', 'avatars');
const DOWNLOAD_DIR = path.join(AVATARS_ROOT, 'downloaded');

const TOTAL_CUSTOMERS = Number(process.argv[2]) || 100;
const RESET_MODE = process.argv.includes('--reset');
const REQUEST_TIMEOUT_MS = 15000;

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.5
});

const firstNames = ['An', 'Binh', 'Chi', 'Dung', 'Giang', 'Hang', 'Khanh', 'Linh', 'Minh', 'Ngoc', 'Phuong', 'Quang', 'Son', 'Trang', 'Vy'];
const lastNames = ['Nguyen', 'Tran', 'Le', 'Pham', 'Huynh', 'Phan', 'Vu', 'Dang', 'Bui', 'Do', 'Hoang', 'Ngo', 'Duong'];

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (value, length) => value.toString().padStart(length, '0');

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        fetchJson(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
        return;
      }

      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout while requesting ${url}`));
    });
  });

const fetchBuffer = (url) =>
  new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timeout while downloading binary ${url}`));
    });
  });

const fetchFaceBuffer = async () => {
  const response = await fetchJson('https://randomuser.me/api/?inc=picture&noinfo=1');
  const result = response.results?.[0];
  if (!result?.picture) {
    throw new Error('RandomUser API chưa trả về ảnh hợp lệ.');
  }
  const preferredUrl = result.picture.large || result.picture.medium || result.picture.thumbnail;
  if (!preferredUrl) {
    throw new Error('Không tìm thấy URL ảnh trong phản hồi RandomUser.');
  }
  return fetchBuffer(preferredUrl);
};

const createUploadVariant = (image) => {
  const cropSize = Math.min(image.width, image.height);
  const targetSize = 256;
  const canvas = createCanvas(targetSize, targetSize);
  const ctx = canvas.getContext('2d');

  const offsetX = (image.width - cropSize) / 2;
  const offsetY = (image.height - cropSize) / 2;

  ctx.drawImage(image, offsetX, offsetY, cropSize, cropSize, 0, 0, targetSize, targetSize);
  return canvas.toBuffer('image/jpeg', { quality: 0.9, progressive: true });
};

const computeDescriptor = async (image) => {
  const detection = await faceapi
    .detectSingleFace(image, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return null;
  }

  return Array.from(detection.descriptor);
};

const storeCustomer = async (pool, name, descriptor) => {
  const descriptorJson = JSON.stringify(descriptor);

  await pool
    .request()
    .input('name', name)
    .query('DELETE FROM Customers WHERE name = @name');

  await pool
    .request()
    .input('name', name)
    .input('descriptor', descriptorJson)
    .query('INSERT INTO Customers (name, descriptor) VALUES (@name, @descriptor)');
};

const createCustomer = async (pool, index) => {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const faceBuffer = await fetchFaceBuffer();
      const image = await loadImage(faceBuffer);
      const descriptor = await computeDescriptor(image);

      if (!descriptor) {
        console.warn(`[${index}] Không nhận diện được khuôn mặt. Thử lại (${attempt}/${maxAttempts})`);
        continue;
      }
      let lastName = pickRandom(lastNames);
      let firstName = pickRandom(firstNames);
  const baseName = `customer_${lastName}_${firstName}_${pad(index, 6)}`;
  const downloadPath = path.join(DOWNLOAD_DIR, `${baseName}_download.jpg`);

  fs.writeFileSync(downloadPath, faceBuffer);

  const fullName = `${lastName} ${firstName} #${pad(index, 6)}`;
  await storeCustomer(pool, fullName, descriptor);
  console.log(`[${index}] Tạo khách hàng thành công: ${fullName}`);
  return { name: fullName, downloadPath };
    } catch (error) {
      console.error(`[${index}] Lỗi tải hoặc xử lý ảnh: ${error.message}`);
    }
  }

  console.warn(`[${index}] Bỏ qua vì tạo thất bại nhiều lần.`);
  return null;
};

const loadModels = async () => {
  console.log('Đang nạp models nhận diện khuôn mặt...');
  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
  console.log('Đã nạp models thành công.');
};

const prepareEnvironment = () => {
  if (RESET_MODE && fs.existsSync(AVATARS_ROOT)) {
    fs.rmSync(AVATARS_ROOT, { recursive: true, force: true });
  }
  ensureDir(AVATARS_ROOT);
  ensureDir(DOWNLOAD_DIR);
};

const main = async () => {
  console.log('=== DeepFace Facker ===');
  console.log(`Số lượng khách hàng cần tạo: ${TOTAL_CUSTOMERS}`);
  if (RESET_MODE) {
    console.log('Chế độ RESET bật: xoá dữ liệu cũ trước khi tạo mới.');
  }

  console.time('seed-face-customers');
  prepareEnvironment();
  await loadModels();

  let pool;
  try {
    pool = await mssql.connect(dbConfig);
    if (RESET_MODE) {
      console.log('Đang xoá dữ liệu cũ trong bảng Customers...');
      await pool.request().query('DELETE FROM Customers');
    }

    const logInterval = Math.max(1, Math.floor(TOTAL_CUSTOMERS / 10));
    let completed = 0;
    let consecutiveFailures = 0;

    while (completed < TOTAL_CUSTOMERS) {
      const result = await createCustomer(pool, completed + 1);
      if (result) {
        completed += 1;
        consecutiveFailures = 0;

        if (completed % logInterval === 0 || completed === TOTAL_CUSTOMERS) {
          console.log(`Đã tạo ${completed}/${TOTAL_CUSTOMERS} khách hàng (mới nhất: ${result.name})`);
        }
      } else {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 10) {
          throw new Error('Không thể tạo đủ dữ liệu giả vì thất bại nhận diện lặp lại.');
        }
      }
    }

    console.log(`Đã hoàn tất tạo ${completed} khách hàng. Dữ liệu đã lưu vào bảng Customers và thư mục ${AVATARS_ROOT}.`);
  } finally {
    if (pool) {
      await pool.close();
    }
    mssql.close();
    console.timeEnd('seed-face-customers');
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Seeder thất bại:', error);
    process.exit(1);
  });
}

module.exports = {
  main
};
