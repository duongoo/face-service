const express = require('express');
const cors = require('cors');
const path = require('path');

const faceapi = require('face-api.js');
const { Canvas, Image, ImageData, loadImage } = require('canvas');

const multer = require('multer');
const mssql = require('mssql');
const dbConfig = require('./dbConfig');

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const tinyFaceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 512,
  scoreThreshold: 0.5
});
const FACE_MATCH_THRESHOLD = 0.55;
const MODELS_PATH = path.join(__dirname, 'models');
async function loadModels() {
  console.log('Đang nạp model...');
  try {
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

    console.log('Nạp model thành công! 🔥');
  } catch (error) {
    console.error('Lỗi khi nạp model:', error);
    process.exit(1);
  }
}


async function connectAndQuery(query, params = {}) {
  let pool;
  try {
    pool = await mssql.connect(dbConfig);
    const request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error('Lỗi kết nối hoặc truy vấn SQL Server:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
    }
    mssql.close();
  }
}

async function readCustomersFromDb() {
  const rows = await connectAndQuery('SELECT name, descriptor FROM Customers');
  return rows.map((row) => {
    let parsed;
    if (Array.isArray(row.descriptor)) {
      parsed = row.descriptor;
    } else {
      try {
        parsed = JSON.parse(row.descriptor);
      } catch {
        parsed = [];
      }
    }

    // parsed can be:
    // - [number,...]               => single descriptor
    // - [[number,...], ...]        => multiple descriptors
    let descriptorsArray = [];
    if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'number') {
      descriptorsArray = [parsed];
    } else if (Array.isArray(parsed)) {
      descriptorsArray = parsed;
    } else {
      descriptorsArray = [];
    }

    return {
      name: row.name,
      descriptor: descriptorsArray
    };
  });
}

async function writeCustomerToDb(name, descriptor) {
  // Ensure descriptor is a plain array
  const descriptorArray = Array.isArray(descriptor) ? descriptor : Array.from(descriptor || []);

  // Read existing descriptors for this customer
  const existing = await connectAndQuery('SELECT descriptor FROM Customers WHERE name = @name', { name });
  let descriptorsList = [];

  if (existing && existing.length > 0) {
    try {
      const raw = Array.isArray(existing[0].descriptor) ? existing[0].descriptor : JSON.parse(existing[0].descriptor);
      if (Array.isArray(raw) && raw.length && typeof raw[0] === 'number') {
        descriptorsList = [raw];
      } else if (Array.isArray(raw)) {
        descriptorsList = raw;
      }
    } catch (e) {
      descriptorsList = [];
    }
  }

  // Append new descriptor and keep only the most recent 5 descriptors
  descriptorsList.push(descriptorArray);
  if (descriptorsList.length > 5) {
    descriptorsList = descriptorsList.slice(-5);
  }

  const descriptorJson = JSON.stringify(descriptorsList);

  if (existing && existing.length > 0) {
    await connectAndQuery('UPDATE Customers SET descriptor = @descriptor WHERE name = @name', { name, descriptor: descriptorJson });
  } else {
    await connectAndQuery('INSERT INTO Customers (name, descriptor) VALUES (@name, @descriptor)', { name, descriptor: descriptorJson });
  }
}

app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('API nhận diện khuôn mặt đã sẵn sàng!');
});

app.post('/register', upload.single('imageFile'), async (req, res) => {
  console.log('Có yêu cầu đăng ký mới...');
  try {
    const { customerName } = req.body;
    const imageBuffer = req.file?.buffer;

    if (!customerName || !imageBuffer) {
      return res.status(400).json({ message: 'Thiếu tên hoặc ảnh!' });
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
    // let customerDatabase = readDatabase();
    // customerDatabase.push(newCustomer);
    // writeDatabase(customerDatabase);
    await writeCustomerToDb(customerName, Array.from(detection.descriptor) );
    const customers = await readCustomersFromDb();
    console.log(`Đã đăng ký và LƯU VÀO FILE cho: ${customerName}. Tổng số khách hàng: ${customers.length}`);
    
    // 5. Trả về kết quả thành công
    res.status(201).json({
      message: `Đăng ký thành công cho khách hàng "${customerName}"! ✨`,
      customer: newCustomer, // Trả về để client xem nếu cần
    });
    
  } catch (error) {
    console.error('Lỗi trong lúc đăng ký:', error);
    return res.status(500).json({ message: 'Server bị lỗi, thử lại sau.' });
  }
});

app.get('/customers', async (_req, res) => {
  try {
    const customers = await readCustomersFromDb();
    res.json(customers);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách khách hàng:', error);
    res.status(500).json({ message: 'Không thể lấy danh sách khách hàng.' });
  }
});

app.post('/checkin', upload.single('imageFile'), async (req, res) => {
  console.log('Có yêu cầu check-in...');
  try {
    const imageBuffer = req.file?.buffer;
    if (!imageBuffer) {
      return res.status(400).json({ message: 'Gửi ảnh lên đi!' });
    }

    const customerDatabase = await readCustomersFromDb();
    if (customerDatabase.length === 0) {
      return res.status(500).json({ message: 'Chưa có khách hàng nào trong hệ thống.' });
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
     const labeledFaceDescriptors = customerDatabase
      .filter((c) => Array.isArray(c.descriptor) && c.descriptor.length)
      .map((customer) => {
        const descriptors = customer.descriptor.map((d) => new Float32Array(d));
        return new faceapi.LabeledFaceDescriptors(customer.name, descriptors);
      });

    // 4. Tạo đối tượng so khớp (FaceMatcher)
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, FACE_MATCH_THRESHOLD); // Ngưỡng 0.6

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
    console.error('Lỗi trong lúc check-in:', error);
    return res.status(500).json({ message: 'Server bị lỗi, thử lại sau.' });
  }
});


loadModels()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server đang chạy ở http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Không thể khởi động server:', error);
    process.exit(1);
  });
