import { Router } from 'express';
import { getRepository } from '../datasource';
import { OverseerrInstance } from '../entity/OverseerrInstance';
import { OverseerrClient } from '../lib/overseerrClient';


const router = Router();

// Get all instances
router.get('/', async (req, res) => {
    try {
        const repo = getRepository(OverseerrInstance);
        // apiKey excluded by default
        const instances = await repo.find();
        res.json(instances);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch instances' });
    }
});

// Get single instance
router.get('/:id', async (req, res) => {
    try {
        const repo = getRepository(OverseerrInstance);
        // Explicitly load apiKey if needed, or rely on default select (apiKey is usually hidden)
        // For editing, we usually don't send back the apiKey anyway.
        const instance = await repo.findOne({ where: { id: parseInt(req.params.id) } });
        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }
        res.json(instance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch instance' });
    }
});

// Create instance
router.post('/', async (req, res) => {
    try {
        const repo = getRepository(OverseerrInstance);

        // Enforce single instance
        const count = await repo.count();
        if (count > 0) {
            return res.status(400).json({ error: 'Only one Overseerr instance is allowed' });
        }

        const { name, baseUrl, apiKey, radarrServerMappings, sonarrServerMappings, pollIntervalMinutes, enabled } = req.body;

        const instance = repo.create({
            name, baseUrl, apiKey,
            pollIntervalMinutes,
            enabled: enabled !== undefined ? enabled : true,
            radarrServerMappings: JSON.stringify(radarrServerMappings || {}),
            sonarrServerMappings: JSON.stringify(sonarrServerMappings || {})
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
        const repo = getRepository(OverseerrInstance);
        const id = parseInt(req.params.id);
        const instance = await repo.findOne({ where: { id } });

        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }

        const { name, baseUrl, apiKey, radarrServerMappings, sonarrServerMappings, pollIntervalMinutes, enabled } = req.body;

        instance.name = name;
        instance.baseUrl = baseUrl;
        if (apiKey) instance.apiKey = apiKey;
        if (pollIntervalMinutes !== undefined) instance.pollIntervalMinutes = pollIntervalMinutes;
        if (enabled !== undefined) instance.enabled = enabled;

        instance.setRadarrServerMappings(radarrServerMappings || {});
        instance.setSonarrServerMappings(sonarrServerMappings || {});

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
        const repo = getRepository(OverseerrInstance);
        await repo.delete(req.params.id);

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete instance' });
    }
});

// Test connection (Generic)
router.post('/test', async (req, res) => {
    try {
        const { baseUrl, apiKey } = req.body;
        if (!baseUrl || !apiKey) {
            return res.status(400).json({ error: 'Missing baseUrl or apiKey' });
        }

        const client = new OverseerrClient(baseUrl, apiKey);
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

// Test existing instance
router.post('/:id/test', async (req, res) => {
    try {
        const repo = getRepository(OverseerrInstance);
        const instance = await repo.findOne({
            where: { id: parseInt(req.params.id) },
            select: ['id', 'baseUrl', 'apiKey']
        });

        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }

        const client = new OverseerrClient(instance.baseUrl, instance.apiKey);
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

// Proxy routes to fetch servers from Overseerr
router.post('/proxy/servers', async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    try {
        const client = new OverseerrClient(baseUrl, apiKey);
        const [radarrServers, sonarrServers] = await Promise.all([
            client.getRadarrServers(),
            client.getSonarrServers()
        ]);
        res.json({ radarr: radarrServers, sonarr: sonarrServers });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch servers' }); }
});

router.get('/:id/servers', async (req, res) => {
    try {
        const repo = getRepository(OverseerrInstance);
        const instance = await repo.findOne({
            where: { id: parseInt(req.params.id) },
            select: ['id', 'baseUrl', 'apiKey']
        });
        if (!instance) return res.status(404).json({ error: 'Instance not found' });

        const client = new OverseerrClient(instance.baseUrl, instance.apiKey);
        const [radarrServers, sonarrServers] = await Promise.all([
            client.getRadarrServers(),
            client.getSonarrServers()
        ]);
        res.json({ radarr: radarrServers, sonarr: sonarrServers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch servers' });
    }
});

export default router;
