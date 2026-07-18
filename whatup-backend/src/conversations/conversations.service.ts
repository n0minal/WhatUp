import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import {
  ConversationDetail,
  ConversationSummary,
  MessageView,
} from './types/conversation-views';
import { ConversationSummaryAdapter } from './adapters/conversation-summary.adapter';
import { MessageViewAdapter } from './adapters/message-view.adapter';

@Injectable()
export class ConversationsService {
  constructor(private readonly repository: ConversationsRepository) {}

  /**
   * @about Lists all conversations as summaries for the admin UI, newest
   * activity first.
   * @returns The conversation summaries, adapted from the repository rows.
   */
  async list(): Promise<ConversationSummary[]> {
    const rows = await this.repository.listWithStats();
    return rows.map((row) => ConversationSummaryAdapter.toModel(row));
  }

  /**
   * @about Fetches one conversation with its full message history as views.
   * @param id - The UUID of the conversation to fetch.
   * @returns The conversation detail with its messages in chronological order.
   * @throws NotFoundException when no conversation exists for the id.
   */
  async get(id: string): Promise<ConversationDetail> {
    const conversation = await this.repository.findById(id);

    if (!conversation)
      throw new NotFoundException(`Conversation not found: ${id}`);

    const messages = await this.repository.messagesOf(id);
    const last = messages[messages.length - 1];
    const views: MessageView[] = messages.map((m) =>
      MessageViewAdapter.toModel(m),
    );

    return {
      conversation: {
        id: conversation.id,
        phoneNumber: conversation.phoneNumber,
        lastMessagePreview: last?.body ?? '',
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        messageCount: messages.length,
      },
      messages: views,
    };
  }
}
