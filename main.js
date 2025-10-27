const express = require('express');
const cors = require('cors');
const path = require('path');
const { Canvas, Image, ImageData, loadImage } = require('canvas');
const faceapi = require('face-api.js');

const multer = require('multer');

const fs = require('fs'); // Thêm module 'fs' để làm việc với file
const DB_PATH = path.join(__dirname, 'database.json');

// --- Cấu hình Multer để lưu file upload vào bộ nhớ ---
const storage = multer.memoryStorage(); // Lưu file dạng buffer trong RAM
const upload = multer({ storage: storage });

// --- DATABASE GIẢ LẬP ---
// --- HÀM ĐỂ ĐỌC VÀ GHI DATABASE ---
function readDatabase() {
  try {
    const data = fs.readFileSync(DB_PATH);
    return JSON.parse(data);
  } catch (error) {
    // Nếu file không tồn tại hoặc lỗi, trả về mảng rỗng
    return [];
  }
}

const tinyFaceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 512, // Kích thước ảnh đầu vào, thử các giá trị 128, 224, 320, 416, 512, 608
  scoreThreshold: 0.5 // Ngưỡng tin cậy để coi là một khuôn mặt
});

function writeDatabase(data) {
  // Tham số thứ 3 (null, 2) là để format file JSON cho đẹp, dễ đọc
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Báo cho face-api.js biết cách làm việc với môi trường Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
const port = 3000;

// Đường dẫn tới thư mục chứa models
const MODELS_PATH = path.join(__dirname, 'models');

// Hàm để nạp models, nên gọi khi server bắt đầu khởi động
async function loadModels() {
  console.log("Đang nạp model...");
  try {
    // Dùng loadFromDisk để nạp model từ file cục bộ
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH); // nhẹ hơn

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

    // --- THÊM 2 DÒNG NÀY VÀO ---
    // await faceapi.nets.ageGenderNet.loadFromDisk(MODELS_PATH);
    // await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);
    // --- XONG ---
    console.log("Nạp model thành công! Sẵn sàng chiến đấu. 🔥");
  } catch (error) {
    console.error("Lỗi chết người khi nạp model:", error);
    process.exit(1); // Thoát ứng dụng nếu không nạp được model
  }
}

// Gọi hàm nạp model và sau đó khởi động server
loadModels().then(() => {
  app.listen(port, () => {
    console.log(`Server đang chạy tít ở http://localhost:${port}`);
  });
});

// Từ đây mày có thể viết các API /register, /checkin...
app.get('/', (req, res) => {
  res.send('API nhận diện khuôn mặt đã sẵn sàng!');
});


/**
 * API ĐĂNG KÝ KHÁCH HÀNG MỚI
 * Method: POST
 * URL: /register
 * Body: multipart/form-data
 * Fields:
 * - imageFile: File ảnh của khách hàng (bắt buộc)
 * - customerName: Tên khách hàng (bắt buộc)
 */
app.post('/register', upload.single('imageFile'), async (req, res) => {
  console.log("Có yêu cầu đăng ký mới...");

  try {
    // Lấy thông tin từ request
    const { customerName } = req.body;
    const imageBuffer = req.file.buffer; // Lấy buffer của ảnh từ multer

    if (!customerName || !imageBuffer) {
      return res.status(400).json({ message: 'Thiếu tên hoặc ảnh rồi mày ơi!' });
    }

    // 1. Load ảnh từ buffer vào canvas
    const image = await loadImage(imageBuffer);

    // 2. Tìm khuôn mặt và tính toán descriptor
    console.log("Đang phân tích khuôn mặt...");

    const detection = await faceapi
    .detectSingleFace(image, tinyFaceDetectorOptions) // <--- MỚI
    .withFaceLandmarks()
    .withFaceDescriptor();

    if (!detection) {
      console.log("Không tìm thấy khuôn mặt nào trong ảnh.");
      return res.status(400).json({ message: 'Không tìm thấy khuôn mặt trong ảnh, thử tấm khác rõ hơn xem!' });
    }
    console.log("Phân tích thành công! Chuẩn bị lưu...");

    // 3. Tạo một entry mới cho khách hàng
    const newCustomer = {
      name: customerName,
      // Chuyển Float32Array thành mảng thường để lưu vào DB (JSON)
      descriptor: Array.from(detection.descriptor) 
    };

    // 4. Lưu vào "database" của mình
    let customerDatabase = readDatabase();
    customerDatabase.push(newCustomer);
    writeDatabase(customerDatabase);
    console.log(`Đã đăng ký và LƯU VÀO FILE cho: ${customerName}. Tổng số khách hàng: ${customerDatabase.length}`);
    
    // 5. Trả về kết quả thành công
    res.status(201).json({
      message: `Đăng ký thành công cho khách hàng "${customerName}"! ✨`,
      customer: newCustomer, // Trả về để client xem nếu cần
    });

  } catch (error) {
    console.error("Lỗi tè le trong lúc đăng ký:", error);
    res.status(500).json({ message: 'Server bị lỗi rồi, để tao xem lại.' });
  }
});

