import { ConfigService } from '@nestjs/config';
import { AppMode } from '../config/enumerators/app-mode';
import { MessagesService } from '../messages/messages.service';
import { MessageQueue, QueueHandler } from '../queue/types/message-queue';
import { QueueConsumerService } from './queue-consumer.service';

describe('QueueConsumerService', () => {
  let queue: jest.Mocked<MessageQueue>;
  let messages: { handleInbound: jest.Mock };

  const build = (mode: AppMode): QueueConsumerService => {
    const config = {
      get: jest.fn().mockReturnValue(mode),
    } as unknown as ConfigService;
    return new QueueConsumerService(
      queue,
      messages as unknown as MessagesService,
      config as never,
    );
  };

  beforeEach(() => {
    queue = {
      send: jest.fn(),
      consume: jest.fn().mockResolvedValue(undefined),
    };
    messages = { handleInbound: jest.fn().mockResolvedValue(undefined) };
  });

  it.each([AppMode.Worker, AppMode.All])(
    'registers the consumer in %s mode',
    async (mode) => {
      await build(mode).onApplicationBootstrap();
      expect(queue.consume).toHaveBeenCalledTimes(1);
    },
  );

  it('does not consume in api mode', async () => {
    await build(AppMode.Api).onApplicationBootstrap();
    expect(queue.consume).not.toHaveBeenCalled();
  });

  describe('the registered handler', () => {
    let handler: QueueHandler;

    beforeEach(async () => {
      await build(AppMode.Worker).onApplicationBootstrap();
      handler = queue.consume.mock.calls[0][0];
    });

    it('adapts the delivery body and hands it to the pipeline', async () => {
      const payload = {
        providerMessageId: 'SM123',
        from: '+15550001111',
        to: '+15550000001',
        body: 'hello',
      };

      await handler(JSON.stringify(payload));

      expect(messages.handleInbound).toHaveBeenCalledWith(payload);
    });

    it('rejects a malformed body so the queue adapter schedules redelivery', async () => {
      await expect(handler('not json')).rejects.toThrow();
      expect(messages.handleInbound).not.toHaveBeenCalled();
    });

    it('propagates pipeline failures (the delivery must not be acked)', async () => {
      messages.handleInbound.mockRejectedValue(new Error('db down'));
      const payload = JSON.stringify({
        providerMessageId: 'SM123',
        from: '+1',
        to: '+2',
        body: 'x',
      });

      await expect(handler(payload)).rejects.toThrow('db down');
    });
  });
});
