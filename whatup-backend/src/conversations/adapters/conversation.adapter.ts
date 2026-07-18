import { Conversation } from '../entities/conversation.entity';
import { ConversationRow } from '../types/conversation-row';

export class ConversationAdapter {
  public static toModel(row: ConversationRow): Conversation {
    const conversation = new Conversation();
    conversation.id = row.id;
    conversation.phoneNumber = row.phone_number;
    conversation.createdAt = row.created_at;
    conversation.lastMessageAt = row.last_message_at;
    return conversation;
  }
}
