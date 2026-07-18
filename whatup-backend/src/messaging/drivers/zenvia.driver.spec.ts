import { ConfigService } from '@nestjs/config';
import { ZenviaDriver } from './zenvia.driver';

describe('ZenviaDriver', () => {
  let driver: ZenviaDriver;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue({
        apiBaseUrl: 'http://zenvia.test',
        apiToken: 'token-123',
        fromNumber: 'whatup',
      }),
    } as unknown as ConfigService;
    driver = new ZenviaDriver(config as never);

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'zv-1' }),
    });
    global.fetch = fetchMock;
  });

  it('POSTs the Zenvia SMS channel with token auth and JSON body', async () => {
    await driver.sendSms('+15550001111', 'hello');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://zenvia.test/v2/channels/sms/messages');
    expect((init.headers as Record<string, string>)['X-API-TOKEN']).toBe(
      'token-123',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'whatup',
      to: '+15550001111',
      contents: [{ type: 'text', text: 'hello' }],
    });
  });

  it("maps Zenvia's message id onto the neutral sid", async () => {
    await expect(driver.sendSms('+15550001111', 'hi')).resolves.toEqual({
      sid: 'zv-1',
    });
  });

  it('throws with status and response text when the send is rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('bad token'),
    });

    await expect(driver.sendSms('+15550001111', 'hi')).rejects.toThrow(
      'Zenvia send failed: 401 bad token',
    );
  });
});
