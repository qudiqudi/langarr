import 'reflect-metadata';
import express from 'express';
import path from 'path';
import next from 'next';
import cookieParser from 'cookie-parser';
import { initializeDatabase } from './datasource';
import authRoutes from './routes/auth';
import radarrRoutes from './routes/radarr';
import sonarrRoutes from './routes/sonarr';
import overseerrRoutes from './routes/overseerr';
import settingsRoutes from './routes/settings';
import statusRoutes from './routes/status';
import actionsRoutes from './routes/actions';
import logsRoutes from './routes/logs';
import webhookRoutes from './routes/webhook';
import { Scheduler } from './services/Scheduler';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/radarr', radarrRoutes);
app.use('/api/v1/sonarr', sonarrRoutes);
app.use('/api/v1/overseerr', overseerrRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/status', statusRoutes);
app.use('/api/v1/actions', actionsRoutes);
app.use('/api/v1/logs', logsRoutes);
app.use('/api/v1/webhook', webhookRoutes);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global scheduler instance
let globalScheduler: Scheduler | null = null;

export function getScheduler(): Scheduler | null {
  return globalScheduler;
}

// Initialize database and start server
const start = async () => {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    globalScheduler = new Scheduler();
    globalScheduler.start();

    // In production, integration Next.js
    if (process.env.NODE_ENV === 'production') {
      // In production, compiled code is in dist/server, so root is ../../
      const nextApp = next({ dev: false, dir: path.resolve(__dirname, '../..') });
      const handle = nextApp.getRequestHandler();

      await nextApp.prepare();
      console.log('Next.js app prepared');

      // Handle client-side routing
      app.use((req, res) => {
        return handle(req, res);
      });
    }

    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

export default app;
