export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus = 'received' | 'processing' | 'sent' | 'failed';

export interface Conversation {
  id: string;
  /** E.164 phone number of the remote party. */
  phoneNumber: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}
