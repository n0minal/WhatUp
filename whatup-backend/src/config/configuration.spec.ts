import configuration from './configuration';
import { AppMode } from './enumerators/app-mode';

describe('configuration', () => {
  const managed = [
    'APP_MODE',
    'PORT',
    'DB_PORT',
    'RABBITMQ_PREFETCH',
    'RABBITMQ_MAX_RECEIVE_COUNT',
    'STALE_CLAIM_SECONDS',
    'REPLY_HISTORY_LIMIT',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of managed) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of managed) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to all-in-one mode on port 3000', () => {
    const config = configuration();
    expect(config.mode).toBe(AppMode.All);
    expect(config.port).toBe(3000);
  });

  it('parses numeric env vars as numbers, not strings', () => {
    process.env.PORT = '8080';
    process.env.DB_PORT = '5433';
    process.env.RABBITMQ_PREFETCH = '10';
    process.env.STALE_CLAIM_SECONDS = '120';

    const config = configuration();

    expect(config.port).toBe(8080);
    expect(config.database.port).toBe(5433);
    expect(config.rabbitmq.prefetch).toBe(10);
    expect(config.processing.staleClaimSeconds).toBe(120);
  });

  it('honours APP_MODE', () => {
    process.env.APP_MODE = 'worker';
    expect(configuration().mode).toBe(AppMode.Worker);
  });

  it('keeps retry semantics bounded by default (3 attempts)', () => {
    expect(configuration().rabbitmq.maxReceiveCount).toBe(3);
  });
});
