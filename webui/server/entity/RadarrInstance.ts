import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class RadarrInstance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column()
  baseUrl!: string;

  @Column({ select: false })
  apiKey!: string;

  @Column()
  originalProfile!: string;

  @Column()
  dubProfile!: string;

  @Column({ default: 'prefer-dub' })
  tagName!: string;

  // Stored as JSON string, parsed to string[]
  @Column({ type: 'text' })
  originalLanguages!: string;

  @Column({ type: 'boolean', default: true })
  triggerSearchOnUpdate!: boolean;

  @Column({ type: 'integer', default: 60 })
  searchCooldownSeconds!: number;

  @Column({ type: 'integer', default: 5 })
  minSearchIntervalSeconds!: number;

  @Column({ type: 'boolean', default: false })
  onlyMonitored!: boolean;

  // Enable/disable audio tagging for this instance (uses global audio tag rules from Settings)
  @Column({ type: 'boolean', default: false })
  audioTaggingEnabled!: boolean;

  // Per-instance sync interval (null = use global setting)
  @Column({ type: 'integer', nullable: true })
  syncIntervalHours?: number;

  // Last sync tracking
  @Column({ type: 'datetime', nullable: true })
  lastSyncAt?: Date;

  // Last touched item info (for dashboard display)
  @Column({ type: 'text', nullable: true })
  lastTouchedItemTitle?: string;

  @Column({ type: 'text', nullable: true })
  lastTouchedItemPoster?: string;

  @Column({ type: 'text', nullable: true })
  lastTouchedItemTags?: string;

  @Column({ type: 'text', nullable: true })
  lastTouchedItemProfile?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper methods to parse JSON fields
  getOriginalLanguages(): string[] {
    try {
      return JSON.parse(this.originalLanguages);
    } catch {
      return [];
    }
  }

  setOriginalLanguages(languages: string[]): void {
    this.originalLanguages = JSON.stringify(languages);
  }

  // Filter sensitive fields for API responses
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      originalProfile: this.originalProfile,
      dubProfile: this.dubProfile,
      tagName: this.tagName,
      originalLanguages: this.getOriginalLanguages(),
      triggerSearchOnUpdate: this.triggerSearchOnUpdate,
      searchCooldownSeconds: this.searchCooldownSeconds,
      minSearchIntervalSeconds: this.minSearchIntervalSeconds,
      onlyMonitored: this.onlyMonitored,
      audioTaggingEnabled: this.audioTaggingEnabled,
      syncIntervalHours: this.syncIntervalHours,
      lastSyncAt: this.lastSyncAt,
      lastTouchedItemTitle: this.lastTouchedItemTitle,
      lastTouchedItemPoster: this.lastTouchedItemPoster,
      lastTouchedItemProfile: this.lastTouchedItemProfile,
      lastTouchedItemTags: this.lastTouchedItemTags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
