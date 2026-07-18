import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitMqChangeBusService } from './rabbitmq-change-bus.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

type ConsumeCallback = (msg: { content: Buffer } | null) => void;

describe('RabbitMqChangeBusService', () => {
  const connectMock = amqp.connect as jest.Mock;
  let channel: {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    consume: jest.Mock;
    publish: jest.Mock;
  };
  let connection: { on: jest.Mock; createChannel: jest.Mock; close: jest.Mock };
  let service: RabbitMqChangeBusService;

  const flush = () => new Promise(setImmediate);

  const build = () => {
    const config = {
      get: jest.fn().mockReturnValue({
        url: 'amqp://test',
        changesExchange: 'changes',
      }),
    } as unknown as ConfigService;
    return new RabbitMqChangeBusService(config as never);
  };

  beforeEach(async () => {
    channel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'amq.gen-1' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
    };
    connection = {
      on: jest.fn(),
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    connectMock.mockResolvedValue(connection);

    service = build();
    service.onModuleInit();
    await flush();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('asserts a transient fanout exchange on connect', () => {
    expect(channel.assertExchange).toHaveBeenCalledWith('changes', 'fanout', {
      durable: false,
    });
  });

  it('publishes the conversation id to the fanout exchange', async () => {
    await service.publish('conv-1');

    const [exchange, routingKey, content] = channel.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
    ];
    expect(exchange).toBe('changes');
    expect(routingKey).toBe('');
    expect(content.toString('utf8')).toBe('conv-1');
  });

  it('never rejects a publish before the connection is up (hint dropped)', async () => {
    connectMock.mockReturnValue(new Promise(() => undefined));
    const disconnected = build();

    await expect(disconnected.publish('conv-1')).resolves.toBeUndefined();
  });

  it('never rejects when the broker publish throws (hints are best-effort)', async () => {
    channel.publish.mockImplementation(() => {
      throw new Error('channel closed');
    });

    await expect(service.publish('conv-1')).resolves.toBeUndefined();
  });

  it('subscribes on an exclusive auto-delete queue bound to the exchange', async () => {
    service.subscribe(jest.fn());
    await flush();

    expect(channel.assertQueue).toHaveBeenCalledWith('', {
      exclusive: true,
      autoDelete: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith('amq.gen-1', 'changes', '');
    const consumeArgs = channel.consume.mock.calls[0] as unknown[];
    expect(consumeArgs[2]).toEqual({ noAck: true });
  });

  it('forwards each hint to the handler as a conversation id', async () => {
    const handler = jest.fn();
    service.subscribe(handler);
    await flush();

    const consumeArgs = channel.consume.mock.calls[0] as unknown[];
    const deliver = consumeArgs[1] as ConsumeCallback;
    deliver({ content: Buffer.from('conv-42') });

    expect(handler).toHaveBeenCalledWith('conv-42');
  });
});
