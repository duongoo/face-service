/**
 * VectorIndexService - Dịch vụ tìm kiếm vector nhanh bằng HNSW (Hierarchical Navigable Small World)
 * 
 * @description
 * Sử dụng thuật toán ANN (Approximate Nearest Neighbor) để tăng tốc độ tìm kiếm lên ~1000x
 * so với brute-force khi có hàng triệu descriptors.
 * 
 * Độ phức tạp:
 * - Brute-force: O(n) - chậm khi n lớn
 * - HNSW: O(log n) - nhanh ngay cả với n = 1 triệu
 * 
 * Hiệu năng:
 * - 1 triệu descriptors: ~2-5ms/query (vs 2-3 giây brute-force)
 * - Độ chính xác: ~99% (có thể điều chỉnh qua efSearch)
 * 
 * @remarks
 * Yêu cầu cài đặt: npm install hnswlib-node
 * 
 * Lưu ý:
 * - Index được build trong RAM, cần ~500MB cho 1 triệu vectors (128 dim)
 * - Có thể lưu index ra file để tái sử dụng
 * - Phù hợp cho production với dữ liệu lớn
 */

import { HierarchicalNSW } from 'hnswlib-node'; // Đảm bảo import đúng
import { Patient } from '../types';

interface IndexedDescriptor {
  patientId: string;
  descriptorIndex: number; // Thứ tự descriptor trong mảng của patient
}

export class VectorIndexService {
  private index: HierarchicalNSW | null = null;
  private patientMap: Map<number, IndexedDescriptor> = new Map<number, IndexedDescriptor>();
  private nextId: number = 0;
  private dimension: number = 128; // Face descriptor dimension (cố định cho face-api.js)
  
