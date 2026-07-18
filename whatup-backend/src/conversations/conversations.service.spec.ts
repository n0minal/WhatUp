import { NotFoundException } from '@nestjs/common';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from '../messages/entities/message.entity';
import { MessageDirection } from '../messages/enumerators/message-direction';
import { MessageStatus } from '../messages/enumerators/message-status';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { ConversationListRow } from './types/conversation-views';

describe('ConversationsService', () => {
  let repository: jest.Mocked<ConversationsRepository>;
  let service: ConversationsService;

  const conversation = {
    id: 'b3a1b6a6-0000-4000-8000-000000000001',
    phoneNumber: '+15550001111',
    createdAt: new Date('2026-07-01T10:00:00Z'),
    lastMessageAt: new Date('2026-07-01T10:05:00Z'),
  } as ConversationEntity;

  const message = (overrides: Partial<MessageEntity>): MessageEntity =>
    ({
      id: 'msg-1',
      conversationId: conversation.id,
      direction: MessageDirection.Inbound,
      body: 'hello',
      status: MessageStatus.Sent,
      createdAt: new Date('2026-07-01T10:00:00Z'),
      ...overrides,
    }) as MessageEntity;

  beforeEach(() => {
    repository = {
      listWithStats: jest.fn(),
      findById: jest.fn(),
      messagesOf: jest.fn(),
    } as unknown as jest.Mocked<ConversationsRepository>;
    service = new ConversationsService(repository);
  });

  describe('list', () => {
    it('adapts repository rows into conversation summaries', async () => {
      const row: ConversationListRow = {
        id: conversation.id,
        phone_number: '+15550001111',
        last_message_preview: 'latest text',
        last_message_at: '2026-07-01T10:05:00.000Z',
        message_count: '4',
      };
      repository.listWithStats.mockResolvedValue([row]);

      await expect(service.list()).resolves.toEqual([
        {
          id: conversation.id,
          phoneNumber: '+15550001111',
          lastMessagePreview: 'latest text',
          lastMessageAt: '2026-07-01T10:05:00.000Z',
          messageCount: 4,
        },
      ]);
    });

    it('returns an empty list when there are no conversations', async () => {
      repository.listWithStats.mockResolvedValue([]);
      await expect(service.list()).resolves.toEqual([]);
    });
  });

  describe('get', () => {
    it('throws NotFoundException for an unknown conversation', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.get('missing-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.messagesOf).not.toHaveBeenCalled();
    });

    it('returns the conversation with its messages as views', async () => {
      repository.findById.mockResolvedValue(conversation);
      repository.messagesOf.mockResolvedValue([
        message({ id: 'msg-1', body: 'hi' }),
        message({
          id: 'msg-2',
          body: 'hi back',
          direction: MessageDirection.Outbound,
          createdAt: new Date('2026-07-01T10:05:00Z'),
        }),
      ]);

      const detail = await service.get(conversation.id);

      expect(detail.conversation).toEqual({
        id: conversation.id,
        phoneNumber: '+15550001111',
        lastMessagePreview: 'hi back',
        lastMessageAt: '2026-07-01T10:05:00.000Z',
        messageCount: 2,
      });
      expect(detail.messages).toHaveLength(2);
      expect(detail.messages[1]).toMatchObject({
        id: 'msg-2',
        direction: MessageDirection.Outbound,
        body: 'hi back',
      });
    });

    it('uses an empty preview for a conversation without messages', async () => {
      repository.findById.mockResolvedValue(conversation);
      repository.messagesOf.mockResolvedValue([]);

      const detail = await service.get(conversation.id);

      expect(detail.conversation.lastMessagePreview).toBe('');
      expect(detail.conversation.messageCount).toBe(0);
      expect(detail.messages).toEqual([]);
    });
  });
});
