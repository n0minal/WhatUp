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

/**
 * Admin read API — consumed by whatup-admin, which refetches on SSE change
 * events (GET /conversations/events).
 *
 * Read-only by design: the Twilio webhook is the single ingestion door.
 * Sending as a user (admin-UI composer) goes through twilio-mock's
 * /simulate/inbound, which delivers the standard webhook — so every message
 * enters the system the same way, carrier -> webhook -> queue.
 */
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

  /**
   * SSE change feed: {kind:'change', conversationId} on every message write,
   * plus keepalive pings. Declared before :id so the static path wins.
   */
  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.changeStream.sseEvents();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDetail> {
    return this.conversations.get(id);
  }
}
