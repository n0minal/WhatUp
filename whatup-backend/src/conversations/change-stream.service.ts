import { Inject, Injectable, MessageEvent, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { AppConfig } from '../config/configuration';
import { AppMode } from '../config/enumerators/app-mode';
import { CHANGE_EVENT_BUS } from '../queue/tokens';
import { type ChangeEventBus } from '../queue/types/change-event-bus';

/**
 * Live change feed for the admin UI, served as SSE by ConversationsController.
 *
 * Message rows are written by the worker, which may be a different process
 * than the API (APP_MODE=api|worker), so an in-memory event bus won't do.
 * The pipeline publishes change hints on the ChangeEventBus (a RabbitMQ
 * fanout exchange) after every write — whoever writes, every API instance
 * hears it. This service only shapes those hints into SSE streams.
 */
@Injectable()
export class ChangeStreamService implements OnModuleInit {
  private readonly enabled: boolean;
  private readonly changes$ = new Subject<string>();

  constructor(
    @Inject(CHANGE_EVENT_BUS)
    private readonly changes: ChangeEventBus,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    const mode = this.config.get('mode', { infer: true });
    // SSE is served by the HTTP API only; a pure worker has no subscribers.
    this.enabled = [AppMode.Api, AppMode.All].includes(mode);
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.changes.subscribe((conversationId) =>
      this.changes$.next(conversationId),
    );
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
}
