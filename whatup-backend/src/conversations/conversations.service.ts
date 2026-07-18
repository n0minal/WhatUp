import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import {
  ConversationDetail,
  ConversationSummary,
  MessageView,
} from './types/conversation-views';

/**
 * Read side of the admin API. No database access here — that's
 * ConversationsRepository; this layer maps rows to the whatup-admin contract.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly repository: ConversationsRepository) {}

  async list(): Promise<ConversationSummary[]> {
    const rows = await this.repository.listWithStats();
    return rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phoneNumber,
      lastMessagePreview: row.lastMessagePreview ?? '',
      lastMessageAt: new Date(row.lastMessageAt).toISOString(),
      messageCount: parseInt(row.messageCount, 10),
    }));
  }

  async get(id: string): Promise<ConversationDetail> {
    const conversation = await this.repository.findById(id);
    if (!conversation)
      throw new NotFoundException(`Conversation not found: ${id}`);

    const messages = await this.repository.messagesOf(id);
    const last = messages[messages.length - 1];
    const views: MessageView[] = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      body: m.body,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    }));

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
