import { Customer } from '../types';
import { DatabaseService } from './database.service';
import { config } from '../config';

export class CacheService {
  private customers: Customer[] = [];
  private lastUpdate = 0;
  
  constructor(private db: DatabaseService) {}
  
  async get(): Promise<Customer[]> {
    const now = Date.now();
    
    // Refresh cache if expired or empty
    if (now - this.lastUpdate > config.cache.ttl || this.customers.length === 0) {
      await this.refresh();
    }
    
    return this.customers;
  }
  
  async refresh(): Promise<void> {
    console.log('[Cache] Refreshing customer cache...');
    
    try {
      this.customers = await this.db.getAllCustomers();
      this.lastUpdate = Date.now();
      console.log(`[Cache] Loaded ${this.customers.length} customers ✓`);
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
      customerCount: this.customers.length,
      lastUpdateSeconds: ageSeconds,
      ttlSeconds: config.cache.ttl / 1000
    };
  }
}
