import { CacheDriver } from '../cache/enumerators/cache-driver';
import { MessagingDriver } from '../messaging/enumerators/messaging-driver';
import { ReplyDriver } from '../reply/enumerators/reply-driver';
import { AppMode } from './enumerators/app-mode';
import { AppConfig } from './types';

export { AppMode } from './enumerators/app-mode';
export type { AppConfig } from './types';

export default (): AppConfig => ({
  mode: (process.env.APP_MODE as AppMode) ?? AppMode.All,
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'whatup',
    password: process.env.DB_PASSWORD ?? 'whatup',
    database: process.env.DB_NAME ?? 'whatup',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://whatup:whatup@localhost:5672',
    queue: process.env.RABBITMQ_QUEUE ?? 'whatup-inbound',
    changesExchange: process.env.RABBITMQ_CHANGES_EXCHANGE ?? 'whatup-changes',
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH ?? '5', 10),
    retryDelayMs: parseInt(process.env.RABBITMQ_RETRY_DELAY_MS ?? '60000', 10),
    maxReceiveCount: parseInt(
      process.env.RABBITMQ_MAX_RECEIVE_COUNT ?? '3',
      10,
    ),
  },
  cache: {
    driver: (process.env.CACHE_DRIVER as CacheDriver) ?? CacheDriver.Redis,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '30', 10),
  },
  messaging: {
    driver:
      (process.env.MESSAGING_DRIVER as MessagingDriver) ??
      MessagingDriver.Twilio,
  },
  reply: {
    driver: (process.env.REPLY_DRIVER as ReplyDriver) ?? ReplyDriver.Fake,
    historyLimit: parseInt(process.env.REPLY_HISTORY_LIMIT ?? '20', 10),
    claude: {
      model: process.env.CLAUDE_MODEL ?? 'haiku',
    },
  },
  twilio: {
    apiBaseUrl: process.env.TWILIO_API_BASE_URL ?? 'http://localhost:4010',
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? 'AC_fake',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? 'fake',
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? '+15550000001',
  },
  zenvia: {
    apiBaseUrl: process.env.ZENVIA_API_BASE_URL ?? 'https://api.zenvia.com',
    apiToken: process.env.ZENVIA_API_TOKEN ?? 'fake',
    fromNumber: process.env.ZENVIA_FROM_NUMBER ?? 'whatup',
  },
  processing: {
    minMs: parseInt(process.env.PROCESSING_MIN_MS ?? '3000', 10),
    maxMs: parseInt(process.env.PROCESSING_MAX_MS ?? '15000', 10),
    staleClaimSeconds: parseInt(process.env.STALE_CLAIM_SECONDS ?? '90', 10),
  },
});
