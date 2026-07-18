import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConversationRow } from '../conversations/types/conversation-row';
import { MessageEntity } from './entities/message.entity';
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

  /**
   * @about Find-or-create the conversation for a phone number; bumps last_message_at.
   * @param phoneNumber - The conversation's canonical phone number (E.164).
   * @returns The conversation row, either pre-existing or newly created.
   */
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
   * @about Idempotent insert keyed on provider_message_id. Whether this delivery is
   * the first or a duplicate (carrier re-POST or queue redelivery), it
   * resolves to the same row, which is returned either way.
   * @param conversationId - The conversation to which this message belongs.
   * @param providerMessageId - The carrier's unique id for this message (e.g.Twilio MessageSid).
   * @param body - The text of the inbound message.
   * @returns The row for this inbound message, either pre-existing or newly created.
   */
  async insertInboundMessage(
    conversationId: string,
    providerMessageId: string,
    body: string,
  ): Promise<MessageEntity> {
    await this.dataSource.query(
      `INSERT INTO messages (conversation_id, provider_message_id, direction, body, status)
        VALUES ($1, $2, $4, $3, $5)
       ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING`,
      [
        conversationId,
        providerMessageId,
        body,
        MessageDirection.Inbound,
        MessageStatus.Received,
      ],
    );
    return this.dataSource
      .getRepository(MessageEntity)
      .findOneByOrFail({ providerMessageId });
  }

  /**
   * @about Atomic message claim: take ownership of a message before
   * processing. Returns false when another worker owns it — the caller must
   * drop the delivery.
   * Claimable states:
   *   - 'received': normal case
   *   - 'failed':   a queue retry of an attempt that failed (send outage etc.)
   *   - stale 'processing': claim abandoned by a worker that died after claiming
   * @param messageId - The message to claim.
   * @param staleClaimSeconds - How long a claim can be held before it's considered stale.
   * @returns True if the claim was successful, false if another worker owns it.
   */
  async claimForProcessing(
    messageId: string,
    staleClaimSeconds: number,
  ): Promise<boolean> {
    // For UPDATE, TypeORM's query() resolves to [rows, affectedCount].
    const [claimed]: [unknown[], number] = await this.dataSource.query(
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

    return claimed.length > 0;
  }

  /**
   * @about Record the reply, exactly once per inbound message: in_reply_to is
   * unique, so concurrent attempts converge on a single row, which is
   * returned either way. The caller checks its status — a row already
   * 'sent' means the reply went out on a previous attempt.
   * @param conversationId - The conversation to which this message belongs.
   * @param inReplyTo - The inbound message this replies to.
   * @param body - The text of the outbound message.
   * @returns The row for this outbound message, either pre-existing or newly created.
   */
  async getOrCreateOutboundReply(
    conversationId: string,
    inReplyTo: string,
    body: string,
  ): Promise<MessageEntity> {
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
      .getRepository(MessageEntity)
      .findOneByOrFail({ inReplyTo: inReplyTo });
  }

  /**
   * @about Mark the outbound reply and its inbound trigger as sent, with the
   * provider's id for the outbound message. The inbound row is updated so a
   * retry doesn't try to send another reply.
   * @param inboundId - The inbound message that triggered the reply.
   * @param outboundId - The outbound reply message that was sent.
   * @param providerMessageId - The provider's unique id for the outbound message (e.g. Twilio MessageSid).
   * @returns Promise<void>
   */
  async markSent(
    inboundId: string,
    outboundId: string,
    providerMessageId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(MessageEntity, outboundId, {
        status: MessageStatus.Sent,
        providerMessageId,
        processedAt: new Date(),
      });
      await manager.update(MessageEntity, inboundId, {
        status: MessageStatus.Sent,
        processedAt: new Date(),
      });
    });
  }

  /**
   * @about Mark the inbound message as failed.
   * @param inboundId - The inbound message to mark as failed.
   * @param outboundId - The outbound message to mark as failed, if applicable.
   * @returns Promise<void>
   */
  async markFailed(
    inboundId: string,
    outboundId: string | null,
  ): Promise<void> {
    const ids = outboundId ? [inboundId, outboundId] : [inboundId];
    await this.dataSource
      .getRepository(MessageEntity)
      .update(ids, { status: MessageStatus.Failed, processedAt: new Date() });
  }

  /**
   * @about Recent turns for reply context, oldest first. Excludes the message being
   * replied to AND any reply row already recorded for it (a retry would
   * otherwise see its own in-flight reply as history).
   * @param conversationId - The conversation to which the messages belong.
   * @param excludeMessageId - The message to exclude from the history (the inbound message being replied to).
   * @param limit - The maximum number of turns to return.
   * @returns The recent conversation turns, oldest first.
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

  /**
   * @about Get the status of a message.
   * @param messageId - The message for which to get the status.
   * @returns The status of the message.
   */
  async getStatus(messageId: string): Promise<MessageStatus> {
    const row = await this.dataSource
      .getRepository(MessageEntity)
      .findOneByOrFail({ id: messageId });
    return row.status;
  }
}
