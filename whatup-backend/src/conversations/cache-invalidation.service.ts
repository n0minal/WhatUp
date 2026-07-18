import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_STORE } from '../cache/tokens';
import { type CacheStore } from '../cache/types/cache-store';
import { AppConfig } from '../config/configuration';
import { AppMode } from '../config/enumerators/app-mode';
import { CHANGE_EVENT_BUS } from '../queue/tokens';
import { type ChangeEventBus } from '../queue/types/change-event-bus';
import { conversationKey, CONVERSATIONS_LIST_KEY } from './cache-keys';

@Injectable()
export class CacheInvalidationService implements OnModuleInit {
  private readonly enabled: boolean;

  constructor(
    @Inject(CHANGE_EVENT_BUS)
    private readonly changes: ChangeEventBus,
    @Inject(CACHE_STORE)
    private readonly cache: CacheStore,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    const mode = this.config.get('mode', { infer: true });
    // The cache serves API reads; a pure worker holds nothing to evict.
    this.enabled = [AppMode.Api, AppMode.All].includes(mode);
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.changes.subscribe((conversationId) => {
      void this.cache.delete(
        CONVERSATIONS_LIST_KEY,
        conversationKey(conversationId),
      );
    });
  }
}
