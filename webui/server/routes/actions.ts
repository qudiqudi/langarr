import express from 'express';
import { SyncService } from '../services/SyncService';

const router = express.Router();
const syncService = new SyncService();

// Trigger Sync
router.post('/sync', async (req, res) => {
    try {
        // Run in background
        syncService.syncAll().catch(err => console.error('Background sync failed:', err));

        res.json({ message: 'Sync started' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start sync' });
    }
});

// Trigger Audio Scan (Currently same as sync but logically distinct)
router.post('/audio-scan', async (req, res) => {
    try {
        // Run in background
        syncService.syncAll().catch(err => console.error('Background audio scan failed:', err));

        res.json({ message: 'Audio scan started' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start audio scan' });
    }
});

// Trigger Dry Run (Background - legacy)
router.post('/dry-run', async (req, res) => {
    try {
        // Run in background with dryRun option
        syncService.syncAll({ dryRun: true }).catch(err => console.error('Background dry-run failed:', err));

        res.json({ message: 'Dry-run started' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start dry-run' });
    }
});

// Dry Run Preview (Synchronous - returns preview data)
router.post('/dry-run-preview', async (req, res) => {
    try {
        // Run synchronously and collect preview data
        const previewResult = await syncService.getDryRunPreview();
        res.json(previewResult);
    } catch (error) {
        console.error('Dry-run preview failed:', error);
        res.status(500).json({
            error: 'Failed to run dry-run preview',
            totalChanges: 0,
            actions: []
        });
    }
});

export default router;
