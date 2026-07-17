import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { MessageDirection } from '../enumerators/message-direction';
import { MessageStatus } from '../enumerators/message-status';

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  /**
   * Provider message id (Twilio: MessageSid). Unique: the idempotency anchor
   * for duplicate webhook/queue deliveries. Null until the send is accepted
   * for outbound.
   */
  @Index({ unique: true, where: 'twilio_sid IS NOT NULL' })
  @Column({ name: 'twilio_sid', type: 'text', nullable: true })
  twilioSid!: string | null;

  @Column({ type: 'text' })
  direction!: MessageDirection;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', default: MessageStatus.Received })
  status!: MessageStatus;

  /**
   * For outbound rows: the inbound message this replies to. Unique, so a
   * double-processed inbound message can never record two replies.
   */
  @Index({ unique: true, where: 'in_reply_to IS NOT NULL' })
  @Column({ name: 'in_reply_to', type: 'uuid', nullable: true })
  inReplyTo!: string | null;

  /** Set when a worker claims the row; used for stale-claim takeover. */
  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
