import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConversationsRepository } from '../../src/conversations/conversations.repository';
import { ConversationEntity } from '../../src/conversations/entities/conversation.entity';
import { MessageEntity } from '../../src/messages/entities/message.entity';
import { MessageDirection } from '../../src/messages/enumerators/message-direction';
import {
  createConversation,
  createTestDataSource,
  insertMessage,
  truncateAll,
} from './database';

describe('ConversationsRepository (integration)', () => {
  let dataSource: DataSource;
  let repository: ConversationsRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repository = new ConversationsRepository(
      dataSource,
      dataSource.getRepository(ConversationEntity),
      dataSource.getRepository(MessageEntity),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  describe('listWithStats', () => {
    it('returns each conversation with its latest message as preview and a total count', async () => {
      const at = (minute: number) => new Date(2026, 6, 1, 12, minute);
      const conversationId = await createConversation(
        dataSource,
        '+15550001111',
        at(5),
      );
      await insertMessage(dataSource, {
        conversationId,
        body: 'older message',
        createdAt: at(0),
      });
      await insertMessage(dataSource, {
        conversationId,
        direction: MessageDirection.Outbound,
        body: 'the latest message',
        createdAt: at(5),
      });

      const rows = await repository.listWithStats();

      expect(rows).toHaveLength(1);
      expect(rows[0].phone_number).toBe('+15550001111');
      expect(rows[0].last_message_preview).toBe('the latest message');
      // count(*) comes back as a string from pg — the adapter parses it.
      expect(rows[0].message_count).toBe('2');
    });

    it('orders conversations by recency of their last message', async () => {
      const at = (minute: number) => new Date(2026, 6, 1, 12, minute);
      await createConversation(dataSource, '+15550001111', at(0));
      await createConversation(dataSource, '+15550003333', at(10));
      await createConversation(dataSource, '+15550002222', at(5));

      const rows = await repository.listWithStats();

      expect(rows.map((row) => row.phone_number)).toEqual([
        '+15550003333',
        '+15550002222',
        '+15550001111',
      ]);
    });

    it('includes conversations without messages (null preview, zero count)', async () => {
      await createConversation(dataSource, '+15550001111');

      const rows = await repository.listWithStats();

      expect(rows[0].last_message_preview).toBeNull();
      expect(rows[0].message_count).toBe('0');
    });
  });

  describe('findById', () => {
    it('returns the conversation entity', async () => {
      const conversationId = await createConversation(
        dataSource,
        '+15550001111',
      );

      const found = await repository.findById(conversationId);

      expect(found?.phoneNumber).toBe('+15550001111');
    });

    it('returns null for an unknown id', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });
  });

  describe('messagesOf', () => {
    it('returns the full exchange in chronological order', async () => {
      const at = (minute: number) => new Date(2026, 6, 1, 12, minute);
      const conversationId = await createConversation(
        dataSource,
        '+15550001111',
      );
      await insertMessage(dataSource, {
        conversationId,
        body: 'second',
        createdAt: at(1),
      });
      await insertMessage(dataSource, {
        conversationId,
        body: 'first',
        createdAt: at(0),
      });
      await insertMessage(dataSource, {
        conversationId,
        body: 'third',
        createdAt: at(2),
      });

      const messages = await repository.messagesOf(conversationId);

      expect(messages.map((message) => message.body)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    it('returns only messages of that conversation', async () => {
      const conversationId = await createConversation(
        dataSource,
        '+15550001111',
      );
      const otherId = await createConversation(dataSource, '+15550002222');
      await insertMessage(dataSource, { conversationId, body: 'mine' });
      await insertMessage(dataSource, {
        conversationId: otherId,
        body: 'not mine',
      });

      const messages = await repository.messagesOf(conversationId);

      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('mine');
    });
  });
});
