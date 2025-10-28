import mssql from 'mssql';
import { config } from '../config';
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