// Endpoint để xem thử database (dùng để debug)
app.get('/customers', (req, res) => {
  res.json(customerDatabase);
});

/**
 * API CHECK-IN NHẬN DIỆN KHÁCH HÀNG
 * Method: POST
 * URL: /checkin
 * Body: multipart/form-data
 * Fields:
 * - imageFile: Ảnh cần nhận diện (bắt buộc)
 */
app.post('/checkin', upload.single('imageFile'), async (req, res) => {
  console.log("Có yêu cầu check-in...");

  try {
    const imageBuffer = req.file.buffer;
    if (!imageBuffer) {
      return res.status(400).json({ message: 'Gửi ảnh lên đi mày!' });
    }

    // 1. Đọc database để lấy danh sách khách hàng đã đăng ký
    const customerDatabase = readDatabase();
    if (customerDatabase.length === 0) {
      return res.status(500).json({ message: 'Chưa có khách hàng nào trong hệ thống để so sánh!' });
    }

    // 2. Phân tích ảnh check-in để lấy descriptor
    console.log("Đang phân tích ảnh check-in...");
    const image = await loadImage(imageBuffer);
    const detection = await faceapi
    .detectSingleFace(image, tinyFaceDetectorOptions) // <--- MỚI
    .withFaceLandmarks()
    .withFaceDescriptor();

    if (!detection) {
      return res.status(400).json({ message: 'Không tìm thấy khuôn mặt trong ảnh check-in.' });
    }
    const descriptorToCheck = detection.descriptor;

    // 3. Chuẩn bị dữ liệu đã đăng ký để so sánh
    const labeledFaceDescriptors = customerDatabase.map(customer => {
      // Cần chuyển đổi mảng thường từ DB thành Float32Array mà face-api cần
      const descriptors = [new Float32Array(customer.descriptor)];
      return new faceapi.LabeledFaceDescriptors(customer.name, descriptors);
    });

    // 4. Tạo đối tượng so khớp (FaceMatcher)
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6); // Ngưỡng 0.6

    // 5. Tìm người khớp nhất
    console.log("Đang so sánh với database...");
    const bestMatch = faceMatcher.findBestMatch(descriptorToCheck);

    // 6. Trả về kết quả
    if (bestMatch.label === 'unknown') {
      console.log("Không nhận ra người này.");
      return res.status(400).json({ message: 'Không nhận ra! Khách hàng lạ hoắc.' });
    }

    console.log(`Tìm thấy khách hàng: ${bestMatch.toString()}`);
    res.status(200).json({
      success:true,
      message: 'Check-in thành công!',
      customer: {
        name: bestMatch.label,
        distance: bestMatch.distance, // Độ sai khác, càng nhỏ càng giống
      },
    });

  } catch (error) {
    console.error("Lỗi tè le trong lúc check-in:", error);
    res.status(500).json({ message: 'Server bị lỗi rồi, để tao xem lại.' });
  }
});