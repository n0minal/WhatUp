import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { ClaudeReplyDriver } from './drivers/claude.driver';
import { FakeReplyDriver } from './drivers/fake.driver';
import { ReplyDriver } from './enumerators/reply-driver';
import { REPLY_GENERATOR } from './tokens';
import { ReplyGenerator } from './types/reply-generator';

/**
 * Reply generation behind the ReplyGenerator port. The driver is chosen by
 * REPLY_DRIVER; adding a provider (another LLM, a rules engine) is one new
 * driver class plus a case here — nothing outside this module changes.
 */
@Module({
  providers: [
    FakeReplyDriver,
    ClaudeReplyDriver,
    {
      provide: REPLY_GENERATOR,
      inject: [ConfigService, FakeReplyDriver, ClaudeReplyDriver],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        fake: FakeReplyDriver,
        claude: ClaudeReplyDriver,
      ): ReplyGenerator => {
        switch (config.get('reply', { infer: true }).driver) {
          case ReplyDriver.Claude:
            return claude;
          case ReplyDriver.Fake:
          default:
            return fake;
        }
      },
    },
  ],
  // Only the port is exported: consumers can't couple to a driver.
  exports: [REPLY_GENERATOR],
})
export class ReplyModule {}
