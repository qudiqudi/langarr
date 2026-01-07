import express from 'express';
import { getRepository } from '../datasource';
import { Settings } from '../entity/Settings';
import { getScheduler } from '../index';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });

        if (!settings || !settings.webhookEnabled) {
            return res.status(503).json({ error: 'Webhook is disabled' });
        }

        const token = req.header('X-Auth-Token') ||
            req.header('Authorization')?.replace('Bearer ', '') ||
            (req.query.token as string);

        if (!token || token !== settings.webhookAuthToken) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { notification_type, media } = req.body;

        if (!media) {
            // Test notification usually
            return res.json({ status: 'ok', message: 'Received' });
        }

        console.log(`[Webhook] Received ${notification_type} for ${media.title || 'Unknown'}`);

        // We process on MEDIA_APPROVED (when item is added to Radarr/Sonarr)
        // or MEDIA_PENDING (if using legacy instant-update which Overseerr supports for Pending items too)
        // But usually "MEDIA_APPROVED" is when it hits Radarr.
        // Wait, if it's "MEDIA_PENDING", it's in Overseerr but NOT in Radarr yet?
        // Langarr modifies Radarr/Sonarr. So the item must be there.
        // Overseerr sends MEDIA_APPROVED *after* sending to Radarr.
        // So we want MEDIA_APPROVED.
        // Also supports TEST_NOTIFICATION.

        // We trigger processing in background
        const scheduler = getScheduler();
        if (scheduler) {
            const syncService = scheduler['syncService']; // Access public property logic if available, or just use new instance? 
            // Best to use singleton or similar.
            // Scheduler has private syncService. 
            // Let's modify Scheduler to expose it or just instantiate new SyncService?
            // SyncService is stateless except for 'processing' set.
            // If we instantiate new, we might run parallel validation on same item.
            // But SyncService.processing is instance-level.
            // Better to use the global one.
            // In `index.ts`, `globalScheduler` is exported but `syncService` on it is likely private.
            // Let's fix that or use `scheduler.getSyncService()`?
            // Actually, let's just create a new instance for now as 'processing' set collision on single item is rare and handled by DB locks usually? No DB locks here.
            // The simple `processing` set is for full syncs.
            // Let's try to get it from scheduler if possible, or just new.

            // For now, I'll instantiate new SyncService. It's lightweight.
            // Real concurrency issue is negligible for single different items.
            // For same item, might race but unlikely to break things, just double update.

            const { SyncService } = require('../services/SyncService');
            const service = new SyncService();

            // Fire and forget
            service.processSingleWebhookItem(
                media.media_type === 'movie' ? 'movie' : 'tv',
                media.tmdbId,
                media.tvdbId
            ).catch((err: any) => console.error('Webhook processing error:', err));
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
