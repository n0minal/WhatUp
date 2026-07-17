import { MessageDirection } from '../../messages/enumerators/message-direction';

/** One prior message in the conversation (Inbound = the user, Outbound = us). */
export interface ConversationTurn {
  direction: MessageDirection;
  body: string;
}

export interface ReplyContext {
  /** The message being replied to. */
  inboundBody: string;
  /** Prior conversation turns, oldest first — excludes inboundBody itself. */
  history: ConversationTurn[];
}

/**
 * Port for the processing step that turns an inbound message into a reply.
 * Context is rebuilt from Postgres per delivery, so drivers stay stateless —
 * retries and concurrent workers regenerate identical context.
 */
export interface ReplyGenerator {
  generateReply(context: ReplyContext): Promise<string>;
}
