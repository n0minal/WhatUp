import { InboundSmsAdapter } from './inbound-sms.adapter';

describe('InboundSmsAdapter', () => {
  const payload = {
    providerMessageId: 'SM123',
    from: '+15550001111',
    to: '+15550000001',
    body: 'hello',
  };

  it('parses a valid queue payload', () => {
    expect(InboundSmsAdapter.toModel(JSON.stringify(payload))).toEqual(payload);
  });

  it('drops unknown fields', () => {
    const withExtra = JSON.stringify({ ...payload, Unexpected: 'x' });
    expect(InboundSmsAdapter.toModel(withExtra)).toEqual(payload);
  });

  it('accepts an empty body (a bodyless SMS is still a message)', () => {
    const model = InboundSmsAdapter.toModel(
      JSON.stringify({ ...payload, body: '' }),
    );
    expect(model.body).toBe('');
  });

  it.each([
    ['missing providerMessageId', { ...payload, providerMessageId: undefined }],
    ['missing from', { ...payload, from: undefined }],
    ['missing body', { ...payload, body: undefined }],
  ])('throws on a payload with %s', (_label, broken) => {
    expect(() => InboundSmsAdapter.toModel(JSON.stringify(broken))).toThrow(
      /Malformed queue payload/,
    );
  });

  it('throws on non-JSON input', () => {
    expect(() => InboundSmsAdapter.toModel('not json')).toThrow();
  });
});
