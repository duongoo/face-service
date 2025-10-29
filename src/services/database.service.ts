/**
 * DatabaseService - Dịch vụ quản lý kết nối và thao tác với SQL Server database
 * 
 * @description
 * Service này xử lý các thao tác liên quan đến database cho hệ thống nhận diện khuôn mặt:
 * - Quản lý kết nối đến SQL Server
 * - Lưu trữ và truy xuất thông tin khách hàng (Customer)
 * - Quản lý face descriptors (vector đặc trưng khuôn mặt)
 * - Tự động giới hạn số lượng descriptors cho mỗi khách hàng (tối đa 5)
 * 
 * @remarks
 * Luồng xử lý chính:
 * 1. Khởi tạo kết nối database qua `connect()`
 * 2. Lấy danh sách khách hàng qua `getAllCustomers()`
 * 3. Lưu/cập nhật thông tin khách hàng qua `saveCustomer()`
 * 4. Đóng kết nối khi không sử dụng qua `close()`
 * 
 * @example
 * ```typescript
 * const dbService = new DatabaseService();
 * await dbService.connect();
 * await dbService.saveCustomer("John Doe", [0.1, 0.2, ...]);
 * const customers = await dbService.getAllCustomers();
 * await dbService.close();
 * ```
 */

/**
 * Thiết lập kết nối đến SQL Server database
 * @throws {Error} Nếu kết nối thất bại
 */

/**
 * Lấy danh sách tất cả khách hàng từ database
 * @returns {Promise<Customer[]>} Mảng các đối tượng Customer chứa tên và descriptors
 * @throws {Error} Nếu database chưa được kết nối
 */

/**
 * Lưu hoặc cập nhật thông tin khách hàng và face descriptor
 * 
 * @param {string} name - Tên khách hàng
 * @param {number[]} descriptor - Mảng số (vector) đại diện cho đặc trưng khuôn mặt
 * 
 * @description
 * - Nếu khách hàng đã tồn tại: thêm descriptor mới vào danh sách
 * - Nếu khách hàng chưa tồn tại: tạo mới record
 * - Tự động giới hạn tối đa 5 descriptors gần nhất cho mỗi khách hàng
 * 
 * @throws {Error} Nếu database chưa được kết nối
 */

/**
 * Parse và chuyển đổi descriptor từ database thành mảng 2 chiều
 * 
 * @param {any} raw - Dữ liệu thô từ database (JSON string hoặc array)
 * @returns {number[][]} Mảng 2 chiều các descriptors
 * 
 * @private
 * @description
 * Xử lý 3 trường hợp:
 * - Nếu đã là array: trả về trực tiếp
 * - Nếu là JSON string chứa 1 descriptor: wrap thành mảng 2 chiều
 * - Nếu là JSON string chứa nhiều descriptors: parse và trả về
 * - Nếu parse thất bại: trả về mảng rỗng
 */

/**
 * Đóng kết nối database
 * @description Giải phóng tài nguyên và đóng connection pool
 */
import mssql from 'mssql';
import { config } from '../config';
import path = require('path');
import { Customer } from '../types';


export class DatabaseService {
  private pool: mssql.ConnectionPool | null = null;
  
  async connect(): Promise<void> {
    try {
      this.pool = await mssql.connect(config.database);
      console.log('[DB] Connected to SQL Server ✓');
    } catch (error) {
      console.error('[DB] Connection failed:', error);
      throw error;
    }
  }
  
  async getAllCustomers(): Promise<Customer[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    
    const result = await this.pool
      .request()
      .query('SELECT name, descriptor FROM Customers');
    
    return result.recordset.map(row => ({
      name: row.name,
      descriptors: this.parseDescriptors(row.descriptor)
    }));
  }
  
  async saveCustomer(name: string, descriptor: number[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    
    // Check if customer exists
    const existing = await this.pool
      .request()
      .input('name', mssql.NVarChar, name)
      .query('SELECT descriptor FROM Customers WHERE name = @name');
    
    let descriptors: number[][] = [];
    
    if (existing.recordset.length > 0) {
      descriptors = this.parseDescriptors(existing.recordset[0].descriptor);
    }
    
    // Add new descriptor and keep only last 5
    descriptors.push(descriptor);
    if (descriptors.length > 5) {
      descriptors = descriptors.slice(-5);
    }
    
    const descriptorJson = JSON.stringify(descriptors);
    
    if (existing.recordset.length > 0) {
      // Update existing customer
      await this.pool
        .request()
        .input('name', mssql.NVarChar, name)
        .input('descriptor', mssql.NVarChar, descriptorJson)
        .query('UPDATE Customers SET descriptor = @descriptor WHERE name = @name');
    } else {
      // Insert new customer
      await this.pool
        .request()
        .input('name', mssql.NVarChar, name)
        .input('descriptor', mssql.NVarChar, descriptorJson)
        .query('INSERT INTO Customers (name, descriptor) VALUES (@name, @descriptor)');
    }
  }
  
  private parseDescriptors(raw: any): number[][] {
    if (Array.isArray(raw)) {
      return raw;
    }
    
    try {
      const parsed = JSON.parse(raw);
      
      // Check if it's a single descriptor array
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
        return [parsed];
      }
      
      // It's already an array of descriptors
      return parsed;
    } catch {
      return [];
    }
  }
  
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      console.log('[DB] Connection closed');
    }
  }
}
