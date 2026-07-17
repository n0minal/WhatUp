import { ConfigService } from '@nestjs/config';
import { FakeReplyDriver } from './fake.driver';

describe('FakeReplyDriver', () => {
  let driver: FakeReplyDriver;

  beforeEach(() => {
    const config = {
      get: jest
        .fn()
        .mockReturnValue({ minMs: 0, maxMs: 0, staleClaimSeconds: 90 }),
    } as unknown as ConfigService;
    driver = new FakeReplyDriver(config as never);
  });

  it('confirms a booking', async () => {
    await expect(
      driver.generateReply({ inboundBody: ' book ', history: [] }),
    ).resolves.toMatch(/booked/i);
  });

  it('confirms a cancellation', async () => {
    await expect(
      driver.generateReply({ inboundBody: 'CANCEL', history: [] }),
    ).resolves.toMatch(/cancelled/i);
  });

  it('echoes anything else', async () => {
    await expect(
      driver.generateReply({ inboundBody: 'what time?', history: [] }),
    ).resolves.toContain('what time?');
  });
});
