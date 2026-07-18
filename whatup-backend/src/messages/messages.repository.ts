import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConversationRow } from '../conversations/types/conversation-row';
import { Message } from './entities/message.entity';
import { MessageDirection } from './enumerators/message-direction';
import { MessageStatus } from './enumerators/message-status';
import { ConversationTurnRow } from './types/conversation-turn-row';

/**
 * All idempotency guarantees live here, enforced by Postgres constraints
 * (DESIGN.md §4) — they must hold under concurrent workers, so the database
 * is the arbiter, not application memory.
 */
@Injectable()
export class MessagesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Find-or-create the conversation for a phone number; bumps last_message_at. */
  async upsertConversation(phoneNumber: string): Promise<ConversationRow> {
    const rows: ConversationRow[] = await this.dataSource.query(
      `INSERT INTO conversations (phone_number, last_message_at)
       VALUES ($1, now())
       ON CONFLICT (phone_number)
       DO UPDATE SET last_message_at = now()
       RETURNING id, phone_number, created_at, last_message_at`,
      [phoneNumber],
    );
    return rows[0];
  }

  /**
   * Idempotent insert keyed on twilio_sid. Whether this delivery is the
   * first or a duplicate (Twilio re-POST or queue redelivery), it resolves to
   * the same row, which is returned either way.
   */
  async insertInboundMessage(
    conversationId: string,
    twilioSid: string,
    body: string,
  ): Promise<Message> {
    await this.dataSource.query(
      `INSERT INTO messages (conversation_id, twilio_sid, direction, body, status)
       VALUES ($1, $2, $4, $3, $5)
       ON CONFLICT (twilio_sid) WHERE twilio_sid IS NOT NULL DO NOTHING`,
      [
        conversationId,
        twilioSid,
        body,
        MessageDirection.Inbound,
        MessageStatus.Received,
      ],
    );
    return this.dataSource
      .getRepository(Message)
      .findOneByOrFail({ twilioSid: twilioSid });
  }

  /**
   * Atomic claim (DESIGN.md §4): take ownership of a message before
   * processing. Returns false when another worker owns it — the caller must
   * drop the delivery. Claimable states:
   *   - 'received': normal case
   *   - 'failed':   a queue retry of an attempt that failed (send outage etc.)
   *   - stale 'processing': claim abandoned by a worker that died after claiming
   */
  async claimForProcessing(
    messageId: string,
    staleClaimSeconds: number,
  ): Promise<boolean> {
    const result: unknown[] = await this.dataSource.query(
      `UPDATE messages
       SET status = $3, claimed_at = now()
       WHERE id = $1
         AND (status IN ($4, $5)
              OR (status = $3
                  AND claimed_at < now() - make_interval(secs => $2)))
       RETURNING id`,
      [
        messageId,
        staleClaimSeconds,
        MessageStatus.Processing,
        MessageStatus.Received,
        MessageStatus.Failed,
      ],
    );
    return result.length > 0;
  }

  /**
   * Record the reply, exactly once per inbound message: in_reply_to is
   * unique, so concurrent attempts converge on a single row, which is
   * returned either way. The caller checks its status — a row already
   * 'sent' means the reply went out on a previous attempt.
   */
  async getOrCreateOutboundReply(
    conversationId: string,
    inReplyTo: string,
    body: string,
  ): Promise<Message> {
    await this.dataSource.query(
      `INSERT INTO messages (conversation_id, direction, body, status, in_reply_to)
       VALUES ($1, $4, $2, $5, $3)
       ON CONFLICT (in_reply_to) WHERE in_reply_to IS NOT NULL DO NOTHING`,
      [
        conversationId,
        body,
        inReplyTo,
        MessageDirection.Outbound,
        MessageStatus.Processing,
      ],
    );
    return this.dataSource
      .getRepository(Message)
      .findOneByOrFail({ inReplyTo: inReplyTo });
  }

  async markSent(
    inboundId: string,
    outboundId: string,
    twilioSid: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Message, outboundId, {
        status: MessageStatus.Sent,
        twilioSid,
        processedAt: new Date(),
      });
      await manager.update(Message, inboundId, {
        status: MessageStatus.Sent,
        processedAt: new Date(),
      });
    });
  }

  async markFailed(
    inboundId: string,
    outboundId: string | null,
  ): Promise<void> {
    const ids = outboundId ? [inboundId, outboundId] : [inboundId];
    await this.dataSource
      .getRepository(Message)
      .update(ids, { status: MessageStatus.Failed, processedAt: new Date() });
  }

  /**
   * Recent turns for reply context, oldest first. Excludes the message being
   * replied to AND any reply row already recorded for it (a retry would
   * otherwise see its own in-flight reply as history).
   */
  async conversationHistory(
    conversationId: string,
    excludeMessageId: string,
    limit: number,
  ): Promise<ConversationTurnRow[]> {
    const rows: ConversationTurnRow[] = await this.dataSource.query(
      `SELECT direction, body FROM messages
         WHERE conversation_id = $1
           AND id != $2
           AND (in_reply_to IS NULL OR in_reply_to != $2)
         ORDER BY created_at DESC
         LIMIT $3`,
      [conversationId, excludeMessageId, limit],
    );
    return rows.reverse();
  }

  async getStatus(messageId: string): Promise<MessageStatus> {
    const row = await this.dataSource
      .getRepository(Message)
      .findOneByOrFail({ id: messageId });
    return row.status;
  }
}
