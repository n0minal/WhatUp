import { MessageView } from 'whatup-contracts';
import { Message } from '../../messages/entities/message.entity';

export class MessageViewAdapter {
  public static toModel(message: Message): MessageView {
    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
