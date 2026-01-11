import express from 'express';
import { getRepository } from '../datasource';
import { Settings } from '../entity/Settings';
import { SyncLog } from '../entity/SyncLog';
import { RadarrInstance } from '../entity/RadarrInstance';
import { SonarrInstance } from '../entity/SonarrInstance';
import { OverseerrInstance } from '../entity/OverseerrInstance';
import { ArrClient } from '../lib/arrClient';
import { getScheduler } from '../index';

const router = express.Router();

// Get system status
router.get('/', async (req, res) => {
    try {
        const settingsRepo = getRepository(Settings);
        const logRepo = getRepository(SyncLog);
        const radarrRepo = getRepository(RadarrInstance);
        const sonarrRepo = getRepository(SonarrInstance);
        const overseerrRepo = getRepository(OverseerrInstance);

        const settings = await settingsRepo.findOne({ where: { id: 1 } });

        // Get last sync log
        const lastSync = await logRepo.findOne({
            where: { source: 'sync' },
            order: { timestamp: 'DESC' }
        });

        // Get recent activity (last 10 log entries)
        const recentActivity = await logRepo.find({
            order: { timestamp: 'DESC' },
            take: 10
        });

        // Get instance counts
        const radarrCount = await radarrRepo.count();
        const sonarrCount = await sonarrRepo.count();
        const overseerrCount = await overseerrRepo.count();

        // Get content statistics from enabled instances
        let totalMovies = 0;
        let totalSeries = 0;
        const radarrInstances = await radarrRepo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .where('instance.enabled = :enabled', { enabled: true })
            .getMany();
        const sonarrInstances = await sonarrRepo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .where('instance.enabled = :enabled', { enabled: true })
            .getMany();

        // Count movies from Radarr instances
        for (const instance of radarrInstances) {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);
                const movies = await client.getMovies();
                totalMovies += movies.length;
            } catch (error) {
                // Silently fail for individual instance errors
            }
        }

        // Count series from Sonarr instances
        for (const instance of sonarrInstances) {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);
                const series = await client.getSeries();
                totalSeries += series.length;
            } catch (error) {
                // Silently fail for individual instance errors
            }
        }

        // Check if next sync is calculable (simple approximation)
        let nextSync = null;
        if (settings && lastSync) {
            const intervalMs = settings.syncIntervalHours * 60 * 60 * 1000;
            const nextSyncDate = new Date(lastSync.timestamp.getTime() + intervalMs);
            nextSync = nextSyncDate.toISOString();
        }

        // Get scheduler status
        const scheduler = getScheduler();
        const schedulerRunning = scheduler ? scheduler.isRunning() : false;
        const schedulerStartTime = scheduler ? scheduler.getStartTime() : null;

        res.json({
            status: schedulerRunning ? 'running' : 'stopped',
            version: '0.1.0-alpha',
            uptime: schedulerStartTime ? Math.floor((Date.now() - schedulerStartTime.getTime()) / 1000) : 0,
            lastSync: lastSync ? lastSync.timestamp : null,
            nextSync: nextSync,
            recentActivity: recentActivity,
            instances: {
                radarr: radarrCount,
                sonarr: sonarrCount,
                overseerr: overseerrCount
            },
            statistics: {
                totalMovies,
                totalSeries,
                totalContent: totalMovies + totalSeries
            },
            settings: {
                syncInterval: settings?.syncIntervalHours
            }
        });

    } catch (error) {
        console.error('Error fetching status:', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// Health check for all instances
router.get('/instances', async (req, res) => {
    try {
        const radarrRepo = getRepository(RadarrInstance);
        const sonarrRepo = getRepository(SonarrInstance);
        const overseerrRepo = getRepository(OverseerrInstance);

        const radarrInstances = await radarrRepo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .getMany();
        const sonarrInstances = await sonarrRepo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .getMany();
        const overseerrInstances = await overseerrRepo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .getMany();

        const radarrHealth = await Promise.all(radarrInstances.map(async (instance) => {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);
                const isHealthy = await client.testConnection();
                if (!isHealthy) throw new Error('Connection test failed');
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'radarr',
                    enabled: instance.enabled,
                    status: 'healthy',
                    url: instance.baseUrl,
                    originalProfile: instance.originalProfile,
                    dubProfile: instance.dubProfile,
                    lastSyncAt: instance.lastSyncAt || null,
                    lastTouchedItem: instance.lastTouchedItemTitle ? {
                        title: instance.lastTouchedItemTitle,
                        poster: instance.lastTouchedItemPoster || null,
                        profile: instance.lastTouchedItemProfile || null,
                        tags: instance.lastTouchedItemTags || null
                    } : null,
                    lastTouchedItems: instance.lastTouchedItems || []
                };
            } catch (error) {
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'radarr',
                    enabled: instance.enabled,
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : 'Connection failed',
                    url: instance.baseUrl,
                    originalProfile: instance.originalProfile,
                    dubProfile: instance.dubProfile,
                    lastSyncAt: instance.lastSyncAt || null,
                    lastTouchedItem: instance.lastTouchedItemTitle ? {
                        title: instance.lastTouchedItemTitle,
                        poster: instance.lastTouchedItemPoster || null,
                        profile: instance.lastTouchedItemProfile || null,
                        tags: instance.lastTouchedItemTags || null
                    } : null,
                    lastTouchedItems: instance.lastTouchedItems || []
                };
            }
        }));

        const sonarrHealth = await Promise.all(sonarrInstances.map(async (instance) => {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);
                const isHealthy = await client.testConnection();
                if (!isHealthy) throw new Error('Connection test failed');
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'sonarr',
                    enabled: instance.enabled,
                    status: 'healthy',
                    url: instance.baseUrl,
                    originalProfile: instance.originalProfile,
                    dubProfile: instance.dubProfile,
                    lastSyncAt: instance.lastSyncAt || null,
                    lastTouchedItem: instance.lastTouchedItemTitle ? {
                        title: instance.lastTouchedItemTitle,
                        poster: instance.lastTouchedItemPoster || null,
                        profile: instance.lastTouchedItemProfile || null,
                        tags: instance.lastTouchedItemTags || null
                    } : null,
                    lastTouchedItems: instance.lastTouchedItems || []
                };
            } catch (error) {
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'sonarr',
                    enabled: instance.enabled,
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : 'Connection failed',
                    url: instance.baseUrl,
                    originalProfile: instance.originalProfile,
                    dubProfile: instance.dubProfile,
                    lastSyncAt: instance.lastSyncAt || null,
                    lastTouchedItem: instance.lastTouchedItemTitle ? {
                        title: instance.lastTouchedItemTitle,
                        poster: instance.lastTouchedItemPoster || null,
                        profile: instance.lastTouchedItemProfile || null,
                        tags: instance.lastTouchedItemTags || null
                    } : null,
                    lastTouchedItems: instance.lastTouchedItems || []
                };
            }
        }));

        const overseerrHealth = await Promise.all(overseerrInstances.map(async (instance) => {
            try {
                const response = await fetch(`${instance.baseUrl}/api/v1/settings/main`, {
                    headers: { 'X-Api-Key': instance.apiKey }
                });
                if (!response.ok) throw new Error('API request failed');
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'overseerr',
                    enabled: instance.enabled,
                    status: 'healthy',
                    url: instance.baseUrl
                };
            } catch (error) {
                return {
                    id: instance.id,
                    name: instance.name,
                    type: 'overseerr',
                    enabled: instance.enabled,
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : 'Connection failed',
                    url: instance.baseUrl
                };
            }
        }));

        res.json({
            instances: [...radarrHealth, ...sonarrHealth, ...overseerrHealth],
            summary: {
                total: radarrHealth.length + sonarrHealth.length + overseerrHealth.length,
                healthy: [...radarrHealth, ...sonarrHealth, ...overseerrHealth].filter(i => i.status === 'healthy').length,
                unhealthy: [...radarrHealth, ...sonarrHealth, ...overseerrHealth].filter(i => i.status === 'unhealthy').length
            }
        });
    } catch (error) {
        console.error('Error checking instance health:', error);
        res.status(500).json({ error: 'Failed to check instance health' });
    }
});

// Simple health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

export default router;
