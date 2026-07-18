import { Injectable } from '@nestjs/common';
import { CacheStore } from '../types/cache-store';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-process driver for the CacheStore port: a Map with per-entry TTL and
 * lazy expiry. Per-instance by nature — which still works multi-instance,
 * because every API instance receives every change hint and invalidates its
 * own copy. Redis buys shared warm entries, not correctness.
 */
@Injectable()
export class MemoryCacheDriver implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  delete(...keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
    return Promise.resolve();
  }
}
