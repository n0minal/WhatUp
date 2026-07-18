import { ConfigService } from '@nestjs/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MessageDirection } from '../../messages/enumerators/message-direction';
import { ClaudeReplyDriver } from './claude.driver';

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: jest.fn() }));

describe('ClaudeReplyDriver', () => {
  const queryMock = query as jest.Mock;
  let driver: ClaudeReplyDriver;

  const emitting = (...messages: object[]) => ({
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield* messages;
    },
  });

  const success = (result: string) => ({
    type: 'result',
    subtype: 'success',
    result,
    duration_ms: 42,
  });

  interface QueryArgs {
    prompt: string;
    options: {
      model: string;
      tools: unknown[];
      maxTurns: number;
      env: Record<string, string>;
    };
  }

  const queryArgs = (): QueryArgs =>
    (queryMock.mock.calls[0] as unknown[])[0] as QueryArgs;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue({ claude: { model: 'haiku' } }),
    } as unknown as ConfigService;
    driver = new ClaudeReplyDriver(config as never);
    queryMock.mockReset();
    queryMock.mockReturnValue(emitting(success('Sure, see you at 3!')));
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  });

  it('returns the trimmed reply text on success', async () => {
    queryMock.mockReturnValue(emitting(success('  hi there  ')));

    await expect(
      driver.generateReply({ inboundBody: 'hello', history: [] }),
    ).resolves.toBe('hi there');
  });

  it('sends a bare prompt when there is no history', async () => {
    await driver.generateReply({ inboundBody: 'hello', history: [] });

    expect(queryArgs().prompt).toBe('hello');
  });

  it('renders history as a Them/You transcript', async () => {
    await driver.generateReply({
      inboundBody: 'and tomorrow?',
      history: [
        { direction: MessageDirection.Inbound, body: 'open today?' },
        { direction: MessageDirection.Outbound, body: 'Yes, until 6.' },
      ],
    });

    const { prompt } = queryArgs();
    expect(prompt).toContain('Them: open today?');
    expect(prompt).toContain('You: Yes, until 6.');
    expect(prompt).toContain('and tomorrow?');
  });

  it('strips API credentials from the subprocess env (subscription billing only)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-would-bill-the-api';
    process.env.ANTHROPIC_AUTH_TOKEN = 'also-not-allowed';

    await driver.generateReply({ inboundBody: 'hello', history: [] });

    const { env } = queryArgs().options;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
  });

  it('runs a single tool-less turn', async () => {
    await driver.generateReply({ inboundBody: 'hello', history: [] });

    const { options } = queryArgs();
    expect(options.model).toBe('haiku');
    expect(options.tools).toEqual([]);
    expect(options.maxTurns).toBe(1);
  });

  it('throws when Claude returns an empty reply', async () => {
    queryMock.mockReturnValue(emitting(success('   ')));

    await expect(
      driver.generateReply({ inboundBody: 'hello', history: [] }),
    ).rejects.toThrow('empty reply');
  });

  it('throws when the query reports a failure subtype', async () => {
    queryMock.mockReturnValue(
      emitting({
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['boom'],
      }),
    );

    await expect(
      driver.generateReply({ inboundBody: 'hello', history: [] }),
    ).rejects.toThrow('Claude query failed (error_during_execution): boom');
  });

  it('throws when the stream ends without a result message', async () => {
    queryMock.mockReturnValue(emitting({ type: 'assistant' }));

    await expect(
      driver.generateReply({ inboundBody: 'hello', history: [] }),
    ).rejects.toThrow('without a result');
  });
});
