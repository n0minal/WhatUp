import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Message } from '../messages/entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationListRow } from './types/conversation-views';

@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  /**
   * @about Fetches all conversations with their last message and message count.
   * @returns An array of conversation list rows containing conversation details, last message preview, and message count.
   */
  listWithStats(): Promise<ConversationListRow[]> {
    return this.dataSource.query(
      `SELECT c.id,
              c.phone_number,
              c.last_message_at,
              last.body AS last_message_preview,
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = c.id) AS message_count
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

  /**
   * @about Fetches a conversation by its ID.
   * @param id The UUID of the conversation to fetch.
   * @returns A promise that resolves to the conversation entity if found, or null if not found.
   */
  findById(id: string): Promise<Conversation | null> {
    return this.conversations.findOneBy({ id });
  }

  /**
   * @about Fetches all messages associated with a specific conversation ID, ordered by creation date in ascending order.
   * @param conversationId The UUID of the conversation for which to fetch messages.
   * @returns A promise that resolves to an array of message entities associated with the specified conversation ID.
   */
  messagesOf(conversationId: string): Promise<Message[]> {
    return this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }
}
