import { Inject, Injectable, MessageEvent, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { AppConfig } from '../config/configuration';
import { AppMode } from '../config/enumerators/app-mode';
import { CHANGE_EVENT_BUS } from '../queue/tokens';
import { type ChangeEventBus } from '../queue/types/change-event-bus';

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
    // SSE is served by the HTTP API only. A pure worker has no subscribers.
    this.enabled = [AppMode.Api, AppMode.All].includes(mode);
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.changes.subscribe((conversationId) =>
      this.changes$.next(conversationId),
    );
  }

  /**
   * @about Returns an observable stream of server-sent events (SSE) for conversation changes.
   * The stream emits change events whenever a conversation is modified, and also includes periodic keepalive pings to prevent idle connections from being closed.
   * @returns  An observable of MessageEvent objects representing conversation change events and keepalive pings.
   */
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
