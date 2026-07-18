import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitMqService } from './rabbitmq.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

type ConsumeCallback = (msg: FakeMessage | null) => void;

interface FakeMessage {
  content: Buffer;
  properties: { headers: Record<string, unknown> };
}

/** Minimal amqplib double: enough surface for topology, publish, and consume. */
const fakeChannel = () => {
  const channel = {
    assertQueue: jest.fn().mockResolvedValue({ queue: 'q' }),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({}),
    sendToQueue: jest.fn(
      (
        _queue: string,
        _content: Buffer,
        _options: object,
        confirm: (error: unknown) => void,
      ) => confirm(null),
    ),
    ack: jest.fn(),
    checkQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
  };
  return channel;
};

describe('RabbitMqService', () => {
  const connectMock = amqp.connect as jest.Mock;
  let confirmChannels: ReturnType<typeof fakeChannel>[];
  let connection: {
    on: jest.Mock;
    createConfirmChannel: jest.Mock;
    createChannel: jest.Mock;
    close: jest.Mock;
  };
  let service: RabbitMqService;

  const flush = () => new Promise(setImmediate);

  const publishChannel = () => confirmChannels[0];
  const consumerChannel = () => confirmChannels[1];

  const delivery = (headers: Record<string, unknown> = {}): FakeMessage => ({
    content: Buffer.from('{"body":"hi"}'),
    properties: { headers },
  });

  const deliverTo = (handlerChannel: ReturnType<typeof fakeChannel>) =>
    (handlerChannel.consume.mock.calls[0] as unknown[])[1] as ConsumeCallback;

  beforeEach(async () => {
    confirmChannels = [];
    connection = {
      on: jest.fn(),
      createConfirmChannel: jest.fn().mockImplementation(() => {
        const channel = fakeChannel();
        confirmChannels.push(channel);
        return Promise.resolve(channel);
      }),
      createChannel: jest.fn().mockImplementation(() => {
        return Promise.resolve(fakeChannel());
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    connectMock.mockResolvedValue(connection);

    const config = {
      get: jest.fn().mockReturnValue({
        url: 'amqp://test',
        queue: 'q',
        prefetch: 2,
        retryDelayMs: 1000,
        maxReceiveCount: 3,
      }),
    } as unknown as ConfigService;

    service = new RabbitMqService(config as never);
    service.onModuleInit();
    await flush();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('asserts the main/retry/DLQ topology on connect', () => {
    const channel = publishChannel();
    expect(channel.assertQueue).toHaveBeenCalledWith('q', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('q.retry', {
      durable: true,
      arguments: {
        'x-message-ttl': 1000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'q',
      },
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('q.dlq', {
      durable: true,
    });
  });

  it('publishes persistent JSON to the main queue', async () => {
    await service.send({ body: 'hi' });

    const [queue, content, options] = publishChannel().sendToQueue.mock
      .calls[0] as [string, Buffer, { persistent: boolean }];
    expect(queue).toBe('q');
    expect(JSON.parse(content.toString('utf8'))).toEqual({ body: 'hi' });
    expect(options.persistent).toBe(true);
  });

  it('rejects a send while the broker is unreachable (webhook 500s, Twilio retries)', async () => {
    connectMock.mockReturnValue(new Promise(() => undefined));
    const config = {
      get: jest.fn().mockReturnValue({
        url: 'amqp://test',
        queue: 'q',
        prefetch: 2,
        retryDelayMs: 1000,
        maxReceiveCount: 3,
      }),
    } as unknown as ConfigService;
    const disconnected = new RabbitMqService(config as never);

    await expect(disconnected.send({ body: 'hi' })).rejects.toThrow(
      'RabbitMQ connection not available',
    );
  });

  describe('consume', () => {
    let handler: jest.Mock;

    beforeEach(async () => {
      handler = jest.fn().mockResolvedValue(undefined);
      await service.consume(handler);
    });

    it('applies the configured prefetch on the consumer channel', () => {
      expect(consumerChannel().prefetch).toHaveBeenCalledWith(2);
    });

    it('acks a delivery only after the handler resolves', async () => {
      const msg = delivery();
      deliverTo(consumerChannel())(msg);
      await flush();

      expect(handler).toHaveBeenCalledWith('{"body":"hi"}');
      expect(consumerChannel().ack).toHaveBeenCalledWith(msg);
      expect(consumerChannel().sendToQueue).not.toHaveBeenCalled();
    });

    it('republishes a failed delivery to the retry queue with the attempt bumped', async () => {
      handler.mockRejectedValue(new Error('processing failed'));
      const msg = delivery();

      deliverTo(consumerChannel())(msg);
      await flush();

      const [queue, content, options] = consumerChannel().sendToQueue.mock
        .calls[0] as [string, Buffer, { headers: Record<string, unknown> }];
      expect(queue).toBe('q.retry');
      expect(content).toBe(msg.content);
      expect(options.headers['x-attempt']).toBe(2);
      expect(consumerChannel().ack).toHaveBeenCalledWith(msg);
    });

    it('parks a delivery in the DLQ after maxReceiveCount attempts', async () => {
      handler.mockRejectedValue(new Error('still failing'));
      const msg = delivery({ 'x-attempt': 3 });

      deliverTo(consumerChannel())(msg);
      await flush();

      const [queue] = consumerChannel().sendToQueue.mock.calls[0] as [string];
      expect(queue).toBe('q.dlq');
      expect(consumerChannel().ack).toHaveBeenCalledWith(msg);
    });
  });

  it('closes the connection on shutdown so unacked deliveries requeue', async () => {
    await service.onModuleDestroy();
    expect(connection.close).toHaveBeenCalled();
  });
});
