import { MemoryCacheDriver } from './memory.driver';

describe('MemoryCacheDriver', () => {
  let driver: MemoryCacheDriver;

  beforeEach(() => {
    driver = new MemoryCacheDriver();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('round-trips a value', async () => {
    await driver.set('key', { a: 1 }, 30);
    await expect(driver.get('key')).resolves.toEqual({ a: 1 });
  });

  it('misses on an unknown key', async () => {
    await expect(driver.get('nope')).resolves.toBeNull();
  });

  it('expires an entry after its TTL', async () => {
    await driver.set('key', 'value', 30);

    jest.advanceTimersByTime(29_000);
    await expect(driver.get('key')).resolves.toBe('value');

    jest.advanceTimersByTime(2_000);
    await expect(driver.get('key')).resolves.toBeNull();
  });

  it('overwrites an existing entry and refreshes its TTL', async () => {
    await driver.set('key', 'old', 30);
    jest.advanceTimersByTime(20_000);
    await driver.set('key', 'new', 30);

    jest.advanceTimersByTime(15_000);
    await expect(driver.get('key')).resolves.toBe('new');
  });

  it('deletes multiple keys at once', async () => {
    await driver.set('one', 1, 30);
    await driver.set('two', 2, 30);
    await driver.set('three', 3, 30);

    await driver.delete('one', 'two');

    await expect(driver.get('one')).resolves.toBeNull();
    await expect(driver.get('two')).resolves.toBeNull();
    await expect(driver.get('three')).resolves.toBe(3);
  });
});
