import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MESSAGING_CLIENT } from '../messaging/tokens';
import { type MessagingClient } from '../messaging/types/messaging-client';
import { REPLY_GENERATOR } from '../reply/tokens';
import { type ReplyGenerator } from '../reply/types/reply-generator';
import { MessageStatus } from './enumerators/message-status';
import { MessagesRepository } from './messages.repository';
import { InboundSms } from './types/inbound-sms';

/**
 * The worker-side pipeline (DESIGN.md §2–4). Runs once per queue delivery;
 * safe to run any number of times per message — every step is idempotent or
 * guarded by the claim.
 *
 * Throwing = "redeliver me later" (the queue copy is not acked).
 * Returning = "this delivery is finished" (processed, duplicate, or
 * terminally failed — all recorded in Postgres first).
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly staleClaimSeconds: number;
  private readonly historyLimit: number;

  constructor(
    private readonly repository: MessagesRepository,
    @Inject(REPLY_GENERATOR) private readonly replyGenerator: ReplyGenerator,
    @Inject(MESSAGING_CLIENT) private readonly messaging: MessagingClient,
    config: ConfigService<AppConfig, true>,
  ) {
    this.staleClaimSeconds = config.get('processing', {
      infer: true,
    }).staleClaimSeconds;
    this.historyLimit = config.get('reply', { infer: true }).historyLimit;
  }

  async handleInbound(sms: InboundSms): Promise<void> {
    // 1. Persist — idempotent on twilio_sid; duplicates resolve to the same row.
    const conversation = await this.repository.upsertConversation(sms.from);
    const message = await this.repository.insertInboundMessage(
      conversation.id,
      sms.messageSid,
      sms.body,
    );

    // 2. Claim — exactly one live worker may pass this point per message.
    const claimed = await this.repository.claimForProcessing(
      message.id,
      this.staleClaimSeconds,
    );
    if (!claimed) {
      this.logger.log(
        `Duplicate delivery of ${sms.messageSid} dropped (claim failed)`,
      );
      return;
    }

    // 3. Process (3–15s), record the reply, send it.
    let outboundId: string | null = null;
    try {
      // Conversation context is rebuilt from Postgres per delivery, so a
      // retry or another worker regenerates the identical context.
      const history = await this.repository.conversationHistory(
        conversation.id,
        message.id,
        this.historyLimit,
      );
      const replyBody = await this.replyGenerator.generateReply({
        inboundBody: sms.body,
        history,
      });

      // Unique in_reply_to: all attempts converge on one reply row. If a
      // previous attempt already sent it, stop here.
      const outbound = await this.repository.getOrCreateOutboundReply(
        conversation.id,
        message.id,
        replyBody,
      );
      if (outbound.status === MessageStatus.Sent) {
        this.logger.log(`Reply to ${message.id} already sent; skipping`);
        return;
      }
      outboundId = outbound.id;

      const { sid } = await this.messaging.sendSms(sms.from, outbound.body);
      await this.repository.markSent(message.id, outbound.id, sid);
      this.logger.log(`Replied to ${sms.messageSid} (${sid})`);
    } catch (error) {
      // Record the failure, then rethrow so the queue redelivers (and
      // eventually DLQs). The stale-claim clause lets the retry re-claim this row.
      await this.repository
        .markFailed(message.id, outboundId)
        .catch(() => undefined);
      throw error;
    }
  }
}
