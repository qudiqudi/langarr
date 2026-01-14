/**
 * Profile Cache Service
 * Caches Arr profile data with TTL to reduce API calls during sync operations.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export class ProfileCache {
    private static instance: ProfileCache;
    private cache: Map<string, CacheEntry<any>> = new Map();
    private defaultTTLMs: number = 60 * 60 * 1000; // 1 hour default

    private constructor() { }

    static getInstance(): ProfileCache {
        if (!ProfileCache.instance) {
            ProfileCache.instance = new ProfileCache();
        }
        return ProfileCache.instance;
    }

    /**
     * Get cached profiles for an instance, or null if not cached/expired
     */
    getProfiles(instanceType: 'radarr' | 'sonarr', instanceId: number): Record<string, number> | null {
        const key = `${instanceType}-${instanceId}-profiles`;
        const entry = this.cache.get(key);

        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Cache profiles for an instance
     */
    setProfiles(instanceType: 'radarr' | 'sonarr', instanceId: number, profiles: Record<string, number>, ttlMs?: number): void {
        const key = `${instanceType}-${instanceId}-profiles`;
        this.cache.set(key, {
            data: profiles,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs)
        });
    }

    /**
     * Get cached tags for an instance
     */
    getTags(instanceType: 'radarr' | 'sonarr', instanceId: number): Map<string, number> | null {
        const key = `${instanceType}-${instanceId}-tags`;
        const entry = this.cache.get(key);

        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Cache tags for an instance
     */
    setTags(instanceType: 'radarr' | 'sonarr', instanceId: number, tags: Map<string, number>, ttlMs?: number): void {
        const key = `${instanceType}-${instanceId}-tags`;
        this.cache.set(key, {
            data: tags,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs)
        });
    }

    /**
     * Invalidate cache for a specific instance
     */
    invalidate(instanceType: 'radarr' | 'sonarr', instanceId: number): void {
        const profileKey = `${instanceType}-${instanceId}-profiles`;
        const tagKey = `${instanceType}-${instanceId}-tags`;
        this.cache.delete(profileKey);
        this.cache.delete(tagKey);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Export singleton instance
export const profileCache = ProfileCache.getInstance();
