import { useState, useEffect, useCallback } from 'react';


export interface SystemStatus {
    status: 'running' | 'stopped' | 'error';
    version: string;
    lastSync: string | null;
    nextSync: string | null;
    instances: {
        radarr: number;
        sonarr: number;
        overseerr: number;
    };
    settings: {
        syncInterval: number;
    };
    statistics?: {
        totalMovies: number;
        totalSeries: number;
        totalContent: number;
    };
    recentActivity?: Array<{
        id: number;
        level: string;
        message: string;
        timestamp: string;
        source: string;
    }>;
}

export interface LastTouchedItem {
    title: string;
    poster: string | null;
    profile: string | null;
    tags: string | null;
}

export interface InstanceHealth {
    id: number;
    name: string;
    type: 'radarr' | 'sonarr' | 'overseerr';
    enabled: boolean;
    status: 'healthy' | 'unhealthy';
    error?: string;
    url: string;
    lastSyncAt: string | null;
    lastTouchedItem: LastTouchedItem | null;
}

export interface InstanceHealthResponse {
    instances: InstanceHealth[];
    summary: {
        total: number;
        healthy: number;
        unhealthy: number;
    };
}

export function useStatus() {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/status');
            if (!res.ok) throw new Error('Failed to fetch status');
            const data = await res.json();
            setStatus(data);
            setError(null);
        } catch (err: unknown) {
            console.error('Error fetching status:', err);
            setError(err as Error);
            // Don't toast error on periodic fetch, just console
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [fetchStatus]);

    return { status, loading, error, refreshStatus: fetchStatus };
}

export function useInstanceHealth() {
    const [instanceHealth, setInstanceHealth] = useState<InstanceHealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchInstanceHealth = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/status/instances');
            if (!res.ok) throw new Error('Failed to fetch instance health');
            const data = await res.json();
            setInstanceHealth(data);
            setError(null);
        } catch (err: unknown) {
            console.error('Error fetching instance health:', err);
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInstanceHealth();
        const interval = setInterval(fetchInstanceHealth, 30000); // Poll every 30s (less frequent than status)
        return () => clearInterval(interval);
    }, [fetchInstanceHealth]);

    return { instanceHealth, loading, error, refreshInstanceHealth: fetchInstanceHealth };
}
