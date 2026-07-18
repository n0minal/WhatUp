import { Message } from '../../messages/entities/message.entity';
import { MessageDirection } from '../../messages/enumerators/message-direction';
import { MessageStatus } from '../../messages/enumerators/message-status';
import { MessageViewAdapter } from './message-view.adapter';

describe('MessageViewAdapter', () => {
  const message = Object.assign(new Message(), {
    id: 'msg-1',
    conversationId: 'conv-1',
    direction: MessageDirection.Inbound,
    body: 'hello',
    status: MessageStatus.Sent,
    createdAt: new Date('2026-07-17T21:00:00.000Z'),
  });

  it('maps a Message entity to the wire view', () => {
    expect(MessageViewAdapter.toModel(message)).toEqual({
      id: 'msg-1',
      conversationId: 'conv-1',
      direction: 'inbound',
      body: 'hello',
      status: 'sent',
      createdAt: '2026-07-17T21:00:00.000Z',
    });
  });

  it('serializes createdAt as an ISO string', () => {
    const view = MessageViewAdapter.toModel(message);
    expect(typeof view.createdAt).toBe('string');
    expect(new Date(view.createdAt).getTime()).toBe(
      message.createdAt.getTime(),
    );
  });
});
