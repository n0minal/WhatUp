import { Conversation } from '../entities/conversation.entity';
import { ConversationRow } from '../types/conversation-row';
import { ConversationAdapter } from './conversation.adapter';

describe('ConversationAdapter', () => {
  const row: ConversationRow = {
    id: 'conv-1',
    phone_number: '+15550001111',
    created_at: new Date('2026-07-01T10:00:00.000Z'),
    last_message_at: new Date('2026-07-17T21:00:00.000Z'),
  };

  it('maps a raw row to a Conversation model', () => {
    const model = ConversationAdapter.toModel(row);
    expect(model).toBeInstanceOf(Conversation);
    expect(model.id).toBe('conv-1');
    expect(model.phoneNumber).toBe('+15550001111');
    expect(model.createdAt).toEqual(new Date('2026-07-01T10:00:00.000Z'));
    expect(model.lastMessageAt).toEqual(new Date('2026-07-17T21:00:00.000Z'));
  });
});
