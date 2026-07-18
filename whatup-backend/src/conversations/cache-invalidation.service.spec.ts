import { ConfigService } from '@nestjs/config';
import { CacheStore } from '../cache/types/cache-store';
import { AppMode } from '../config/enumerators/app-mode';
import { ChangeEventBus } from '../queue/types/change-event-bus';
import { CacheInvalidationService } from './cache-invalidation.service';
import { conversationKey, CONVERSATIONS_LIST_KEY } from './cache-keys';

describe('CacheInvalidationService', () => {
  let bus: jest.Mocked<ChangeEventBus>;
  let cache: jest.Mocked<CacheStore>;

  const build = (mode: AppMode): CacheInvalidationService => {
    const config = {
      get: jest.fn().mockReturnValue(mode),
    } as unknown as ConfigService;
    return new CacheInvalidationService(bus, cache, config as never);
  };

  beforeEach(() => {
    bus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
  });

  it.each([AppMode.Api, AppMode.All])(
    'listens for change hints in %s mode',
    (mode) => {
      build(mode).onModuleInit();
      expect(bus.subscribe).toHaveBeenCalledTimes(1);
    },
  );

  it('does not listen in worker mode (nothing cached there)', () => {
    build(AppMode.Worker).onModuleInit();
    expect(bus.subscribe).not.toHaveBeenCalled();
  });

  it('evicts the list and the hinted conversation on every hint', () => {
    build(AppMode.Api).onModuleInit();
    const handler = bus.subscribe.mock.calls[0][0];

    handler('conv-42');

    expect(cache.delete).toHaveBeenCalledWith(
      CONVERSATIONS_LIST_KEY,
      conversationKey('conv-42'),
    );
  });
});
