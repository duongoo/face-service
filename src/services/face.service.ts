import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { config } from '../config';
import { Customer, FaceDetection, MatchResult } from '../types';

// Patch face-api.js to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

export class FaceService {
  private modelsLoaded = false;
  private detectorOptions: faceapi.TinyFaceDetectorOptions;
  
  constructor() {
    this.detectorOptions = new faceapi.TinyFaceDetectorOptions(
      config.face.detectorOptions
    );
  }
  
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) {
      return;
    }
    
    try {
      console.log('[Face] Loading models...');
      
      await faceapi.nets.tinyFaceDetector.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(config.face.modelPath);
      
      this.modelsLoaded = true;
      console.log('[Face] Models loaded ✓');
    } catch (error) {
      console.error('[Face] Failed to load models:', error);
      throw error;
    }
  }
  
  async detectFace(imageBuffer: Buffer): Promise<FaceDetection> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded');
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
      throw new Error('Face detection failed');
    }
  }
  
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
