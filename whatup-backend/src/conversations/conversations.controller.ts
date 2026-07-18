import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChangeStreamService } from './change-stream.service';
import { ConversationsService } from './conversations.service';
import {
  ConversationDetail,
  ConversationSummary,
} from './types/conversation-views';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly changeStream: ChangeStreamService,
  ) {}

  @Get()
  list(): Promise<ConversationSummary[]> {
    return this.conversations.list();
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.changeStream.sseEvents();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDetail> {
    return this.conversations.get(id);
  }
}
