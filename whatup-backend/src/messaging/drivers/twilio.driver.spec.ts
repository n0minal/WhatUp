import { ConfigService } from '@nestjs/config';
import { TwilioDriver } from './twilio.driver';

describe('TwilioDriver', () => {
  let driver: TwilioDriver;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue({
        apiBaseUrl: 'http://twilio.test',
        accountSid: 'AC_test',
        authToken: 'secret',
        fromNumber: '+15550000001',
      }),
    } as unknown as ConfigService;
    driver = new TwilioDriver(config as never);

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sid: 'SM_sent' }),
    });
    global.fetch = fetchMock;
  });

  it('POSTs the Twilio Messages endpoint with basic auth and form body', async () => {
    await driver.sendSms('+15550001111', 'hello there');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://twilio.test/2010-04-01/Accounts/AC_test/Messages.json',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('AC_test:secret').toString('base64')}`,
    );
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('+15550001111');
    expect(body.get('From')).toBe('+15550000001');
    expect(body.get('Body')).toBe('hello there');
  });

  it('returns the sid Twilio assigned', async () => {
    await expect(driver.sendSms('+15550001111', 'hi')).resolves.toEqual({
      sid: 'SM_sent',
    });
  });

  it('throws with status and response text when the send is rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid number'),
    });

    await expect(driver.sendSms('bad', 'hi')).rejects.toThrow(
      'Twilio send failed: 400 invalid number',
    );
  });
});
