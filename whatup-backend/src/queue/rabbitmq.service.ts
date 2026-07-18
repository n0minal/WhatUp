import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { AppConfig } from '../config/configuration';
import { queueDepth } from '../observability/metrics';
import { MessageQueue, QueueHandler } from './types/message-queue';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

/**
 * RabbitMQ adapter for the MessageQueue port. Same code path in dev
 * (docker-compose broker)
 * and production — only the URL differs. The topology is asserted on connect,
 * so the broker needs no provisioning script.
 *
 * Delivery semantics the pipeline relies on (DESIGN.md §3):
 *   - a delivery is acked only after the handler returns; a handler that
 *     throws gets the message republished to `<queue>.retry`, whose per-queue
 *     TTL dead-letters it back to the main queue (redelivery-after-delay);
 *   - after `maxReceiveCount` attempts the message is parked in `<queue>.dlq`
 *     instead of retried;
 *   - an unacked message whose worker dies is requeued by the broker
 *     immediately — duplicates are absorbed by DB-enforced idempotency.
 */
@Injectable()
export class RabbitMqService
  implements MessageQueue, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly url: string;
  private readonly queue: string;
  private readonly prefetch: number;
  private readonly retryDelayMs: number;
  private readonly maxReceiveCount: number;

  private running = false;
  private connection: AmqpConnection | null = null;
  private publishChannel: amqp.ConfirmChannel | null = null;
  private metricsChannel: amqp.Channel | null = null;
  private consuming = false;
  private handler: QueueHandler | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const rabbitmq = config.get('rabbitmq', { infer: true });
    this.url = rabbitmq.url;
    this.queue = rabbitmq.queue;
    this.prefetch = rabbitmq.prefetch;
    this.retryDelayMs = rabbitmq.retryDelayMs;
    this.maxReceiveCount = rabbitmq.maxReceiveCount;

    // Observed at each metrics export; no-op unless OTel is enabled. A
    // dedicated channel so a failed check can never break publishing.
    queueDepth.addCallback(async (result) => {
      if (!this.metricsChannel) return;
      for (const name of [
        this.queue,
        `${this.queue}.retry`,
        `${this.queue}.dlq`,
      ]) {
        try {
          const { messageCount } = await this.metricsChannel.checkQueue(name);
          result.observe(messageCount, { queue: name });
        } catch {
          return; // channel died (e.g. queue missing); reconnect re-creates it
        }
      }
    });
  }

  onModuleInit(): void {
    this.running = true;
    // Don't block boot on a down broker: the webhook 500s on send (Twilio
    // retries), and the consumer attaches once the connection lands.
    void this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    // Closing the connection requeues any unacked in-flight deliveries.
    await this.connection?.close().catch(() => undefined);
  }

  async send(payload: object): Promise<void> {
    if (!this.publishChannel)
      throw new Error('RabbitMQ connection not available');
    await this.publish(
      this.publishChannel,
      this.queue,
      Buffer.from(JSON.stringify(payload)),
      {},
    );
  }

  async consume(handler: QueueHandler): Promise<void> {
    this.handler = handler;
    if (this.connection) await this.startConsumer();
  }

  private async connectLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.connect();
        return;
      } catch (error) {
        this.logger.error(`Connect failed, retrying: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(this.url);
    connection.on('error', (error: Error) =>
      this.logger.error(`Connection error: ${error.message}`),
    );
    connection.on('close', () => {
      this.connection = null;
      this.publishChannel = null;
      this.metricsChannel = null;
      this.consuming = false;
      if (this.running) {
        this.logger.warn('Connection lost, reconnecting');
        void this.connectLoop();
      }
    });

    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(this.queue, { durable: true });
    await channel.assertQueue(`${this.queue}.retry`, {
      durable: true,
      arguments: {
        'x-message-ttl': this.retryDelayMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': this.queue,
      },
    });
    await channel.assertQueue(`${this.queue}.dlq`, { durable: true });

    this.publishChannel = channel;
    this.metricsChannel = await connection.createChannel();
    this.connection = connection;
    this.logger.log(`Connected; queue '${this.queue}' topology asserted`);
    if (this.handler) await this.startConsumer();
  }

  private async startConsumer(): Promise<void> {
    if (this.consuming || !this.connection) return;
    this.consuming = true;
    // Confirm channel: retry/DLQ republishes are broker-acked before we ack
    // the original, so a crash in between duplicates rather than loses.
    const channel = await this.connection.createConfirmChannel();
    await channel.prefetch(this.prefetch);
    await channel.consume(this.queue, (msg) => {
      if (msg) void this.dispatch(channel, msg);
    });
  }

  private async dispatch(
    channel: amqp.ConfirmChannel,
    msg: amqp.ConsumeMessage,
  ): Promise<void> {
    try {
      await this.handler!(msg.content.toString('utf8'));
    } catch (error) {
      this.logger.warn(
        `Delivery failed, scheduling redelivery: ${String(error)}`,
      );
      // If the channel died mid-republish the broker requeues the unacked
      // original anyway — nothing is lost either way.
      await this.retryOrPark(channel, msg).catch((e) =>
        this.logger.error(`Redelivery scheduling failed: ${String(e)}`),
      );
      return;
    }
    channel.ack(msg);
  }

  private async retryOrPark(
    channel: amqp.ConfirmChannel,
    msg: amqp.ConsumeMessage,
  ): Promise<void> {
    const headers = msg.properties.headers ?? {};
    const attempt = Number(headers['x-attempt'] ?? 1);
    if (attempt >= this.maxReceiveCount) {
      await this.publish(channel, `${this.queue}.dlq`, msg.content, headers);
      this.logger.error(
        `Delivery failed ${attempt} times; parked in ${this.queue}.dlq`,
      );
    } else {
      await this.publish(channel, `${this.queue}.retry`, msg.content, {
        ...headers,
        'x-attempt': attempt + 1,
      });
    }
    channel.ack(msg);
  }

  private publish(
    channel: amqp.ConfirmChannel,
    queue: string,
    content: Buffer,
    headers: amqp.MessagePropertyHeaders,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      channel.sendToQueue(
        queue,
        content,
        { persistent: true, contentType: 'application/json', headers },
        (error) =>
          error
            ? reject(error instanceof Error ? error : new Error(String(error)))
            : resolve(),
      );
    });
  }
}
