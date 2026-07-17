import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../messages/entities/message.entity';
import { QueueModule } from '../queue/queue.module';
import { ChangeStreamService } from './change-stream.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { Conversation } from './entities/conversation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message]), QueueModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationsRepository,
    ChangeStreamService,
  ],
})
export class ConversationsModule {}
