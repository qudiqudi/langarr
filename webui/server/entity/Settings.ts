import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

export interface AudioTagRule {
  language: string;  // ISO 639-1 code
  tagName: string;
}

@Entity()
export class Settings {
  // Singleton - always id = 1
  @PrimaryColumn({ type: 'integer', default: 1 })
  id: number = 1;

  // Schedule settings
  @Column({ type: 'integer', default: 24 })
  syncIntervalHours!: number;

  @Column({ type: 'boolean', default: true })
  runSyncOnStartup!: boolean;

  // Webhook settings
  @Column({ type: 'boolean', default: false })
  webhookEnabled!: boolean;

  @Column({ nullable: true })
  webhookAuthToken?: string;

  @Column({ nullable: true })
  langarrBaseUrl?: string;

  // Audio tagging settings (global)
  @Column({ type: 'text', nullable: true })
  audioTagRules?: string;

  // Advanced settings
  @Column({ type: 'boolean', default: false })
  dryRunMode!: boolean;

  @Column({ type: 'boolean', default: false })
  isSetup!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper methods to parse JSON fields
  getAudioTagRules(): AudioTagRule[] {
    if (!this.audioTagRules) return [];
    try {
      return JSON.parse(this.audioTagRules);
    } catch {
      return [];
    }
  }

  setAudioTagRules(rules: AudioTagRule[]): void {
    this.audioTagRules = JSON.stringify(rules);
  }
}
