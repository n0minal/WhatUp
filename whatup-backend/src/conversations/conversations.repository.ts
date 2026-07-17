import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Message } from '../messages/entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationListRow } from './types/conversation-views';

/**
 * Data adapter for the conversations read side — every database access on
 * this path lives here; ConversationsService only shapes the results.
 */
@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  /** One row per conversation with preview and count, most recent first. */
  listWithStats(): Promise<ConversationListRow[]> {
    return this.dataSource.query(
      `SELECT c.id,
              c.phone_number   AS "phoneNumber",
              c.last_message_at AS "lastMessageAt",
              last.body        AS "lastMessagePreview",
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = c.id) AS "messageCount"
       FROM conversations c
       LEFT JOIN LATERAL (
         SELECT body FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) last ON true
       ORDER BY c.last_message_at DESC`,
    );
  }

  findById(id: string): Promise<Conversation | null> {
    return this.conversations.findOneBy({ id });
  }

  messagesOf(conversationId: string): Promise<Message[]> {
    return this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }
}
