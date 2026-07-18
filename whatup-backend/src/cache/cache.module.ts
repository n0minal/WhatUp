import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MemoryCacheDriver } from './drivers/memory.driver';
import { RedisCacheDriver } from './drivers/redis.driver';
import { CacheDriver } from './enumerators/cache-driver';
import { CACHE_STORE } from './tokens';
import { CacheStore } from './types/cache-store';

/**
 * Read caching behind the CacheStore port. The driver is chosen by
 * CACHE_DRIVER; adding a store is one new driver class plus a case here —
 * nothing outside this module changes.
 */
@Module({
  providers: [
    RedisCacheDriver,
    MemoryCacheDriver,
    {
      provide: CACHE_STORE,
      inject: [ConfigService, RedisCacheDriver, MemoryCacheDriver],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        redis: RedisCacheDriver,
        memory: MemoryCacheDriver,
      ): CacheStore => {
        switch (config.get('cache', { infer: true }).driver) {
          case CacheDriver.Memory:
            return memory;
          case CacheDriver.Redis:
          default:
            return redis;
        }
      },
    },
  ],
  // Only the port is exported: consumers can't couple to a driver.
  exports: [CACHE_STORE],
})
export class CacheModule {}
