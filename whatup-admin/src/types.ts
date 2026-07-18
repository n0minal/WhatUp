/**
 * Wire types come from the shared contract (whatup-contracts) — the same
 * definitions the backend's controllers return, so drift is a compile error.
 * Local aliases keep the UI's vocabulary (Conversation, Message).
 */
export type {
  ConversationSummary as Conversation,
  MessageView as Message,
  ConversationDetail,
  MessageDirectionValue as MessageDirection,
  MessageStatusValue as MessageStatus,
} from 'whatup-contracts';
