import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity } from '../conversations/entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { QueueModule } from '../queue/queue.module';
import { ReplyModule } from '../reply/reply.module';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    ReplyModule,
    MessagingModule,
    QueueModule,
  ],
  providers: [MessagesRepository, MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
