export type {
  ConversationDetail,
  ConversationSummary,
  MessageView,
} from 'whatup-contracts';

export interface ConversationListRow {
  id: string;
  phone_number: string;
  last_message_preview: string | null;
  last_message_at: string;
  message_count: string;
}