  /**
   * Build index từ danh sách patients
   * @param patients Danh sách bệnh nhân với descriptors
   */
  async buildIndex(patients: Patient[]): Promise<void> {
    console.log('[VectorIndex] Building HNSW index...');
    const startTime = Date.now();
    
    // Đếm tổng số descriptors
    let totalDescriptors = 0;
    for (const patient of patients) {
      if (Array.isArray(patient.Descriptor)) {
        totalDescriptors += patient.Descriptor.length;
      }
    }
    
    if (totalDescriptors === 0) {
      console.warn('[VectorIndex] No descriptors to index');
      return;
    }
    
    // Khởi tạo HNSW index
    this.index = new HierarchicalNSW('l2', this.dimension);
    
    // Tham số HNSW:
    // - M: số lượng kết nối (16-48, càng cao càng chính xác nhưng tốn RAM)
    // - efConstruction: độ chính xác khi build (100-200, cao = chậm nhưng index tốt hơn)
    this.index.initIndex(totalDescriptors, 32, 200);
    
    // Thêm từng descriptor vào index
    this.patientMap.clear();
    this.nextId = 0;
    
    for (const patient of patients) {
      if (!Array.isArray(patient.Descriptor)) continue;
      
      for (let i = 0; i < patient.Descriptor.length; i++) {
        const descriptor = patient.Descriptor[i];
        
        // Chuyển sang number[] (yêu cầu của hnswlib-node)
        const vector: number[] = Array.isArray(descriptor)
          ? descriptor
          : Array.from(descriptor);
        
        // Kiểm tra dimension
        if (vector.length !== this.dimension) {
          console.warn(`[VectorIndex] Skip descriptor with wrong dimension: ${vector.length}`);
          continue;
        }
        
        // Thêm vào index
        this.index!.addPoint(vector, this.nextId);
        
        // Lưu mapping
        this.patientMap.set(this.nextId, {
          patientId: patient.PatientId,
          descriptorIndex: i
        });
        
        this.nextId++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[VectorIndex] Built index with ${this.nextId} descriptors in ${elapsed}ms ✓`);
  }
  
  /**
   * Tìm k descriptors gần nhất với query
   * @param query Vector descriptor cần tìm
   * @param k Số lượng kết quả trả về
   * @returns Mảng các {patientId, distance}
   */
  searchKNN(query: Float32Array, k: number = 1): Array<{ patientId: string; distance: number }> {
    if (!this.index) {
      throw new Error('[VectorIndex] Index not built');
    }
    
    // Tham số efSearch: độ chính xác khi search (50-200)
    // Cao hơn = chính xác hơn nhưng chậm hơn
    this.index.setEf(100);
    
    // Chuyển query sang number[]
    const queryArray: number[] = Array.from(query);
    
    // Tìm k nearest neighbors
    const result = this.index.searchKnn(queryArray, k);
    
    // result.neighbors: [id1, id2, ...]
    // result.distances: [dist1, dist2, ...]
    const matches: Array<{ patientId: string; distance: number }> = [];
    
    for (let i = 0; i < result.neighbors.length; i++) {
      const id = result.neighbors[i];
      const distance = result.distances[i];
      const indexed = this.patientMap.get(id);
      if (indexed) {
        matches.push({
          patientId: indexed.patientId,
          distance: Math.sqrt(distance) // HNSW trả về squared distance, cần sqrt
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Thêm một descriptor mới vào index (incremental update)
   */
  addDescriptor(patientId: string, descriptor: number[], descriptorIndex: number = 0): void {
    if (!this.index) {
      throw new Error('[VectorIndex] Index not built');
    }
    
    const vector: number[] = Array.isArray(descriptor) ? descriptor : Array.from(descriptor);
    if (vector.length !== this.dimension) {
      throw new Error(`[VectorIndex] Invalid descriptor dimension: ${vector.length}`);
    }
    this.index!.addPoint(vector, this.nextId);
    this.patientMap.set(this.nextId, {
      patientId,
      descriptorIndex
    });
    this.nextId++;
  }
  
  /**
   * Lưu index ra file để tái sử dụng
   */
  saveIndex(filepath: string): void {
    if (!this.index) {
      throw new Error('[VectorIndex] Index not built');
    }
    this.index.writeIndex(filepath);
    console.log(`[VectorIndex] Saved index to ${filepath}`);
  }
  
  /**
   * Load index từ file
   */
  async loadIndex(filepath: string, patients: Patient[]): Promise<void> {
    try {
      console.log(`[VectorIndex] Loading index from ${filepath}...`);
      this.index = new HierarchicalNSW('l2', this.dimension);
      // Đếm tổng số descriptors để init
      let totalDescriptors = 0;
      for (const patient of patients) {
        if (Array.isArray(patient.Descriptor)) {
          totalDescriptors += patient.Descriptor.length;
        }
      }
      // Đảm bảo filepath là string, không phải file object
      if (typeof filepath !== 'string') {
        throw new Error(`[VectorIndex] Filepath phải là string, nhận được: ${typeof filepath}`);
      }
      // readIndex chỉ nhận filepath, không nhận totalDescriptors
      this.index.readIndex(filepath);
      // Rebuild patient map
      this.patientMap.clear();
      this.nextId = 0;
      for (const patient of patients) {
        if (!Array.isArray(patient.Descriptor)) continue;
        for (let i = 0; i < patient.Descriptor.length; i++) {
          this.patientMap.set(this.nextId, {
            patientId: patient.PatientId,
            descriptorIndex: i
          });
          this.nextId++;
        }
      }
      console.log(`[VectorIndex] Loaded index with ${this.nextId} descriptors ✓`);
    } catch (error) {
      console.error('[VectorIndex] Lỗi khi load index:', error);
      throw error;
    }
  }
  
  /**
   * Xóa toàn bộ index
   */
  clear(): void {
    this.index = null;
    this.patientMap.clear();
    this.nextId = 0;
    console.log('[VectorIndex] Cleared index');
  }
  
  /**
   * Kiểm tra index đã được build chưa
   */
  isReady(): boolean {
    return this.index !== null && this.nextId > 0;
  }
  
  /**
   * Lấy thống kê
   */
  getStats() {
    return {
      totalDescriptors: this.nextId,
      isReady: this.isReady(),
      dimension: this.dimension
    };
  }
}
