import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { AppConfig } from '../config/configuration';
import { ChangeEventBus, ChangeEventHandler } from './types/change-event-bus';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

/**
 * RabbitMQ adapter for the ChangeEventBus port: a fanout exchange where the
 * worker publishes conversation ids and each API instance consumes from its
 * own exclusive auto-delete queue — every instance hears every hint,
 * whichever process wrote the row.
 *
 * Deliberately looser than RabbitMqService's work queue: transient exchange,
 * non-persistent publishes, no-ack consume, and a publish failure is logged
 * and swallowed. Hints are re-fetch triggers, not data (DESIGN.md §6) —
 * losing one costs staleness until the next event, never correctness.
 */
@Injectable()
export class RabbitMqChangeBusService
  implements ChangeEventBus, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqChangeBusService.name);
  private readonly url: string;
  private readonly exchange: string;

  private running = false;
  private connection: AmqpConnection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly handlers: ChangeEventHandler[] = [];
  private subscribed = false;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const rabbitmq = this.config.get('rabbitmq', { infer: true });
    this.url = rabbitmq.url;
    this.exchange = rabbitmq.changesExchange;
  }

  onModuleInit(): void {
    this.running = true;
    void this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.connection?.close().catch(() => undefined);
  }

  /**
   * @about Broadcasts a "this conversation changed" hint to every subscriber.
   * Best-effort by contract: never rejects — a hint dropped while the broker
   * is down costs staleness until the next event, never correctness.
   * @param conversationId - The conversation whose state just changed.
   * @returns Promise<void>
   */
  publish(conversationId: string): Promise<void> {
    try {
      if (!this.channel) throw new Error('change-bus connection not available');
      this.channel.publish(this.exchange, '', Buffer.from(conversationId));
    } catch (error) {
      this.logger.warn(`Change hint dropped: ${String(error)}`);
    }
    return Promise.resolve();
  }

  /**
   * @about Registers a handler for change hints on this instance's own
   * exclusive queue. Multiple subscribers share one consumer and each
   * receives every hint (SSE fanout and cache invalidation both listen).
   * At-most-once: hints published while this instance was down are not
   * replayed. Attaches now or as soon as the connection lands.
   * @param handler - Called with the conversation id of each hint.
   * @returns void
   */
  subscribe(handler: ChangeEventHandler): void {
    this.handlers.push(handler);
    if (this.channel) void this.startConsumer();
  }

  private async connectLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.connect();
        return;
      } catch (error) {
        this.logger.error(
          `Change-bus connect failed, retrying: ${String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(this.url);
    connection.on('error', (error: Error) =>
      this.logger.error(`Change-bus connection error: ${error.message}`),
    );
    connection.on('close', () => {
      this.connection = null;
      this.channel = null;
      this.subscribed = false;
      if (this.running) {
        this.logger.warn('Change-bus connection lost, reconnecting');
        void this.connectLoop();
      }
    });

    const channel = await connection.createChannel();
    await channel.assertExchange(this.exchange, 'fanout', { durable: false });

    this.channel = channel;
    this.connection = connection;
    this.logger.log(`Connected; fanout exchange '${this.exchange}' asserted`);
    if (this.handlers.length > 0) await this.startConsumer();
  }

  private async startConsumer(): Promise<void> {
    if (this.subscribed || !this.channel) return;
    this.subscribed = true;
    // Server-named exclusive queue: dies with this instance's connection, so
    // hints never pile up for a subscriber that is gone.
    const { queue } = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await this.channel.bindQueue(queue, this.exchange, '');
    await this.channel.consume(
      queue,
      (msg) => {
        if (!msg) return;
        const conversationId = msg.content.toString('utf8');
        for (const handler of this.handlers) handler(conversationId);
      },
      { noAck: true },
    );
    this.logger.log(`Subscribed to change hints on '${this.exchange}'`);
  }
}
