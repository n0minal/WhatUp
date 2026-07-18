/**
 * Raw row from INSERT/SELECT ... RETURNING on conversations (snake_case,
 * timestamptz parsed to Date by the pg driver). Adapted to the
 * ConversationEntity model by ConversationAdapter.
 */
export interface ConversationRow {
  id: string;
  phone_number: string;
  created_at: Date;
  last_message_at: Date;
}
