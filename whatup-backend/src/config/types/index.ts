import { AppMode } from '../enumerators/app-mode';
import { MessagingDriver } from '../../messaging/enumerators/messaging-driver';
import { ReplyDriver } from '../../reply/enumerators/reply-driver';

export interface AppConfig {
  mode: AppMode;
  port: number;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  rabbitmq: {
    url: string;
    /** Main queue name; `<queue>.retry` and `<queue>.dlq` are derived from it. */
    queue: string;
    /** Fanout exchange broadcasting change hints to API instances (SSE). */
    changesExchange: string;
    /** Max unacked deliveries per consumer = worker concurrency. */
    prefetch: number;
    /** Delay before a failed delivery comes back (visibility-timeout analog). */
    retryDelayMs: number;
    /** Attempts before a message is parked in the DLQ. */
    maxReceiveCount: number;
  };
  messaging: {
    /** Which outbound driver MessagingModule binds. */
    driver: MessagingDriver;
  };
  reply: {
    /** Which reply-generation driver ReplyModule binds. */
    driver: ReplyDriver;
    /** Max prior conversation turns passed to the driver as context. */
    historyLimit: number;
    claude: {
      /** Claude model for the Agent SDK, e.g. 'haiku' or a full model id. */
      model: string;
    };
  };
  twilio: {
    /** Real Twilio, or the twilio-mock service in dev. */
    apiBaseUrl: string;
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
  zenvia: {
    apiBaseUrl: string;
    apiToken: string;
    fromNumber: string;
  };
  processing: {
    minMs: number;
    maxMs: number;
    /** A `processing` claim older than this is considered abandoned. */
    staleClaimSeconds: number;
  };
}
