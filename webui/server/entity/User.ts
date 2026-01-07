import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Session } from './Session';

export enum Permission {
  NONE = 0,
  ADMIN = 1 << 0,        // 1 - Full admin access
  VIEW = 1 << 1,         // 2 - Can view dashboard/status
  MANAGE = 1 << 2,       // 4 - Can manage instances/settings
  TRIGGER = 1 << 3,      // 8 - Can trigger syncs
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ unique: true, nullable: true })
  plexId?: number;

  @Column({ nullable: true })
  plexUsername?: string;

  @Column({ nullable: true, select: false })
  plexToken?: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ type: 'integer', default: Permission.NONE })
  permissions!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];

  // Helper methods
  hasPermission(permission: Permission): boolean {
    // Admin has all permissions
    if (this.permissions & Permission.ADMIN) {
      return true;
    }
    return (this.permissions & permission) === permission;
  }

  get displayName(): string {
    return this.plexUsername || this.email || `User ${this.id}`;
  }

  // Filter sensitive fields for API responses
  toJSON(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
      plexId: this.plexId,
      plexUsername: this.plexUsername,
      avatar: this.avatar,
      permissions: this.permissions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
