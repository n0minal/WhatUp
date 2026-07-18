import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_STORE } from '../cache/tokens';
import { type CacheStore } from '../cache/types/cache-store';
import { AppConfig } from '../config/configuration';
import { ConversationsRepository } from './conversations.repository';
import {
  ConversationDetail,
  ConversationSummary,
  MessageView,
} from './types/conversation-views';
import { ConversationSummaryAdapter } from './adapters/conversation-summary.adapter';
import { MessageViewAdapter } from './adapters/message-view.adapter';
import { conversationKey, CONVERSATIONS_LIST_KEY } from './cache-keys';

/**
 * Admin read path, cache-aside (DESIGN.md §6): every SSE hint makes every
 * connected client re-fetch, so one write can fan out into many identical
 * reads. The first read after a hint repopulates the cache; the rest are
 * served from it until the next hint (or the TTL backstop) evicts it.
 */
@Injectable()
export class ConversationsService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly repository: ConversationsRepository,
    @Inject(CACHE_STORE)
    private readonly cache: CacheStore,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.ttlSeconds = this.config.get('cache', { infer: true }).ttlSeconds;
  }

  /**
   * @about Lists all conversations as summaries for the admin UI, newest
   * activity first. Cache-aside under CONVERSATIONS_LIST_KEY.
   * @returns The conversation summaries, adapted from the repository rows.
   */
  async list(): Promise<ConversationSummary[]> {
    const cached = await this.cache.get<ConversationSummary[]>(
      CONVERSATIONS_LIST_KEY,
    );
    if (cached) return cached;

    const rows = await this.repository.listWithStats();
    const summaries = rows.map((row) =>
      ConversationSummaryAdapter.toModel(row),
    );
    await this.cache.set(CONVERSATIONS_LIST_KEY, summaries, this.ttlSeconds);
    return summaries;
  }

  /**
   * @about Fetches one conversation with its full message history as views.
   * Cache-aside per conversation; a miss (404) is never cached.
   * @param id - The UUID of the conversation to fetch.
   * @returns The conversation detail with its messages in chronological order.
   * @throws NotFoundException when no conversation exists for the id.
   */
  async get(id: string): Promise<ConversationDetail> {
    const key = conversationKey(id);
    const cached = await this.cache.get<ConversationDetail>(key);
    if (cached) return cached;

    const conversation = await this.repository.findById(id);

    if (!conversation)
      throw new NotFoundException(`Conversation not found: ${id}`);

    const messages = await this.repository.messagesOf(id);
    const last = messages[messages.length - 1];
    const views: MessageView[] = messages.map((m) =>
      MessageViewAdapter.toModel(m),
    );

    const detail: ConversationDetail = {
      conversation: {
        id: conversation.id,
        phoneNumber: conversation.phoneNumber,
        lastMessagePreview: last?.body ?? '',
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        messageCount: messages.length,
      },
      messages: views,
    };
    await this.cache.set(key, detail, this.ttlSeconds);
    return detail;
  }
}
