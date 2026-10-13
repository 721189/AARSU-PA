import { EventEmitter } from 'events';

interface CacheItem<T = any> {
  value: T;
  expiresAt: number | null;
  lastAccessed: number;
}

export interface RedisMetrics {
  totalKeys: number;
  hits: number;
  misses: number;
  hitRatio: string;
  uptimeSeconds: number;
  memoryEstimatedKb: number;
}

export class EnterpriseRedisCache {
  private store: Map<string, CacheItem> = new Map();
  private maxKeys: number;
  private pubsub: EventEmitter = new EventEmitter();
  private hits: number = 0;
  private misses: number = 0;
  private startTime: number = Date.now();

  constructor(maxKeys: number = 5000) {
    this.maxKeys = maxKeys;
    this.startCleanupInterval();
  }

  // Periodic passive TTL eviction
  private startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.store.entries()) {
        if (item.expiresAt !== null && item.expiresAt <= now) {
          this.store.delete(key);
        }
      }
    }, 15000).unref();
  }

  public get<T = any>(key: string): T | null {
    const item = this.store.get(key);
    const now = Date.now();

    if (!item) {
      this.misses++;
      return null;
    }

    if (item.expiresAt !== null && item.expiresAt <= now) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    item.lastAccessed = now;
    this.hits++;
    return item.value as T;
  }

  public set<T = any>(key: string, value: T, ttlSeconds: number | null = null): void {
    if (this.store.size >= this.maxKeys) {
      this.evictLRU();
    }

    const expiresAt = ttlSeconds !== null ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, {
      value,
      expiresAt,
      lastAccessed: Date.now()
    });
  }

  public del(key: string): boolean {
    return this.store.delete(key);
  }

  public incr(key: string, amount: number = 1): number {
    const current = this.get<number>(key) || 0;
    const next = current + amount;
    this.set(key, next);
    return next;
  }

  public exists(key: string): boolean {
    return this.get(key) !== null;
  }

  // Evict least recently used key
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [k, item] of this.store.entries()) {
      if (item.lastAccessed < oldestAccess) {
        oldestAccess = item.lastAccessed;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  // Pub/Sub capabilities
  public publish(channel: string, message: any): void {
    this.pubsub.emit(channel, message);
  }

  public subscribe(channel: string, listener: (data: any) => void): void {
    this.pubsub.on(channel, listener);
  }

  public unsubscribe(channel: string, listener: (data: any) => void): void {
    this.pubsub.off(channel, listener);
  }

  // Redis-style operational telemetry
  public getMetrics(): RedisMetrics {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(1) + '%' : '100%';
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const memoryEstimatedKb = Math.round((this.store.size * 250) / 1024);

    return {
      totalKeys: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      uptimeSeconds,
      memoryEstimatedKb
    };
  }
}

export const redisCache = new EnterpriseRedisCache(5000);
