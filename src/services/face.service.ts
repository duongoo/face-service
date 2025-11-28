/**
 * FaceService (cleaned)
 *
 * - Quản lý incremental updates cho VectorIndex (HNSW).
 * - Tránh khai báo trùng lặp; xử lý an toàn khi vectorIndex chưa đc cung cấp.
 */

import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { config } from '../config';
import { Patient, FaceDetection, MatchResult } from '../types';
import { VectorIndexService } from './vector-index.service';

// Patch face-api.js to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

export class FaceService {
  private modelsLoaded = false;
  private detectorOptions: faceapi.SsdMobilenetv1Options;

  // Vector index support
  private vectorIndex?: VectorIndexService;
  private vectorIndexEnabled = false;
  private autoSaveIndexCounter = 0;
  private autoSaveInterval = 100; // save index every N additions

  constructor(vectorIndex?: VectorIndexService) {
    const minConfidence = (config.face.detectorOptions && config.face.detectorOptions.scoreThreshold) || 0.7;
    this.detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence });
    this.vectorIndex = vectorIndex;
  }

  // ----- Vector index helpers -----
  setVectorIndexEnabled(enabled: boolean): void {
    this.vectorIndexEnabled = enabled && !!this.vectorIndex;
    console.log(`[Face] Vector index: ${this.vectorIndexEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  isVectorIndexEnabled(): boolean {
    return !!this.vectorIndex && this.vectorIndexEnabled;
  }

  async buildVectorIndex(patients: Patient[]): Promise<void> {
    if (!this.vectorIndex) throw new Error('VectorIndexService not provided');
    await this.vectorIndex.buildIndex(patients);
  }

  async loadVectorIndex(filepath: string, patients: Patient[]): Promise<void> {
    if (!this.vectorIndex) throw new Error('VectorIndexService not provided');
    await this.vectorIndex.loadIndex(filepath, patients);
  }

  saveVectorIndex(filepath: string): void {
    if (!this.vectorIndex) throw new Error('VectorIndexService not provided');
    this.vectorIndex.saveIndex(filepath);
  }

  addDescriptorToIndex(patientId: string, descriptor: number[] | Float32Array, descriptorIndex: number = 0): void {
    if (!this.vectorIndex || !this.vectorIndexEnabled) return;
    const vec = Array.isArray(descriptor) ? descriptor : Array.from(descriptor);
    try {
      this.vectorIndex.addDescriptor(patientId, vec, descriptorIndex);
      this.autoSaveIndexCounter++;
      if (this.autoSaveIndexCounter >= this.autoSaveInterval) {
        try {
          this.vectorIndex.saveIndex('./storage/face-index.bin');
        } catch (err) {
          console.warn('[Face] Auto-save index failed', err);
        }
        this.autoSaveIndexCounter = 0;
      }
    } catch (err) {
      console.warn('[Face] addDescriptorToIndex error:', err);
    }
  }

  // ----- Models / Detection -----
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) return;
    try {
      console.log('[Face] Đang tải mô hình...');
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(config.face.modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(config.face.modelPath);
      this.modelsLoaded = true;
      console.log('[Face] Đã tải mô hình ✓');
    } catch (error) {
      console.error('[Face] Không tải được mô hình:', error);
      throw error;
    }
  }

  private isPoseAcceptable(landmarks: faceapi.FaceLandmarks68): boolean {
    try {
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      const leftY = leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length;
      const rightY = rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length;
      const eyeDistance = Math.hypot(leftEye[0].x - rightEye[3].x, leftEye[0].y - rightEye[3].y);
      const verticalDiff = Math.abs(leftY - rightY);
      if (eyeDistance === 0) return false;
      const ratio = verticalDiff / eyeDistance;
      return ratio < 0.15;
    } catch {
      return false;
    }
  }

  async detectFace(imageBuffer: Buffer): Promise<FaceDetection> {
    if (!this.modelsLoaded) throw new Error('Mô hình không được tải');
    try {
      const image = await loadImage(imageBuffer) as any;
      const detection = await faceapi
        .detectSingleFace(image, this.detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) throw new Error('No face detected');

      const score = detection.detection.score || 0;
      const minScore = config.face.detectorOptions.scoreThreshold ?? 0.7;
      if (score < minScore) throw new Error('Face detection confidence too low');

      const box = detection.detection.box;
      const imgArea = (image.width || 1) * (image.height || 1);
      const faceArea = box.width * box.height;
      const minFaceRatio = config.face.detectorOptions.minFaceRatio ?? 0.02;
      const faceRatio = faceArea / imgArea;
      if (faceRatio < minFaceRatio) throw new Error('Face too small in image');

      if (!detection.landmarks || !this.isPoseAcceptable(detection.landmarks)) throw new Error('Unacceptable face pose');

      return { descriptor: detection.descriptor, confidence: score };
    } catch (error) {
      if (error instanceof Error && (error.message === 'No face detected' || error.message === 'Face detection confidence too low' || error.message === 'Face too small in image' || error.message === 'Unacceptable face pose')) {
        throw error;
      }
      console.error('[Face] Detection error:', error);
      throw new Error('No face detected');
    }
  }

  // ----- Matching -----
  async matchFace(descriptor: Float32Array, patients: Patient[]): Promise<MatchResult> {
    if (!this.modelsLoaded) throw new Error('Models not loaded');

    const validPatients = patients.filter(c => Array.isArray(c.Descriptor) && c.Descriptor.length > 0);
    if (validPatients.length === 0) throw new Error('No patients in database');

    const maxAccept = config.face.maxDescriptorDistanceForAcceptance ?? config.face.matchThreshold ?? 0.35;

    if (this.vectorIndex && this.vectorIndexEnabled && this.vectorIndex.isReady()) {
      return this.matchFaceWithVectorIndex(descriptor, validPatients, maxAccept);
    } else {
      return this.matchFaceWithBruteForce(descriptor, validPatients, maxAccept);
    }
  }

  private async matchFaceWithVectorIndex(descriptor: Float32Array, patients: Patient[], maxAccept: number): Promise<MatchResult> {
    console.time('[Face] matchFaceWithVectorIndex');
    if (!this.vectorIndex) throw new Error('VectorIndexService not provided');

    const candidates = this.vectorIndex.searchKNN(descriptor, 3);
    console.timeEnd('[Face] matchFaceWithVectorIndex');

    if (candidates.length === 0 || candidates[0].distance > maxAccept) throw new Error('Patient not recognized');

    const bestMatch = candidates[0];
    const patient = patients.find(p => p.PatientId === bestMatch.patientId);
    if (!patient) throw new Error('Patient not found');

    console.debug(`[Face] VectorIndex match: ${patient.PatientName} (distance: ${bestMatch.distance.toFixed(4)})`);
    return { patient, distance: bestMatch.distance };
  }

  private async matchFaceWithBruteForce(descriptor: Float32Array, patients: Patient[], maxAccept: number): Promise<MatchResult> {
    console.time('[Face] matchFaceWithBruteForce');
    let bestPatient: Patient | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const patient of patients) {
      for (const d of patient.Descriptor) {
        const stored = new Float32Array(d);
        const dist = faceapi.euclideanDistance(descriptor, stored);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestPatient = patient;
          if (dist < maxAccept * 0.5) {
            console.debug(`[Face] Early termination at distance ${dist.toFixed(4)}`);
            console.timeEnd('[Face] matchFaceWithBruteForce');
            return { patient: bestPatient, distance: bestDistance };
          }
        }
      }
    }

    console.timeEnd('[Face] matchFaceWithBruteForce');

    if (bestDistance === Number.POSITIVE_INFINITY || bestDistance > maxAccept) throw new Error('Patient not recognized');
    if (!bestPatient) throw new Error('Patient not found');

    console.debug(`[Face] BruteForce match: ${bestPatient.PatientName} (distance: ${bestDistance.toFixed(4)})`);
    return { patient: bestPatient, distance: bestDistance };
  }

  // Expose vector index instance if needed
  getVectorIndex(): VectorIndexService | undefined {
    return this.vectorIndex;
  }
}
