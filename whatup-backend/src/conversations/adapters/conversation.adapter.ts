import { ConversationEntity } from '../entities/conversation.entity';
import { ConversationRow } from '../types/conversation-row';

export class ConversationAdapter {
  public static toModel(row: ConversationRow): ConversationEntity {
    const conversation = new ConversationEntity();
    conversation.id = row.id;
    conversation.phoneNumber = row.phone_number;
    conversation.createdAt = row.created_at;
    conversation.lastMessageAt = row.last_message_at;
    return conversation;
  }
}
