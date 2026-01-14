import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'sync' | 'audio' | 'webhook' | 'overseerr' | 'system';

@Entity()
@Index(['timestamp'])
@Index(['level'])
@Index(['source'])
export class SyncLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  timestamp!: Date;

  @Column({ type: 'text' })
  level!: LogLevel;

  @Column({ type: 'text' })
  source!: LogSource;

  @Column({ type: 'text', nullable: true })
  instanceName?: string;

  @Column({ type: 'text' })
  message!: string;

  // Stored as JSON string for additional context
  @Column({ type: 'text', nullable: true })
  metadata?: string;

  getMetadata(): Record<string, unknown> | null {
    if (!this.metadata) return null;
    try {
      return JSON.parse(this.metadata);
    } catch {
      return null;
    }
  }

  setMetadata(data: Record<string, unknown>): void {
    this.metadata = JSON.stringify(data);
  }
}
