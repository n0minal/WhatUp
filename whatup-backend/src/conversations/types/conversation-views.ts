/** Response shapes are the whatup-admin contract (whatup-admin/src/types.ts). */

export interface ConversationSummary {
  id: string;
  phoneNumber: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageView[];
}

/** Raw row shape returned by ConversationsRepository.listWithStats(). */
export interface ConversationListRow {
  id: string;
  phoneNumber: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  messageCount: string;
}
