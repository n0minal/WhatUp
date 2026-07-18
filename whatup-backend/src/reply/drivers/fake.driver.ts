import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { ReplyContext, ReplyGenerator } from '../types/reply-generator';

/**
 * Fake driver for the ReplyGenerator port — simulates the processing step.
 * Sleeps 3–15 s per the brief, then produces a deterministic reply.
 */
@Injectable()
export class FakeReplyDriver implements ReplyGenerator {
  private readonly minMs: number;
  private readonly maxMs: number;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const processing = this.config.get('processing', { infer: true });
    this.minMs = processing.minMs;
    this.maxMs = processing.maxMs;
  }

  /**
   * @about Generates a deterministic keyword reply (BOOK/CANCEL/echo) after
   * the simulated processing delay. Conversation history is ignored here.
   * @param context - The inbound body; prior turns are not used.
   * @returns The canned reply text.
   */
  async generateReply({ inboundBody }: ReplyContext): Promise<string> {
    const delay = this.minMs + Math.random() * (this.maxMs - this.minMs);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const normalized = inboundBody.trim().toUpperCase();
    if (normalized === 'BOOK') {
      return 'You are booked! Reply CANCEL to cancel.';
    }
    if (normalized === 'CANCEL') {
      return 'Your booking has been cancelled. Reply BOOK to schedule a new one.';
    }
    return `Thanks for your message! You said: "${inboundBody.trim()}". Reply BOOK to make a booking.`;
  }
}
