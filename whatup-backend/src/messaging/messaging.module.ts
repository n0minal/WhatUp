import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { FakeDriver } from './drivers/fake.driver';
import { TwilioDriver } from './drivers/twilio.driver';
import { ZenviaDriver } from './drivers/zenvia.driver';
import { MessagingDriver } from './enumerators/messaging-driver';
import { MessagingClient } from './types/messaging-client';
import { MESSAGING_CLIENT } from './tokens';

@Module({
  providers: [
    TwilioDriver,
    ZenviaDriver,
    FakeDriver,
    {
      provide: MESSAGING_CLIENT,
      inject: [ConfigService, TwilioDriver, ZenviaDriver, FakeDriver],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        twilio: TwilioDriver,
        zenvia: ZenviaDriver,
        fake: FakeDriver,
      ): MessagingClient => {
        switch (config.get('messaging', { infer: true }).driver) {
          case MessagingDriver.Zenvia:
            return zenvia;
          case MessagingDriver.Fake:
            return fake;
          case MessagingDriver.Twilio:
          default:
            return twilio;
        }
      },
    },
  ],
  exports: [MESSAGING_CLIENT],
})
export class MessagingModule {}
