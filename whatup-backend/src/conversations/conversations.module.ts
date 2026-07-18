import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageEntity } from '../messages/entities/message.entity';
import { QueueModule } from '../queue/queue.module';
import { ChangeStreamService } from './change-stream.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { ConversationEntity } from './entities/conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    QueueModule,
  ],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationsRepository,
    ChangeStreamService,
  ],
})
export class ConversationsModule {}
