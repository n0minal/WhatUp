import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { AppConfig } from '../../config/configuration';
import { CacheDriver } from '../enumerators/cache-driver';
import { CacheStore } from '../types/cache-store';

type RedisClient = ReturnType<typeof createClient>;

/**
 * Redis driver for the CacheStore port. Values are stored as JSON with a
 * per-entry TTL. Honors the port's best-effort contract: while the connection
 * is down every operation degrades to a miss or a no-op — the client
 * reconnects in the background and requests are never failed by the cache.
 */
@Injectable()
export class RedisCacheDriver
  implements CacheStore, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisCacheDriver.name);
  private readonly url: string;
  private readonly selected: boolean;
  private client: RedisClient | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const cache = this.config.get('cache', { infer: true });
    this.url = cache.redisUrl;
    // All drivers are instantiated by the module; only the bound one connects.
    this.selected = cache.driver === CacheDriver.Redis;
  }

  onModuleInit(): void {
    // Idempotent: this instance backs two providers (the class and the
    // CACHE_STORE binding), and Nest runs lifecycle hooks for each.
    if (!this.selected || this.client) return;
    const client = createClient({ url: this.url });
    client.on('error', (error: Error) =>
      this.logger.warn(
        `Redis error (cache degrades to misses): ${error.message}`,
      ),
    );
    // connect() retries per the client's reconnect strategy; until it lands,
    // isReady is false and every operation short-circuits.
    void client
      .connect()
      .then(() => this.logger.log(`Connected to ${this.url}`))
      .catch((error: Error) =>
        this.logger.warn(
          `Redis unavailable, running uncached: ${error.message}`,
        ),
      );
    this.client = client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close().catch(() => undefined);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.client?.isReady) return null;
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn(`Cache get('${key}') failed: ${String(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      if (!this.client?.isReady) return;
      await this.client.set(key, JSON.stringify(value), {
        expiration: { type: 'EX', value: ttlSeconds },
      });
    } catch (error) {
      this.logger.warn(`Cache set('${key}') failed: ${String(error)}`);
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      if (!this.client?.isReady) return;
      await this.client.del(keys);
    } catch (error) {
      this.logger.warn(
        `Cache delete(${keys.join(', ')}) failed: ${String(error)}`,
      );
    }
  }
}
