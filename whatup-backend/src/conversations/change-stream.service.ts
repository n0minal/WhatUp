import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { AppConfig } from '../config/configuration';
import { AppMode } from '../config/enumerators/app-mode';

const CHANNEL = 'whatup_message_change';

/**
 * Live change feed for the admin UI, served as SSE by ConversationsController.
 *
 * Message rows are written by the worker, which may be a different process
 * than the API (APP_MODE=api|worker), so an in-memory event bus won't do.
 * Instead a Postgres trigger on `messages` fires pg_notify with the
 * conversation id on every write, and this service LISTENs on a dedicated
 * connection — whoever writes, every API instance hears it.
 *
 * The trigger is created here (idempotently) because `synchronize: true`
 * owns the rest of the dev schema; production would move it to a migration.
 */
@Injectable()
export class ChangeStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChangeStreamService.name);
  private readonly db: AppConfig['database'];
  private readonly enabled: boolean;
  private readonly changes$ = new Subject<string>();
  private running = false;
  private client: Client | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    this.db = config.get('database', { infer: true });
    const mode = config.get('mode', { infer: true });
    // SSE is served by the HTTP API only; a pure worker has no subscribers.
    this.enabled = mode === AppMode.Api || mode === AppMode.All;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.running = true;
    void this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.client?.end().catch(() => undefined);
  }

  /** One SSE stream per subscriber: change events plus a keepalive ping. */
  sseEvents(): Observable<MessageEvent> {
    const changes = this.changes$.pipe(
      map((conversationId) => ({ data: { kind: 'change', conversationId } })),
    );
    // Keepalive so idle proxies don't reap the connection.
    const pings = interval(25_000).pipe(
      map(() => ({ data: { kind: 'ping' } })),
    );
    return merge(changes, pings);
  }

  private async connectLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.connect();
        return;
      } catch (error) {
        this.logger.error(
          `Change-stream connect failed, retrying: ${String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async connect(): Promise<void> {
    const client = new Client({
      host: this.db.host,
      port: this.db.port,
      user: this.db.username,
      password: this.db.password,
      database: this.db.database,
    });
    await client.connect();
    client.on('error', (error: Error) =>
      this.logger.error(`Change-stream connection error: ${error.message}`),
    );
    client.on('end', () => {
      if (this.running) {
        this.client = null;
        this.logger.warn('Change-stream connection lost, reconnecting');
        void this.connectLoop();
      }
    });

    await client.query(
      `CREATE OR REPLACE FUNCTION whatup_notify_message_change() RETURNS trigger AS $$
       BEGIN
         PERFORM pg_notify('${CHANNEL}', NEW.conversation_id::text);
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
    );
    await client.query(
      `CREATE OR REPLACE TRIGGER whatup_message_change
       AFTER INSERT OR UPDATE ON messages
       FOR EACH ROW EXECUTE FUNCTION whatup_notify_message_change()`,
    );
    await client.query(`LISTEN ${CHANNEL}`);
    client.on('notification', (msg) => {
      if (msg.payload) this.changes$.next(msg.payload);
    });

    this.client = client;
    this.logger.log(`Change stream connected (LISTEN ${CHANNEL})`);
  }
}
