import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { filter, take, toArray } from 'rxjs/operators';
import { AppMode } from '../config/enumerators/app-mode';
import {
  ChangeEventBus,
  ChangeEventHandler,
} from '../queue/types/change-event-bus';
import { ChangeStreamService } from './change-stream.service';

describe('ChangeStreamService', () => {
  let bus: jest.Mocked<ChangeEventBus>;

  const build = (mode: AppMode): ChangeStreamService => {
    const config = {
      get: jest.fn().mockReturnValue(mode),
    } as unknown as ConfigService;
    return new ChangeStreamService(bus, config as never);
  };

  beforeEach(() => {
    bus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
  });

  it.each([AppMode.Api, AppMode.All])(
    'subscribes to the change bus in %s mode',
    (mode) => {
      build(mode).onModuleInit();
      expect(bus.subscribe).toHaveBeenCalledTimes(1);
    },
  );

  it('does not subscribe in worker mode (no SSE clients to serve)', () => {
    build(AppMode.Worker).onModuleInit();
    expect(bus.subscribe).not.toHaveBeenCalled();
  });

  it('turns bus hints into SSE change events', async () => {
    const service = build(AppMode.Api);
    service.onModuleInit();
    const handler = bus.subscribe.mock.calls[0][0];

    const events = firstValueFrom(service.sseEvents().pipe(take(2), toArray()));
    handler('conv-1');
    handler('conv-2');

    await expect(events).resolves.toEqual([
      { data: { kind: 'change', conversationId: 'conv-1' } },
      { data: { kind: 'change', conversationId: 'conv-2' } },
    ]);
  });

  it('fans a single hint out to every connected stream', async () => {
    const service = build(AppMode.All);
    service.onModuleInit();
    const handler: ChangeEventHandler = bus.subscribe.mock.calls[0][0];

    const change = (data: unknown) =>
      (data as { data: { kind: string } }).data.kind === 'change';
    const first = firstValueFrom(
      service.sseEvents().pipe(filter(change), take(1)),
    );
    const second = firstValueFrom(
      service.sseEvents().pipe(filter(change), take(1)),
    );
    handler('conv-9');

    await expect(first).resolves.toEqual({
      data: { kind: 'change', conversationId: 'conv-9' },
    });
    await expect(second).resolves.toEqual({
      data: { kind: 'change', conversationId: 'conv-9' },
    });
  });
});
