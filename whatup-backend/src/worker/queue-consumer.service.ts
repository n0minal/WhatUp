import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { AppMode } from '../config/enumerators/app-mode';
import { parseInboundSms } from '../messages/inbound-sms';
import { MessagesService } from '../messages/messages.service';
import { MESSAGE_QUEUE } from '../queue/tokens';
import { type MessageQueue } from '../queue/types/message-queue';

/**
 * Registers the pipeline as the queue consumer. Deletion discipline
 * (DESIGN.md §3): a delivery is acked only after MessagesService returns —
 * i.e. after the outcome is durably in Postgres. Throwing hands the message
 * back to the queue adapter, which schedules a delayed redelivery and parks
 * it in the DLQ after maxReceiveCount attempts.
 */
@Injectable()
export class QueueConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueueConsumerService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(MESSAGE_QUEUE)
    private readonly queue: MessageQueue,
    private readonly messages: MessagesService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    const mode = this.config.get('mode', { infer: true });
    this.enabled = [AppMode.Worker, AppMode.All].includes(mode);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    // Deliveries process concurrently up to the channel prefetch; idempotency
    // is DB-enforced, so concurrency needs no coordination here.
    await this.queue.consume(async (body) => {
      const sms = parseInboundSms(body);
      await this.messages.handleInbound(sms);
    });
    this.logger.log('Queue consumer registered');
  }
}
