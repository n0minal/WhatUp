import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MessageQueue } from '../queue/types/message-queue';
import { TwilioInboundDto } from './dto/twilio-inbound.dto';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  let queue: jest.Mocked<MessageQueue>;
  let controller: WebhookController;

  const payload: TwilioInboundDto = {
    MessageSid: 'SM123',
    From: '+15550001111',
    To: '+15550000001',
    Body: 'hello',
  };

  beforeEach(() => {
    queue = {
      send: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
    };
    controller = new WebhookController(queue);
  });

  it('enqueues the normalized payload (Twilio names translated at the seam)', async () => {
    await controller.receiveSms(payload);

    expect(queue.send).toHaveBeenCalledWith({
      providerMessageId: 'SM123',
      from: '+15550001111',
      to: '+15550000001',
      body: 'hello',
    });
  });

  it('propagates enqueue failures so Nest returns 500 and Twilio retries', async () => {
    queue.send.mockRejectedValue(new Error('broker down'));

    await expect(controller.receiveSms(payload)).rejects.toThrow('broker down');
  });
});

describe('TwilioInboundDto validation', () => {
  const base = {
    MessageSid: 'SM123',
    From: '+15550001111',
    To: '+15550000001',
    Body: 'hello',
  };

  const validateDto = (raw: object) =>
    validate(plainToInstance(TwilioInboundDto, raw));

  it('accepts a complete Twilio webhook payload', async () => {
    await expect(validateDto(base)).resolves.toHaveLength(0);
  });

  it('accepts an empty Body (a bodyless SMS is still a message)', async () => {
    await expect(validateDto({ ...base, Body: '' })).resolves.toHaveLength(0);
  });

  it.each(['MessageSid', 'From', 'To'])(
    'rejects a payload missing %s',
    async (field) => {
      const errors = await validateDto({ ...base, [field]: undefined });
      expect(errors.map((e) => e.property)).toContain(field);
    },
  );

  it.each(['MessageSid', 'From', 'To'])(
    'rejects an empty %s',
    async (field) => {
      const errors = await validateDto({ ...base, [field]: '' });
      expect(errors.map((e) => e.property)).toContain(field);
    },
  );
});
