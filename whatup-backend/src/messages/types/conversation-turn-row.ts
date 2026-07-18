/**
 * Raw row from the conversation-history query (direction comes back as the
 * column's string value). Adapted to ConversationTurn by ConversationTurnAdapter.
 */
export interface ConversationTurnRow {
  direction: string;
  body: string;
}
