import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Maps Overseerr server ID to Langarr instance name
export interface ServerMapping {
  [overseerrServerId: string]: string;
}

@Entity()
export class OverseerrInstance {
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

  // Stored as JSON string: { "0": "main", "1": "4k" }
  @Column({ type: 'text', nullable: true })
  radarrServerMappings?: string;

  // Stored as JSON string: { "0": "main", "1": "anime" }
  @Column({ type: 'text', nullable: true })
  sonarrServerMappings?: string;

  @Column({ type: 'integer', default: 10 })
  pollIntervalMinutes!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper methods to parse JSON fields
  getRadarrServerMappings(): ServerMapping {
    if (!this.radarrServerMappings) return {};
    try {
      return JSON.parse(this.radarrServerMappings);
    } catch {
      return {};
    }
  }

  setRadarrServerMappings(mappings: ServerMapping): void {
    this.radarrServerMappings = JSON.stringify(mappings);
  }

  getSonarrServerMappings(): ServerMapping {
    if (!this.sonarrServerMappings) return {};
    try {
      return JSON.parse(this.sonarrServerMappings);
    } catch {
      return {};
    }
  }

  setSonarrServerMappings(mappings: ServerMapping): void {
    this.sonarrServerMappings = JSON.stringify(mappings);
  }

  // Filter sensitive fields for API responses
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      radarrServerMappings: this.getRadarrServerMappings(),
      sonarrServerMappings: this.getSonarrServerMappings(),
      pollIntervalMinutes: this.pollIntervalMinutes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
