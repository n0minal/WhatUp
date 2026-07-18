import { MessageDirection } from '../enumerators/message-direction';
import { ConversationTurnAdapter } from './conversation-turn.adapter';

describe('ConversationTurnAdapter', () => {
  it('maps an inbound row to a turn', () => {
    expect(
      ConversationTurnAdapter.toModel({ direction: 'inbound', body: 'hi' }),
    ).toEqual({ direction: MessageDirection.Inbound, body: 'hi' });
  });

  it('maps an outbound row to a turn', () => {
    expect(
      ConversationTurnAdapter.toModel({ direction: 'outbound', body: 'yo' }),
    ).toEqual({ direction: MessageDirection.Outbound, body: 'yo' });
  });
});
