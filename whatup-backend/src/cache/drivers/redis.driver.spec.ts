import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { CacheDriver } from '../enumerators/cache-driver';
import { RedisCacheDriver } from './redis.driver';

jest.mock('redis', () => ({ createClient: jest.fn() }));

describe('RedisCacheDriver', () => {
  const createClientMock = createClient as jest.Mock;
  let client: {
    on: jest.Mock;
    connect: jest.Mock;
    close: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    isReady: boolean;
  };

  const build = (driver: CacheDriver = CacheDriver.Redis): RedisCacheDriver => {
    const config = {
      get: jest.fn().mockReturnValue({
        driver,
        redisUrl: 'redis://test:6379',
        ttlSeconds: 30,
      }),
    } as unknown as ConfigService;
    return new RedisCacheDriver(config as never);
  };

  beforeEach(() => {
    client = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      isReady: true,
    };
    createClientMock.mockReset();
    createClientMock.mockReturnValue(client);
  });

  it('connects only when it is the selected driver', () => {
    build(CacheDriver.Memory).onModuleInit();
    expect(createClientMock).not.toHaveBeenCalled();

    build(CacheDriver.Redis).onModuleInit();
    expect(createClientMock).toHaveBeenCalledWith({
      url: 'redis://test:6379',
    });
  });

  it('opens a single connection even when lifecycle hooks run twice', () => {
    const driver = build();
    // The instance backs two providers (class + CACHE_STORE binding), so
    // Nest invokes onModuleInit once per provider.
    driver.onModuleInit();
    driver.onModuleInit();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  describe('when connected', () => {
    let driver: RedisCacheDriver;

    beforeEach(() => {
      driver = build();
      driver.onModuleInit();
    });

    it('round-trips values as JSON with the entry TTL', async () => {
      await driver.set('key', { a: 1 }, 30);
      expect(client.set).toHaveBeenCalledWith('key', '{"a":1}', {
        expiration: { type: 'EX', value: 30 },
      });

      client.get.mockResolvedValue('{"a":1}');
      await expect(driver.get('key')).resolves.toEqual({ a: 1 });
    });

    it('misses on an absent key', async () => {
      await expect(driver.get('nope')).resolves.toBeNull();
    });

    it('deletes the given keys in one command', async () => {
      await driver.delete('one', 'two');
      expect(client.del).toHaveBeenCalledWith(['one', 'two']);
    });

    it('skips the round-trip for an empty delete', async () => {
      await driver.delete();
      expect(client.del).not.toHaveBeenCalled();
    });

    it('treats a get failure as a miss (never rejects)', async () => {
      client.get.mockRejectedValue(new Error('connection reset'));
      await expect(driver.get('key')).resolves.toBeNull();
    });

    it('swallows set and delete failures (never rejects)', async () => {
      client.set.mockRejectedValue(new Error('OOM'));
      client.del.mockRejectedValue(new Error('connection reset'));

      await expect(driver.set('key', 1, 30)).resolves.toBeUndefined();
      await expect(driver.delete('key')).resolves.toBeUndefined();
    });
  });

  describe('while the connection is down', () => {
    it('degrades every operation to a miss or no-op', async () => {
      client.isReady = false;
      const driver = build();
      driver.onModuleInit();

      await expect(driver.get('key')).resolves.toBeNull();
      await expect(driver.set('key', 1, 30)).resolves.toBeUndefined();
      await expect(driver.delete('key')).resolves.toBeUndefined();
      expect(client.get).not.toHaveBeenCalled();
      expect(client.set).not.toHaveBeenCalled();
      expect(client.del).not.toHaveBeenCalled();
    });
  });

  it('closes the client on shutdown', async () => {
    const driver = build();
    driver.onModuleInit();
    await driver.onModuleDestroy();
    expect(client.close).toHaveBeenCalled();
  });
});
