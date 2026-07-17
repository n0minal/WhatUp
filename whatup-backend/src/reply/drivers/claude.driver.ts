import { query } from '@anthropic-ai/claude-agent-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MessageDirection } from '../../messages/enumerators/message-direction';
import { ReplyContext, ReplyGenerator } from '../types/reply-generator';

const SYSTEM_PROMPT = `You are replying to an incoming SMS on behalf of this phone number's owner.
Reply the way a friendly, attentive person texts: natural, conversational, and
helpful. Keep it short — one or two sentences, under 300 characters. Plain
text only: no markdown, no lists, no assistant-style preambles like
"Here's my response". Just text back like a normal person would.

When a "Conversation so far" transcript is provided, stay consistent with it:
remember what was already said, don't re-introduce yourself, and answer
follow-ups in context.`;

/**
 * Claude driver for the ReplyGenerator port, via the Claude Agent SDK.
 *
 * The SDK spawns the Claude Code CLI, which authenticates with the machine's
 * Claude Code login — so usage draws from the Claude subscription plan, not
 * per-token API billing. To guarantee that, the subprocess environment is
 * built WITHOUT ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN: a stray key would
 * silently switch billing to usage-based API rates.
 *
 * A thrown error follows the pipeline's failure path: the message is marked
 * failed and the queue redelivers (then DLQs) — same as any other processing
 * failure.
 */
@Injectable()
export class ClaudeReplyDriver implements ReplyGenerator {
  private readonly logger = new Logger(ClaudeReplyDriver.name);
  private readonly model: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.model = config.get('reply', { infer: true }).claude.model;
  }

  async generateReply(context: ReplyContext): Promise<string> {
    // Abort well under STALE_CLAIM_SECONDS (90 s): a hung query must fail and
    // release the claim before another worker can take the row over.
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 60_000);

    try {
      const conversation = query({
        prompt: this.buildPrompt(context),
        options: {
          model: this.model,
          systemPrompt: SYSTEM_PROMPT,
          // Pure text generation: no built-in tools, single turn.
          tools: [],
          maxTurns: 1,
          abortController,
          env: this.subscriptionOnlyEnv(),
        },
      });

      for await (const message of conversation) {
        if (message.type !== 'result') continue;
        if (message.subtype === 'success') {
          const text = message.result.trim();
          if (!text) throw new Error('Claude returned an empty reply');
          this.logger.log(
            `Generated reply with ${this.model} in ${message.duration_ms}ms`,
          );
          return text;
        }
        throw new Error(
          `Claude query failed (${message.subtype}): ${message.errors.join('; ')}`,
        );
      }
      throw new Error('Claude query ended without a result message');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Each query is stateless: the transcript is rendered into the prompt from
   * the context the pipeline rebuilt out of Postgres. No SDK sessions — a
   * retry or a different worker produces the identical prompt.
   */
  private buildPrompt({ inboundBody, history }: ReplyContext): string {
    if (history.length === 0) return inboundBody;
    const transcript = history
      .map(
        (turn) =>
          `${turn.direction === MessageDirection.Inbound ? 'Them' : 'You'}: ${turn.body}`,
      )
      .join('\n');
    return `Conversation so far:\n${transcript}\n\nThey just texted:\n${inboundBody}\n\nWrite your reply.`;
  }

  /**
   * The SDK's `env` option REPLACES the subprocess environment (no merge), so
   * pass everything through except API-key credentials — leaving only the
   * Claude Code login as the possible auth source.
   */
  private subscriptionOnlyEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      if (key === 'ANTHROPIC_API_KEY' || key === 'ANTHROPIC_AUTH_TOKEN')
        continue;
      env[key] = value;
    }
    return env;
  }
}
