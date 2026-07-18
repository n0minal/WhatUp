import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { AppConfig } from '../config/configuration';
import {
  messagesProcessed,
  pipelineDuration,
  replyDuration,
} from '../observability/metrics';
import { MESSAGING_CLIENT } from '../messaging/tokens';
import { type MessagingClient } from '../messaging/types/messaging-client';
import { CHANGE_EVENT_BUS } from '../queue/tokens';
import { type ChangeEventBus } from '../queue/types/change-event-bus';
import { REPLY_GENERATOR } from '../reply/tokens';
import { type ReplyGenerator } from '../reply/types/reply-generator';
import { ConversationAdapter } from '../conversations/adapters/conversation.adapter';
import { ConversationTurnAdapter } from './adapters/conversation-turn.adapter';
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
  private readonly tracer = trace.getTracer('whatup');
  private readonly staleClaimSeconds: number;
  private readonly historyLimit: number;
  private readonly replyDriver: string;

  constructor(
    private readonly repository: MessagesRepository,
    @Inject(REPLY_GENERATOR)
    private readonly replyGenerator: ReplyGenerator,
    @Inject(MESSAGING_CLIENT)
    private readonly messaging: MessagingClient,
    @Inject(CHANGE_EVENT_BUS)
    private readonly changes: ChangeEventBus,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.staleClaimSeconds = this.config.get('processing', {
      infer: true,
    }).staleClaimSeconds;
    const reply = this.config.get('reply', { infer: true });
    this.historyLimit = reply.historyLimit;
    this.replyDriver = reply.driver;
  }

  async handleInbound(sms: InboundSms): Promise<void> {
    // 1. Persist — idempotent on provider_message_id; duplicates resolve to the same row.
    const conversation = ConversationAdapter.toModel(
      await this.repository.upsertConversation(sms.from),
    );
    const message = await this.repository.insertInboundMessage(
      conversation.id,
      sms.providerMessageId,
      sms.body,
    );
    // A change hint follows every visible state transition. Best-effort by
    // contract: a dropped hint never fails the pipeline.
    await this.changes.publish(conversation.id);

    // 2. Claim — exactly one live worker may pass this point per message (atomic).
    const claimed = await this.repository.claimForProcessing(
      message.id,
      this.staleClaimSeconds,
    );
    if (!claimed) {
      this.logger.log(
        `Duplicate delivery of ${sms.providerMessageId} dropped (claim failed)`,
      );
      messagesProcessed.add(1, { outcome: 'duplicate' });
      return;
    }
    await this.changes.publish(conversation.id);

    // 3. Process (3–15s), record the reply, send it.
    const startedAt = Date.now();
    let outboundId: string | null = null;
    try {
      // Conversation context is rebuilt from Postgres per delivery, so a
      // retry or another worker regenerates the identical context.
      const rows = await this.repository.conversationHistory(
        conversation.id,
        message.id,
        this.historyLimit,
      );
      const history = rows.map((row) => ConversationTurnAdapter.toModel(row));
      const replyBody = await this.generateReplyTraced(sms, conversation.id, {
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
        messagesProcessed.add(1, { outcome: 'duplicate' });
        return;
      }
      outboundId = outbound.id;
      await this.changes.publish(conversation.id);

      const { sid } = await this.messaging.sendSms(sms.from, outbound.body);
      await this.repository.markSent(message.id, outbound.id, sid);
      await this.changes.publish(conversation.id);
      messagesProcessed.add(1, { outcome: 'sent' });
      pipelineDuration.record((Date.now() - startedAt) / 1000);
      this.logger.log(`Replied to ${sms.providerMessageId} (${sid})`);
    } catch (error) {
      // Record the failure, then rethrow so the queue redelivers (and
      // eventually DLQs). The stale-claim clause lets the retry re-claim this row.
      await this.repository
        .markFailed(message.id, outboundId)
        .catch(() => undefined);
      await this.changes.publish(conversation.id);
      messagesProcessed.add(1, { outcome: 'failed' });
      throw error;
    }
  }

  private async generateReplyTraced(
    sms: InboundSms,
    conversationId: string,
    context: Parameters<ReplyGenerator['generateReply']>[0],
  ): Promise<string> {
    return this.tracer.startActiveSpan(
      'reply.generate',
      {
        attributes: {
          'whatup.reply.driver': this.replyDriver,
          'whatup.conversation.id': conversationId,
          'whatup.message.provider_id': sms.providerMessageId,
          'whatup.history.turns': context.history.length,
        },
      },
      async (span) => {
        const startedAt = Date.now();
        try {
          const reply = await this.replyGenerator.generateReply(context);
          span.setStatus({ code: SpanStatusCode.OK });
          return reply;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          replyDuration.record((Date.now() - startedAt) / 1000, {
            driver: this.replyDriver,
          });
          span.end();
        }
      },
    );
  }
}
