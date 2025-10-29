import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { config } from '../config';
import { Customer, FaceDetection, MatchResult } from '../types';

// Patch face-api.js to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });


/**
 * Dịch vụ nhận diện khuôn mặt
 */
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
        throw new Error('Không phát hiện được khuôn mặt');
      }
      
      return {
        descriptor: detection.descriptor,
        confidence: detection.detection.score
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Không phát hiện được khuôn mặt') {
        throw error;
      }
      console.error('[Face] Detection error:', error);
      throw new Error('Không thể phát hiện khuôn mặt');
    }
  }
  
  /**
   * So sánh khuôn mặt với danh sách khách hàng
   * @param descriptor 
   * @param customers 
   * @returns 
   */
  async matchFace(descriptor: Float32Array, customers: Customer[]): Promise<MatchResult> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded');
    }
    
    // Filter customers with valid descriptors
    const validCustomers = customers.filter(c => c.descriptors.length > 0);
    
    if (validCustomers.length === 0) {
      throw new Error('No customers in database');
    }
    
    // Create labeled face descriptors
    const labeledDescriptors = validCustomers.map(customer => {
      const descriptors = customer.descriptors.map(d => new Float32Array(d));
      return new faceapi.LabeledFaceDescriptors(customer.name, descriptors);
    });
    
    // Create face matcher
    const faceMatcher = new faceapi.FaceMatcher(
      labeledDescriptors,
      config.face.matchThreshold
    );
    
    // Find best match
    const bestMatch = faceMatcher.findBestMatch(descriptor);
    
    if (bestMatch.label === 'unknown') {
      throw new Error('Customer not recognized');
    }
    
    // Find the matched customer
    const matchedCustomer = validCustomers.find(c => c.name === bestMatch.label);
    
    if (!matchedCustomer) {
      throw new Error('Customer not found');
    }
    
    return {
      customer: matchedCustomer,
      distance: bestMatch.distance
    };
  }
}
