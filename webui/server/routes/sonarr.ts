import { Router } from 'express';
import { getRepository } from '../datasource';
import { SonarrInstance } from '../entity/SonarrInstance';
import { ArrClient } from '../lib/arrClient';

const router = Router();

// Get all instances
router.get('/', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        // find() doesn't select select:false columns (apiKey) by default
        const instances = await repo.find();
        res.json(instances);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch instances' });
    }
});

// Create instance
router.post('/', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        const {
            name, baseUrl, apiKey, originalProfile, dubProfile, tagName,
            originalLanguages, audioTaggingEnabled, enabled,
            triggerSearchOnUpdate, searchCooldownSeconds, minSearchIntervalSeconds, onlyMonitored
        } = req.body;

        const instance = repo.create({
            name, baseUrl, apiKey, originalProfile, dubProfile, tagName,
            originalLanguages: JSON.stringify(originalLanguages || []),
            audioTaggingEnabled: audioTaggingEnabled ?? false,
            enabled: enabled ?? true,
            triggerSearchOnUpdate: triggerSearchOnUpdate ?? true,
            searchCooldownSeconds: searchCooldownSeconds ?? 60,
            minSearchIntervalSeconds: minSearchIntervalSeconds ?? 5,
            onlyMonitored: onlyMonitored ?? false
        });

        await repo.save(instance);
        res.status(201).json(instance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create instance' });
    }
});

// Update instance
router.put('/:id', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        const id = parseInt(req.params.id);
        const instance = await repo.findOne({ where: { id } });

        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }

        const {
            name, baseUrl, apiKey, originalProfile, dubProfile, tagName,
            originalLanguages, audioTaggingEnabled, enabled,
            triggerSearchOnUpdate, searchCooldownSeconds, minSearchIntervalSeconds, onlyMonitored
        } = req.body;

        instance.name = name;
        instance.baseUrl = baseUrl;
        if (apiKey) instance.apiKey = apiKey;
        instance.originalProfile = originalProfile;
        instance.dubProfile = dubProfile;
        instance.tagName = tagName;
        if (enabled !== undefined) instance.enabled = enabled;
        if (triggerSearchOnUpdate !== undefined) instance.triggerSearchOnUpdate = triggerSearchOnUpdate;
        if (searchCooldownSeconds !== undefined) instance.searchCooldownSeconds = searchCooldownSeconds;
        if (minSearchIntervalSeconds !== undefined) instance.minSearchIntervalSeconds = minSearchIntervalSeconds;
        if (onlyMonitored !== undefined) instance.onlyMonitored = onlyMonitored;
        if (audioTaggingEnabled !== undefined) instance.audioTaggingEnabled = audioTaggingEnabled;
        instance.setOriginalLanguages(originalLanguages || []);

        await repo.save(instance);
        res.json(instance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update instance' });
    }
});

// Delete instance
router.delete('/:id', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        await repo.delete(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete instance' });
    }
});

// Test connection
router.post('/test', async (req, res) => {
    try {
        console.log('[Sonarr Test] Request body:', req.body);
        const { baseUrl, apiKey } = req.body;
        console.log('[Sonarr Test] baseUrl:', baseUrl, 'apiKey:', apiKey ? '***' : 'undefined');

        if (!baseUrl || !apiKey) {
            return res.status(400).json({ error: 'Missing baseUrl or apiKey' });
        }

        const client = new ArrClient(baseUrl, apiKey);
        const success = await client.testConnection();

        if (success) {
            res.json({ status: 'ok', message: 'Connection successful' });
        } else {
            res.status(400).json({ error: 'Connection failed' });
        }
    } catch (error) {
        console.error('[Sonarr Test] Error:', error);
        res.status(500).json({ error: 'Test failed', details: String(error) });
    }
});

// Test existing instance
router.post('/:id/test', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        const instance = await repo.findOne({
            where: { id: parseInt(req.params.id) },
            select: ['id', 'baseUrl', 'apiKey']
        });

        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }

        const client = new ArrClient(instance.baseUrl, instance.apiKey);
        const success = await client.testConnection();

        if (success) {
            res.json({ status: 'ok', message: 'Connection successful' });
        } else {
            res.status(400).json({ error: 'Connection failed' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Test failed' });
    }
});

// Proxy routes
router.get('/:id/profiles', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        const instance = await repo.findOne({
            where: { id: parseInt(req.params.id) },
            select: ['id', 'baseUrl', 'apiKey']
        });
        if (!instance) return res.status(404).json({ error: 'Instance not found' });

        const client = new ArrClient(instance.baseUrl, instance.apiKey);
        const profiles = await client.getProfiles();
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

router.get('/:id/tags', async (req, res) => {
    try {
        const repo = getRepository(SonarrInstance);
        const instance = await repo.findOne({
            where: { id: parseInt(req.params.id) },
            select: ['id', 'baseUrl', 'apiKey']
        });
        if (!instance) return res.status(404).json({ error: 'Instance not found' });

        const client = new ArrClient(instance.baseUrl, instance.apiKey);
        const tags = await client.getTags();
        res.json(tags);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});

// Helper route for frontend to fetch data for new instance form
router.post('/proxy/profiles', async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    try {
        const client = new ArrClient(baseUrl, apiKey);
        const profiles = await client.getProfiles();
        res.json(profiles);
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/proxy/tags', async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    try {
        const client = new ArrClient(baseUrl, apiKey);
        const tags = await client.getTags();
        res.json(tags);
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

export default router;
