/**
 * @packageDocumentation
 * Dịch vụ nhận diện khuôn mặt sử dụng face-api.js kết hợp node-canvas trong môi trường Node.js.
 *
 * - Monkey patch face-api.js với Canvas, Image, ImageData từ thư viện `canvas` để chạy ngoài trình duyệt.
 * - Tải mô hình từ thư mục cấu hình `config.face.modelPath`.
 * - Cấu hình bộ dò TinyFaceDetector từ `config.face.detectorOptions`.
 * - Cung cấp hai năng lực chính: phát hiện (detect) và so khớp (match) khuôn mặt.
 *
 * Luồng xử lý khuyến nghị:
 * 1) Gọi `loadModels()` một lần khi dịch vụ khởi động (idempotent).
 * 2) Với mỗi ảnh đầu vào, gọi `detectFace(buffer)` để lấy descriptor và độ tự tin.
 * 3) Gọi `matchFace(descriptor, patients)` để so khớp với cơ sở dữ liệu khách hàng.
 */

/**
 * Dịch vụ xử lý và nhận diện khuôn mặt.
 *
 * @remarks
 * - Khởi tạo tuỳ chọn TinyFaceDetector từ `config.face.detectorOptions` (hỗ trợ cả cấu trúc mảng và đối tượng).
 * - Quản lý trạng thái đã tải mô hình nhằm tránh tải lại nhiều lần.
 *
 * @example
 * // Khởi động dịch vụ và tải mô hình
 * const service = new FaceService();
 * await service.loadModels();
 *
 * // Phát hiện khuôn mặt từ ảnh (Buffer)
 * const { descriptor, confidence } = await service.detectFace(imageBuffer);
 *
 * // So khớp với danh sách khách hàng đã lưu descriptor
 * const result = await service.matchFace(descriptor, patients);
 * console.log(result.patient.name, result.distance);
 */

/**
 * Tải các mô hình nhận diện khuôn mặt từ đĩa.
 *
 * @remarks
 * - Hàm an toàn gọi lặp (idempotent): nếu mô hình đã tải, sẽ thoát ngay.
 * - Tải lần lượt: TinyFaceDetector, FaceLandmark68, FaceRecognition.
 *
 * @returns Promise hoàn tất khi toàn bộ mô hình được tải.
 *
 * @throws Error Nếu quá trình tải mô hình từ đĩa thất bại.
 */
 
/**
 * Phát hiện khuôn mặt và trích xuất đặc trưng (descriptor) từ ảnh.
 *
 * @param imageBuffer Buffer chứa dữ liệu ảnh đầu vào (ví dụ: JPEG/PNG).
 *
 * @returns
 * Đối tượng gồm:
 * - `descriptor`: véc-tơ đặc trưng khuôn mặt (Float32Array) phục vụ so khớp.
 * - `confidence`: điểm tin cậy của phát hiện (0..1).
 *
 * @remarks
 * - Sử dụng `TinyFaceDetector` kết hợp landmark và recognition head để sinh descriptor.
 * - Yêu cầu `loadModels()` được gọi thành công trước đó.
 *
 * @throws Error
 * - Nếu mô hình chưa được tải.
 * - Nếu không phát hiện được khuôn mặt trong ảnh.
 * - Nếu có lỗi nội bộ khi đọc ảnh hoặc suy luận.
 */
 
/**
 * So khớp một descriptor với danh sách khách hàng.
 *
 * @param descriptor Descriptor khuôn mặt cần so khớp (Float32Array).
 * @param patients Danh sách khách hàng, mỗi khách hàng có thể chứa nhiều descriptor đã lưu.
 *
 * @returns
 * Kết quả so khớp:
 * - `patient`: khách hàng được nhận diện.
 * - `distance`: khoảng cách đặc trưng (càng nhỏ càng giống).
 *
 * @remarks
 * - Lọc bỏ khách hàng không có descriptor hợp lệ.
 * - Dùng `FaceMatcher` của face-api với ngưỡng `config.face.matchThreshold`.
 * - So khớp theo nhãn (name) tương ứng với `LabeledFaceDescriptors`.
 *
 * @throws Error
 * - Nếu mô hình chưa được tải.
 * - Nếu không có khách hàng hợp lệ trong cơ sở dữ liệu.
 * - Nếu không nhận diện được khách hàng (kết quả "unknown").
 * - Nếu không tìm thấy khách hàng tương ứng với nhãn trả về.
 */
import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { config } from '../config';
import { Patient, FaceDetection, MatchResult } from '../types';

// Patch face-api.js to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

export class FaceService {
  private modelsLoaded = false;
  private detectorOptions: faceapi.TinyFaceDetectorOptions;
  
  constructor() {
    this.detectorOptions = new faceapi.TinyFaceDetectorOptions(
      ...(Array.isArray(config.face.detectorOptions)
        ? config.face.detectorOptions
        : Object.values(config.face.detectorOptions))
    );
  }
  
  /**
   * Tải các mô hình nhận diện khuôn mặt
   * @returns 
   */
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) {
      return;
    }
    
    try {
      console.log('[Face] Đang tải mô hình...');
      
      await faceapi.nets.tinyFaceDetector.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(config.face.modelPath);
      
      this.modelsLoaded = true;
      console.log('[Face] Đã tải mô hình ✓');
    } catch (error) {
      console.error('[Face] Không tải được mô hình:', error);
      throw error;
    }
  }
  
  /**
   * Phát hiện khuôn mặt trong hình ảnh
   * @param imageBuffer 
   * @returns 
   */
  async detectFace(imageBuffer: Buffer): Promise<FaceDetection> {
    if (!this.modelsLoaded) {
      throw new Error('Mô hình không được tải');
    }
    
    try {
      const image = await loadImage(imageBuffer);
      
      const detection = await faceapi
        .detectSingleFace(image, this.detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (!detection) {
        throw new Error('No face detected');
      }
      
      return {
        descriptor: detection.descriptor,
        confidence: detection.detection.score
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'No face detected') {
        throw error;
      }
      console.error('[Face] Detection error:', error);
      throw new Error('No face detected');
    }
  }
  
  /**
   * So sánh khuôn mặt với danh sách khách hàng
   * @param descriptor 
   * @param patients 
   * @returns 
   */
  async matchFace(descriptor: Float32Array, patients: Patient[]): Promise<MatchResult> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded');
    }
    
    // Filter patients with valid descriptors
    const validPatients = patients.filter(c => c.Descriptor.length > 0);
    
    if (validPatients.length === 0) {
      throw new Error('No patients in database');
    }
    
    // Create labeled face descriptors
    const labeledDescriptors = validPatients.map(patient => {
      const descriptors = patient.Descriptor.map(d => new Float32Array(d));
      return new faceapi.LabeledFaceDescriptors(patient.PatientId, descriptors);
    });
    
    // Create face matcher
    const faceMatcher = new faceapi.FaceMatcher(
      labeledDescriptors,
      config.face.matchThreshold
    );
    
    // Find best match
    const bestMatch = faceMatcher.findBestMatch(descriptor);
    
    if (bestMatch.label === 'unknown') {
      throw new Error('Patient not recognized');
    }
    
    // Find the matched patient
    const matchedPatient = validPatients.find(c => c.PatientId === bestMatch.label);
    
    if (!matchedPatient) {
      throw new Error('Patient not found');
    }
    
    return {
      patient: matchedPatient,
      distance: bestMatch.distance
    };
  }
}
