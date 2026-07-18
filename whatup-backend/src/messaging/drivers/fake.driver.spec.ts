import { FakeDriver } from './fake.driver';

describe('FakeDriver (messaging)', () => {
  let driver: FakeDriver;

  beforeEach(() => {
    driver = new FakeDriver();
  });

  it('fabricates a provider-shaped sid (SM + 32 hex chars)', async () => {
    const { sid } = await driver.sendSms('+15550001111', 'hello');
    expect(sid).toMatch(/^SM[0-9a-f]{32}$/);
  });

  it('issues a distinct sid per send', async () => {
    const first = await driver.sendSms('+15550001111', 'one');
    const second = await driver.sendSms('+15550001111', 'two');
    expect(first.sid).not.toBe(second.sid);
  });
});
