import { DataSource } from 'typeorm';
import { MessageEntity } from '../../src/messages/entities/message.entity';
import { MessageDirection } from '../../src/messages/enumerators/message-direction';
import { MessageStatus } from '../../src/messages/enumerators/message-status';
import { MessagesRepository } from '../../src/messages/messages.repository';
import {
  createConversation,
  createTestDataSource,
  insertMessage,
  truncateAll,
} from './database';

describe('MessagesRepository (integration)', () => {
  let dataSource: DataSource;
  let repository: MessagesRepository;

  const phone = '+15550001111';

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repository = new MessagesRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  const messageById = (id: string): Promise<MessageEntity> =>
    dataSource.getRepository(MessageEntity).findOneByOrFail({ id });

  describe('upsertConversation', () => {
    it('creates the conversation on first contact and reuses it afterwards', async () => {
      const first = await repository.upsertConversation(phone);
      const second = await repository.upsertConversation(phone);

      expect(second.id).toBe(first.id);
      expect(second.phone_number).toBe(phone);
      const count: { count: string }[] = await dataSource.query(
        'SELECT count(*) FROM conversations',
      );
      expect(count[0].count).toBe('1');
    });

    it('bumps last_message_at on every contact', async () => {
      const first = await repository.upsertConversation(phone);
      await new Promise((resolve) => setTimeout(resolve, 15));
      const second = await repository.upsertConversation(phone);

      expect(second.last_message_at.getTime()).toBeGreaterThan(
        first.last_message_at.getTime(),
      );
    });

    it('keeps conversations per phone number', async () => {
      const first = await repository.upsertConversation(phone);
      const other = await repository.upsertConversation('+15550002222');
      expect(other.id).not.toBe(first.id);
    });
  });

  describe('insertInboundMessage', () => {
    it('inserts the message once and returns the same row for duplicates', async () => {
      const conversation = await repository.upsertConversation(phone);

      const first = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );
      const duplicate = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );

      expect(duplicate.id).toBe(first.id);
      const count: { count: string }[] = await dataSource.query(
        'SELECT count(*) FROM messages',
      );
      expect(count[0].count).toBe('1');
    });

    it('converges concurrent duplicate deliveries onto one row', async () => {
      const conversation = await repository.upsertConversation(phone);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          repository.insertInboundMessage(conversation.id, 'SM-race', 'hello'),
        ),
      );

      const ids = new Set(results.map((row) => row.id));
      expect(ids.size).toBe(1);
    });
  });

  describe('claimForProcessing', () => {
    const setup = async () => {
      const conversation = await repository.upsertConversation(phone);
      return repository.insertInboundMessage(conversation.id, 'SM1', 'hello');
    };

    it('claims a received message and moves it to processing', async () => {
      const message = await setup();

      await expect(repository.claimForProcessing(message.id, 90)).resolves.toBe(
        true,
      );
      expect((await messageById(message.id)).status).toBe(
        MessageStatus.Processing,
      );
    });

    it('lets exactly one of many concurrent claimers win', async () => {
      const message = await setup();

      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () =>
          repository.claimForProcessing(message.id, 90),
        ),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(1);
    });

    it('refuses a message freshly claimed by another worker', async () => {
      const message = await setup();
      await repository.claimForProcessing(message.id, 90);

      await expect(repository.claimForProcessing(message.id, 90)).resolves.toBe(
        false,
      );
    });

    it('re-claims a failed message (queue retry path)', async () => {
      const message = await setup();
      await repository.claimForProcessing(message.id, 90);
      await repository.markFailed(message.id, null);

      await expect(repository.claimForProcessing(message.id, 90)).resolves.toBe(
        true,
      );
    });

    it('takes over a stale claim left by a dead worker', async () => {
      const message = await setup();
      await repository.claimForProcessing(message.id, 90);
      await dataSource.query(
        `UPDATE messages SET claimed_at = now() - interval '10 minutes' WHERE id = $1`,
        [message.id],
      );

      await expect(repository.claimForProcessing(message.id, 90)).resolves.toBe(
        true,
      );
    });
  });

  describe('getOrCreateOutboundReply', () => {
    it('records one reply row per inbound message, whatever the attempt count', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );

      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          repository.getOrCreateOutboundReply(
            conversation.id,
            inbound.id,
            `reply attempt ${index}`,
          ),
        ),
      );

      const ids = new Set(results.map((row) => row.id));
      expect(ids.size).toBe(1);
      // All attempts see the body the winning insert recorded.
      const bodies = new Set(results.map((row) => row.body));
      expect(bodies.size).toBe(1);
    });

    it('returns the existing row with its status for a retry to inspect', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );
      const first = await repository.getOrCreateOutboundReply(
        conversation.id,
        inbound.id,
        'the reply',
      );
      await repository.markSent(inbound.id, first.id, 'SM_out');

      const retry = await repository.getOrCreateOutboundReply(
        conversation.id,
        inbound.id,
        'regenerated reply that must be ignored',
      );

      expect(retry.id).toBe(first.id);
      expect(retry.status).toBe(MessageStatus.Sent);
      expect(retry.body).toBe('the reply');
    });
  });

  describe('markSent / markFailed', () => {
    it('marks both sides of the exchange sent and records the provider id', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );
      const outbound = await repository.getOrCreateOutboundReply(
        conversation.id,
        inbound.id,
        'the reply',
      );

      await repository.markSent(inbound.id, outbound.id, 'SM_out');

      const inboundRow = await messageById(inbound.id);
      const outboundRow = await messageById(outbound.id);
      expect(inboundRow.status).toBe(MessageStatus.Sent);
      expect(outboundRow.status).toBe(MessageStatus.Sent);
      expect(outboundRow.providerMessageId).toBe('SM_out');
      expect(outboundRow.processedAt).not.toBeNull();
    });

    it('marks only the inbound row failed when no reply was recorded yet', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );

      await repository.markFailed(inbound.id, null);

      expect((await messageById(inbound.id)).status).toBe(MessageStatus.Failed);
    });

    it('marks both rows failed when the send failed after the reply was recorded', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );
      const outbound = await repository.getOrCreateOutboundReply(
        conversation.id,
        inbound.id,
        'the reply',
      );

      await repository.markFailed(inbound.id, outbound.id);

      expect((await messageById(inbound.id)).status).toBe(MessageStatus.Failed);
      expect((await messageById(outbound.id)).status).toBe(
        MessageStatus.Failed,
      );
    });
  });

  describe('conversationHistory', () => {
    it('returns prior turns oldest-first, excluding the message being replied to and its own reply', async () => {
      const conversationId = await createConversation(dataSource, phone);
      const at = (minute: number) => new Date(2026, 6, 1, 12, minute);

      await insertMessage(dataSource, {
        conversationId,
        body: 'first question',
        createdAt: at(0),
      });
      await insertMessage(dataSource, {
        conversationId,
        direction: MessageDirection.Outbound,
        body: 'first answer',
        createdAt: at(1),
      });
      const current = await insertMessage(dataSource, {
        conversationId,
        body: 'current question',
        providerMessageId: 'SM-current',
        createdAt: at(2),
      });
      await insertMessage(dataSource, {
        conversationId,
        direction: MessageDirection.Outbound,
        body: 'in-flight reply to current',
        inReplyTo: current,
        createdAt: at(3),
      });

      const history = await repository.conversationHistory(
        conversationId,
        current,
        20,
      );

      expect(history).toEqual([
        { direction: MessageDirection.Inbound, body: 'first question' },
        { direction: MessageDirection.Outbound, body: 'first answer' },
      ]);
    });

    it('keeps only the most recent turns when over the limit, still oldest-first', async () => {
      const conversationId = await createConversation(dataSource, phone);
      const at = (minute: number) => new Date(2026, 6, 1, 12, minute);
      for (let index = 0; index < 5; index += 1) {
        await insertMessage(dataSource, {
          conversationId,
          body: `turn ${index}`,
          createdAt: at(index),
        });
      }
      const current = await insertMessage(dataSource, {
        conversationId,
        body: 'current',
        createdAt: at(10),
      });

      const history = await repository.conversationHistory(
        conversationId,
        current,
        2,
      );

      expect(history.map((turn) => turn.body)).toEqual(['turn 3', 'turn 4']);
    });

    it('never leaks turns from another conversation', async () => {
      const conversationId = await createConversation(dataSource, phone);
      const otherId = await createConversation(dataSource, '+15550002222');
      await insertMessage(dataSource, {
        conversationId: otherId,
        body: 'someone else entirely',
      });
      const current = await insertMessage(dataSource, {
        conversationId,
        body: 'current',
      });

      await expect(
        repository.conversationHistory(conversationId, current, 20),
      ).resolves.toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('reads the current status straight from the row', async () => {
      const conversation = await repository.upsertConversation(phone);
      const inbound = await repository.insertInboundMessage(
        conversation.id,
        'SM1',
        'hello',
      );

      await expect(repository.getStatus(inbound.id)).resolves.toBe(
        MessageStatus.Received,
      );
    });
  });
});
