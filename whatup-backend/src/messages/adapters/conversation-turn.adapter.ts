import { ConversationTurn } from '../../reply/types/reply-generator';
import { MessageDirection } from '../enumerators/message-direction';
import { ConversationTurnRow } from '../types/conversation-turn-row';

export class ConversationTurnAdapter {
  public static toModel(row: ConversationTurnRow): ConversationTurn {
    return {
      direction: row.direction as MessageDirection,
      body: row.body,
    };
  }
}
