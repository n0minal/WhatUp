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

  /**
   * @about Lists all conversations as summaries for the admin UI.
   * @returns The conversation summaries, newest activity first.
   */
  @Get()
  list(): Promise<ConversationSummary[]> {
    return this.conversations.list();
  }

  /**
   * @about SSE stream of change hints; the UI re-fetches on each event.
   * Declared before the :id route so 'events' is not parsed as a UUID.
   * @returns An observable of change events and keepalive pings.
   */
  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.changeStream.sseEvents();
  }

  /**
   * @about Fetches one conversation with its full message history.
   * @param id - The UUID of the conversation to fetch.
   * @returns The conversation detail with its messages in chronological order.
   */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDetail> {
    return this.conversations.get(id);
  }
}
