import { ConversationListRow } from '../types/conversation-views';
import { ConversationSummaryAdapter } from './conversation-summary.adapter';

describe('ConversationSummaryAdapter', () => {
  const row: ConversationListRow = {
    id: 'conv-1',
    phone_number: '+15550001111',
    last_message_preview: 'see you at 9',
    last_message_at: '2026-07-17T21:00:00.000Z',
    message_count: '7',
  };

  it('maps a raw row to the wire model', () => {
    expect(ConversationSummaryAdapter.toModel(row)).toEqual({
      id: 'conv-1',
      phoneNumber: '+15550001111',
      lastMessagePreview: 'see you at 9',
      lastMessageAt: '2026-07-17T21:00:00.000Z',
      messageCount: 7,
    });
  });

  it('defaults a missing preview to an empty string', () => {
    const model = ConversationSummaryAdapter.toModel({
      ...row,
      last_message_preview: null,
    });
    expect(model.lastMessagePreview).toBe('');
  });

  it('parses the count and normalizes the timestamp to ISO', () => {
    const model = ConversationSummaryAdapter.toModel({
      ...row,
      message_count: '12',
      last_message_at: 'Fri Jul 17 2026 21:00:00 GMT+0000',
    });
    expect(model.messageCount).toBe(12);
    expect(model.lastMessageAt).toBe('2026-07-17T21:00:00.000Z');
  });
});
