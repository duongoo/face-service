import { Patient } from '../types';
import { DatabaseService } from './database.service';
import { config } from '../config';

/**
 * Dịch vụ bộ nhớ đệm (cache) cho danh sách khách hàng.
 *
 * Mục đích:
 * - Giảm tải truy vấn CSDL bằng cách lưu danh sách khách hàng vào bộ nhớ.
 * - Làm mới dữ liệu theo TTL được cấu hình (config.cache.ttl).
 *
 * Hành vi:
 * - get(): Trả về danh sách khách hàng từ cache; nếu cache trống hoặc quá TTL sẽ tự gọi refresh().
 * - refresh(): Tải lại toàn bộ khách hàng từ DatabaseService và cập nhật mốc thời gian.
 * - invalidate(): Buộc làm mới cache ngay lập tức (hữu ích sau các thao tác ghi).
 * - getStats(): Trả về thống kê số lượng, tuổi cache (giây) và TTL (giây).
 *
 * Hiệu năng & an toàn:
 * - Chạy trong tiến trình Node.js đơn luồng nên thao tác trên mảng trong bộ nhớ là an toàn.
 * - Nên dùng một thể hiện (singleton) CacheService cho toàn bộ ứng dụng để tận dụng cache.
 * - Cân nhắc TTL để cân bằng giữa độ mới dữ liệu và số lượt truy vấn CSDL.
 *
 * Ghi log:
 * - Sử dụng console.log/console.error để theo dõi vòng đời cache; đã tắt cảnh báo no-console của ESLint cho file.
 *
 * Ví dụ:
 * const cache = new CacheService(databaseService);
 * const patients = await cache.get();
 * await cache.invalidate(); // làm mới ngay
 */
export class CacheService {
  private patients: Patient[] = [];
  private lastUpdate = 0;
  
  constructor(private db: DatabaseService) {}
  
  async get(): Promise<Patient[]> {
    // Luôn trả về dữ liệu cache hiện tại, không tự động refresh
    return this.patients;
  }
  
  async refresh(): Promise<void> {
    console.log('[Cache] Refreshing patient cache...');
    const pageSize = 500;
    let page = 1;
    let allPatients: Patient[] = [];
    try {
      while (true) {
        console.log(`[Cache] Loading patients, page ${page}...`);
        const patients = await this.db.getPatients(page, pageSize);
        if (patients.length === 0) break;
        allPatients = allPatients.concat(patients);
        if (patients.length < pageSize) break;
        page++;
      }
      this.patients = allPatients;
      this.lastUpdate = Date.now();
      console.log(`[Cache] Loaded ${this.patients.length} patients ✓`);
    } catch (error) {
      console.error('[Cache] Refresh failed:', error);
      throw error;
    }
  }
  
  async invalidate(): Promise<void> {
    console.log('[Cache] Invalidating cache...');
    await this.refresh();
  }
  
  getStats() {
    const ageSeconds = Math.floor((Date.now() - this.lastUpdate) / 1000);
    return {
      patientCount: this.patients.length,
      lastUpdateSeconds: ageSeconds,
      ttlSeconds: config.cache.ttl / 1000
    };
  }

  // Thêm hoặc cập nhật khách hàng vào cache (write-through)
  addOrUpdatePatient(patient: Patient) {
    const idx = this.patients.findIndex(c => c.PatientId === patient.PatientId);
    if (idx >= 0) {
      this.patients[idx] = patient;
    } else {
      this.patients.push(patient);
    }
    this.lastUpdate = Date.now();
  }
}
