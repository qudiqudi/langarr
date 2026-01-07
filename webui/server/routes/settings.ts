import express from 'express';
import { getRepository } from '../datasource';
import { Settings } from '../entity/Settings';
import crypto from 'crypto';

const router = express.Router();


// Get settings
router.get('/', async (req, res) => {

    try {
        const settingsRepo = getRepository(Settings);
        let settings = await settingsRepo.findOne({ where: { id: 1 } });

        if (!settings) {
            settings = settingsRepo.create({ id: 1 });
            await settingsRepo.save(settings);
        }

        // Return settings with parsed audioTagRules
        res.json({
            ...settings,
            audioTagRules: settings.getAudioTagRules()
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update settings
router.put('/', async (req, res) => {
    try {
        const settingsRepo = getRepository(Settings);
        let settings = await settingsRepo.findOne({ where: { id: 1 } });

        if (!settings) {
            settings = settingsRepo.create({ id: 1 });
        }

        const {
            syncIntervalHours,
            runSyncOnStartup,
            webhookEnabled,
            webhookAuthToken,
            langarrBaseUrl,
            audioTagRules,
            dryRunMode,
            isSetup
        } = req.body;

        // Update fields if present
        if (syncIntervalHours !== undefined) settings.syncIntervalHours = syncIntervalHours;
        if (runSyncOnStartup !== undefined) settings.runSyncOnStartup = runSyncOnStartup;
        if (webhookEnabled !== undefined) settings.webhookEnabled = webhookEnabled;
        if (webhookAuthToken !== undefined) settings.webhookAuthToken = webhookAuthToken;
        if (langarrBaseUrl !== undefined) settings.langarrBaseUrl = langarrBaseUrl;
        if (audioTagRules !== undefined) settings.setAudioTagRules(audioTagRules);
        if (dryRunMode !== undefined) settings.dryRunMode = dryRunMode;
        if (isSetup !== undefined) settings.isSetup = isSetup;

        await settingsRepo.save(settings);

        // NOTE: Webhook auto-configuration removed due to Overseerr UI bug.
        // Users must manually configure webhooks in Overseerr.
        // See OverseerrConfigService.ts for details.

        // Return settings with parsed audioTagRules
        res.json({
            ...settings,
            audioTagRules: settings.getAudioTagRules()
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Generate webhook token
router.post('/webhook-token', async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        res.json({ token });
    } catch (error) {
        console.error('Error generating webhook token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Get webhook setup info for manual configuration
router.get('/webhook-info', async (req, res) => {
    try {
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });

        if (!settings?.webhookAuthToken) {
            return res.status(400).json({ error: 'Generate a webhook token first' });
        }

        res.json({
            url: `http://langarr:3000/api/v1/webhook?token=${settings.webhookAuthToken}`,
            types: 132, // MEDIA_APPROVED + MEDIA_AUTO_APPROVED
            typesDescription: 'Request Approved, Request Auto-Approved'
        });
    } catch (error) {
        console.error('Error getting webhook info:', error);
        res.status(500).json({ error: 'Failed to get webhook info' });
    }
});

export default router;
