import express from 'express';
import { getRepository } from '../datasource';
import { SyncLog } from '../entity/SyncLog';

const router = express.Router();

// SSE clients
const sseClients = new Set<express.Response>();

// Get logs with pagination and filtering
router.get('/', async (req, res) => {
    try {
        const { limit = 100, level, source, offset = 0 } = req.query;
        const repo = getRepository(SyncLog);

        const query = repo.createQueryBuilder('log')
            .orderBy('log.timestamp', 'DESC')
            .take(Number(limit))
            .skip(Number(offset));

        if (level) {
            query.andWhere('log.level = :level', { level });
        }

        if (source) {
            query.andWhere('log.source = :source', { source });
        }

        const [logs, total] = await query.getManyAndCount();

        res.json({
            data: logs,
            pagination: {
                total,
                limit: Number(limit),
                offset: Number(offset)
            }
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Clear logs
router.delete('/', async (req, res) => {
    try {
        const repo = getRepository(SyncLog);
        await repo.clear();
        res.json({ message: 'Logs cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

// SSE endpoint for real-time log streaming
router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Add client to set
    sseClients.add(res);

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    // Remove client on disconnect
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Helper function to broadcast new log entries
export function broadcastLogEntry(logEntry: SyncLog) {
    const data = JSON.stringify({
        type: 'log',
        data: logEntry
    });

    sseClients.forEach(client => {
        client.write(`data: ${data}\n\n`);
    });
}

export default router;
