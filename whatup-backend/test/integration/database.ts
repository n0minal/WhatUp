import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { ConversationEntity } from '../../src/conversations/entities/conversation.entity';
import { MessageEntity } from '../../src/messages/entities/message.entity';
import { MessageDirection } from '../../src/messages/enumerators/message-direction';
import { MessageStatus } from '../../src/messages/enumerators/message-status';

/**
 * Integration tests run against a real Postgres — the idempotency guarantees
 * under test are enforced by its constraints and row locks, which mocks
 * cannot exercise. They use a dedicated `<DB_NAME>_test` database (created on
 * first run, schema synchronized from the entities) so the dev data is never
 * touched.
 */

const TEST_DATABASE = `${process.env.DB_NAME ?? 'whatup'}_test`;

const settings = () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'whatup',
  password: process.env.DB_PASSWORD ?? 'whatup',
});

export async function createTestDataSource(): Promise<DataSource> {
  const { host, port, username, password } = settings();

  const admin = new Client({
    host,
    port,
    user: username,
    password,
    database: process.env.DB_NAME ?? 'whatup',
  });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DATABASE],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  }
  await admin.end();

  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: TEST_DATABASE,
    entities: [ConversationEntity, MessageEntity],
    synchronize: true,
  });
  return dataSource.initialize();
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE messages, conversations CASCADE');
}

export async function createConversation(
  dataSource: DataSource,
  phoneNumber: string,
  lastMessageAt: Date = new Date(),
): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    `INSERT INTO conversations (phone_number, last_message_at)
     VALUES ($1, $2) RETURNING id`,
    [phoneNumber, lastMessageAt],
  );
  return rows[0].id;
}

export interface InsertMessageOptions {
  conversationId: string;
  direction?: MessageDirection;
  body?: string;
  status?: MessageStatus;
  providerMessageId?: string | null;
  inReplyTo?: string | null;
  createdAt?: Date;
}

export async function insertMessage(
  dataSource: DataSource,
  options: InsertMessageOptions,
): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    `INSERT INTO messages
       (conversation_id, direction, body, status, provider_message_id, in_reply_to, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      options.conversationId,
      options.direction ?? MessageDirection.Inbound,
      options.body ?? 'hello',
      options.status ?? MessageStatus.Received,
      options.providerMessageId ?? null,
      options.inReplyTo ?? null,
      options.createdAt ?? new Date(),
    ],
  );
  return rows[0].id;
}
