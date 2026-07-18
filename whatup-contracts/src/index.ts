/**
 * The wire contract between whatup-backend and whatup-admin.
 *
 * Only what crosses the HTTP/SSE boundary belongs here — view shapes, their
 * enums, and event payloads. Entities and internal types stay in their apps:
 * this package is the API surface, deliberately decoupled from storage.
 *
 * The enums are runtime values (the backend persists them); the `…Value`
 * unions are their literal expansions, used by the wire shapes so consumers
 * can compare against plain strings without importing the enum.
 */

export enum MessageDirection {
  Inbound = 'inbound',
  Outbound = 'outbound',
}

/** Pipeline state machine: Received -> Processing -> Sent | Failed */
export enum MessageStatus {
  Received = 'received',
  Processing = 'processing',
  Sent = 'sent',
  Failed = 'failed',
}

export type MessageDirectionValue = `${MessageDirection}`;
export type MessageStatusValue = `${MessageStatus}`;

export interface ConversationSummary {
  id: string;
  /** E.164 phone number of the remote party. */
  phoneNumber: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  direction: MessageDirectionValue;
  body: string;
  status: MessageStatusValue;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageView[];
}

/** SSE payloads on GET /conversations/events. */
export type ChangeEvent =
  | { kind: 'change'; conversationId: string }
  | { kind: 'ping' };

/** Response to a send (twilio-mock /simulate/inbound in dev). */
export interface SendReceipt {
  messageSid: string;
}
