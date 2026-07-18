import { ConfigService } from '@nestjs/config';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessageStatus } from './enumerators/message-status';
import { InboundSms } from './types/inbound-sms';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';
import { ReplyGenerator } from '../reply/types/reply-generator';

describe('MessagesService', () => {
  const sms: InboundSms = {
    providerMessageId: 'SM123',
    from: '+15550001111',
    to: '+15550000001',
    body: 'hello',
  };

  const conversationRow = {
    id: 'conv-1',
    phone_number: '+15550001111',
    created_at: new Date(),
    last_message_at: new Date(),
  };
  const conversation = { id: 'conv-1' } as Conversation;
  const inbound = { id: 'msg-1', body: 'hello' } as Message;

  let repository: jest.Mocked<MessagesRepository>;
  let replyGenerator: jest.Mocked<ReplyGenerator>;
  let messaging: { sendSms: jest.Mock };
  let changes: { publish: jest.Mock; subscribe: jest.Mock };
  let service: MessagesService;

  const outboundRow = (status: Message['status']): Message =>
    ({ id: 'out-1', body: 'the reply', status }) as Message;

  beforeEach(() => {
    repository = {
      upsertConversation: jest.fn().mockResolvedValue(conversationRow),
      insertInboundMessage: jest.fn().mockResolvedValue(inbound),
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getOrCreateOutboundReply: jest
        .fn()
        .mockResolvedValue(outboundRow(MessageStatus.Processing)),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      conversationHistory: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MessagesRepository>;

    replyGenerator = {
      generateReply: jest.fn().mockResolvedValue('the reply'),
    };

    messaging = { sendSms: jest.fn().mockResolvedValue({ sid: 'SM_out' }) };

    changes = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    };

    const config = {
      get: jest.fn().mockReturnValue({
        staleClaimSeconds: 90,
        minMs: 0,
        maxMs: 0,
        historyLimit: 20,
      }),
    } as unknown as ConfigService;

    service = new MessagesService(
      repository,
      replyGenerator,
      messaging,
      changes,
      config as never,
    );
  });

  it('processes an inbound message end to end', async () => {
    await service.handleInbound(sms);

    expect(repository.upsertConversation).toHaveBeenCalledWith(sms.from);
    expect(repository.insertInboundMessage).toHaveBeenCalledWith(
      conversation.id,
      sms.providerMessageId,
      sms.body,
    );
    expect(repository.claimForProcessing).toHaveBeenCalledWith(inbound.id, 90);
    expect(messaging.sendSms).toHaveBeenCalledWith(sms.from, 'the reply');
    expect(repository.markSent).toHaveBeenCalledWith(
      inbound.id,
      'out-1',
      'SM_out',
    );
  });

  it('drops a duplicate delivery when the claim fails', async () => {
    repository.claimForProcessing.mockResolvedValue(false);

    await service.handleInbound(sms);

    expect(replyGenerator.generateReply).not.toHaveBeenCalled();
    expect(messaging.sendSms).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
  });

  it('does not resend when the reply was already sent by a previous attempt', async () => {
    repository.getOrCreateOutboundReply.mockResolvedValue(
      outboundRow(MessageStatus.Sent),
    );

    await service.handleInbound(sms);

    expect(messaging.sendSms).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
  });

  it('sends the recorded reply body, not a regenerated one', async () => {
    repository.getOrCreateOutboundReply.mockResolvedValue({
      ...outboundRow(MessageStatus.Processing),
      body: 'previously recorded reply',
    });

    await service.handleInbound(sms);

    expect(messaging.sendSms).toHaveBeenCalledWith(
      sms.from,
      'previously recorded reply',
    );
  });

  it('marks the message failed and rethrows when the send fails', async () => {
    messaging.sendSms.mockRejectedValue(new Error('twilio down'));

    await expect(service.handleInbound(sms)).rejects.toThrow('twilio down');
    expect(repository.markFailed).toHaveBeenCalledWith(inbound.id, 'out-1');
  });

  it('publishes a change hint after every visible state transition', async () => {
    await service.handleInbound(sms);

    // persisted, claimed (processing), reply row recorded, sent.
    expect(changes.publish).toHaveBeenCalledTimes(4);
    expect(changes.publish).toHaveBeenCalledWith(conversation.id);
  });

  it('still hints after a failure so the UI shows the failed status', async () => {
    messaging.sendSms.mockRejectedValue(new Error('twilio down'));

    await expect(service.handleInbound(sms)).rejects.toThrow();

    // persisted, claimed, reply row recorded, failed.
    expect(changes.publish).toHaveBeenCalledTimes(4);
  });

  it('passes the adapted conversation history to the reply generator', async () => {
    repository.conversationHistory.mockResolvedValue([
      { direction: 'inbound', body: 'open today?' },
      { direction: 'outbound', body: 'Yes, until 6.' },
    ]);

    await service.handleInbound(sms);

    expect(repository.conversationHistory).toHaveBeenCalledWith(
      conversation.id,
      inbound.id,
      20,
    );
    expect(replyGenerator.generateReply).toHaveBeenCalledWith({
      inboundBody: sms.body,
      history: [
        { direction: 'inbound', body: 'open today?' },
        { direction: 'outbound', body: 'Yes, until 6.' },
      ],
    });
  });

  it('does not fail the pipeline when the reply generator throws (records, rethrows for retry)', async () => {
    replyGenerator.generateReply.mockRejectedValue(new Error('driver crash'));

    await expect(service.handleInbound(sms)).rejects.toThrow('driver crash');
    // No reply row exists yet, so only the inbound message is marked failed.
    expect(repository.markFailed).toHaveBeenCalledWith(inbound.id, null);
    expect(messaging.sendSms).not.toHaveBeenCalled();
  });
});
