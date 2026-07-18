import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MessageEntity } from '../../messages/entities/message.entity';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'phone_number', type: 'text' })
  phoneNumber!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_message_at', type: 'timestamptz' })
  lastMessageAt!: Date;

  @OneToMany(() => MessageEntity, (message) => message.conversation)
  messages!: MessageEntity[];
}
