import { ConversationSummary } from 'whatup-contracts';
import { ConversationListRow } from '../types/conversation-views';

export class ConversationSummaryAdapter {
  public static toModel(row: ConversationListRow): ConversationSummary {
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      lastMessagePreview: row.last_message_preview ?? '',
      lastMessageAt: new Date(row.last_message_at).toISOString(),
      messageCount: parseInt(row.message_count, 10),
    };
  }
}
