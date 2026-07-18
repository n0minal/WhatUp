/**
 * Response shapes come from the shared wire contract (whatup-contracts) —
 * the same definitions whatup-admin consumes, so drift is a compile error.
 */
export type {
  ConversationDetail,
  ConversationSummary,
  MessageView,
} from 'whatup-contracts';

/** Raw row shape returned by ConversationsRepository.listWithStats(). */
export interface ConversationListRow {
  id: string;
  phoneNumber: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  messageCount: string;
}
