import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'path';

// Entities will be imported here as they're created
import { User } from './entity/User';
import { Session } from './entity/Session';
import { Settings } from './entity/Settings';
import { RadarrInstance } from './entity/RadarrInstance';
import { SonarrInstance } from './entity/SonarrInstance';
import { OverseerrInstance } from './entity/OverseerrInstance';
import { SyncLog } from './entity/SyncLog';

const isProd = process.env.NODE_ENV === 'production';
const dbPath = process.env.DB_PATH || (isProd ? '/config/langarr.db' : './langarr.db');

export const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: true, // Auto-sync schema in dev, use migrations in prod
  logging: !isProd,
  entities: [User, Session, Settings, RadarrInstance, SonarrInstance, OverseerrInstance, SyncLog],
  migrations: [path.join(__dirname, 'migration', '*.ts')],
});

let initialized = false;

export const initializeDatabase = async (): Promise<DataSource> => {
  if (!initialized) {
    await dataSource.initialize();
    initialized = true;
    console.log('Database initialized');
  }
  return dataSource;
};

export const getRepository = <T extends object>(entity: new () => T) => {
  return dataSource.getRepository(entity);
};
