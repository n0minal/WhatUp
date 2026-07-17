import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { WebhookModule } from './webhook/webhook.module';
import { WorkerModule } from './worker/worker.module';
import { ReplyModule } from './reply/reply.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
      ): TypeOrmModuleOptions => {
        const db: AppConfig['database'] = config.get('database', {
          infer: true,
        });
        return {
          type: 'postgres',
          ...db,
          autoLoadEntities: true,
          // Dev-only schema sync; production would use generated migrations.
          synchronize: true,
        };
      },
    }),
    MessagesModule,
    ConversationsModule,
    WebhookModule,
    WorkerModule,
    ReplyModule,
  ],
})
export class AppModule {}
