/**
 * Rate limiter for Radarr/Sonarr search requests.
 * Prevents hammering the API with too many search requests.
 *
 * Two levels of rate limiting:
 * 1. Per-item cooldown: Prevents searching the same movie/series too frequently
 * 2. Global rate limit: Ensures minimum interval between any searches for an instance
 */
export class SearchRateLimiter {
    // Map of instanceKey -> Map of itemId -> lastSearchTimestamp
    private itemCooldowns = new Map<string, Map<number, number>>();
    // Map of instanceKey -> lastGlobalSearchTimestamp
    private lastGlobalSearch = new Map<string, number>();

    /**
     * Check if enough time has passed to allow a search for this item.
     * Does NOT record the search - call recordSearch() after successful search.
     */
    canSearch(
        instanceKey: string,
        itemId: number,
        cooldownSeconds: number,
        minIntervalSeconds: number
    ): { allowed: boolean; waitMs: number; reason?: string } {
        const now = Date.now();

        // Check global rate limit first
        const lastGlobal = this.lastGlobalSearch.get(instanceKey) || 0;
        const globalWait = Math.max(0, (minIntervalSeconds * 1000) - (now - lastGlobal));
        if (globalWait > 0) {
            return {
                allowed: false,
                waitMs: globalWait,
                reason: `Global rate limit: ${Math.ceil(globalWait / 1000)}s remaining`
            };
        }

        // Check per-item cooldown
        const instanceCooldowns = this.itemCooldowns.get(instanceKey);
        if (instanceCooldowns) {
            const lastItemSearch = instanceCooldowns.get(itemId) || 0;
            const itemWait = Math.max(0, (cooldownSeconds * 1000) - (now - lastItemSearch));
            if (itemWait > 0) {
                return {
                    allowed: false,
                    waitMs: itemWait,
                    reason: `Item cooldown: ${Math.ceil(itemWait / 1000)}s remaining`
                };
            }
        }

        return { allowed: true, waitMs: 0 };
    }

    /**
     * Record that a search was performed for an item.
     * Should be called after the search API call succeeds.
     */
    recordSearch(instanceKey: string, itemId: number): void {
        const now = Date.now();

        // Record global search timestamp
        this.lastGlobalSearch.set(instanceKey, now);

        // Record item search timestamp
        if (!this.itemCooldowns.has(instanceKey)) {
            this.itemCooldowns.set(instanceKey, new Map());
        }
        this.itemCooldowns.get(instanceKey)!.set(itemId, now);
    }

    /**
     * Wait until the global rate limit allows a search.
     * Returns immediately if no wait is needed.
     */
    async waitForGlobalRateLimit(instanceKey: string, minIntervalSeconds: number): Promise<void> {
        const now = Date.now();
        const lastGlobal = this.lastGlobalSearch.get(instanceKey) || 0;
        const waitMs = Math.max(0, (minIntervalSeconds * 1000) - (now - lastGlobal));

        if (waitMs > 0) {
            await this.sleep(waitMs);
        }
    }

    /**
     * Check if item is on cooldown (searched recently).
     */
    isItemOnCooldown(instanceKey: string, itemId: number, cooldownSeconds: number): boolean {
        const now = Date.now();
        const instanceCooldowns = this.itemCooldowns.get(instanceKey);
        if (!instanceCooldowns) return false;

        const lastItemSearch = instanceCooldowns.get(itemId) || 0;
        return (now - lastItemSearch) < (cooldownSeconds * 1000);
    }

    /**
     * Clear cooldown data for an instance.
     * Useful when instance settings change.
     */
    clearInstance(instanceKey: string): void {
        this.itemCooldowns.delete(instanceKey);
        this.lastGlobalSearch.delete(instanceKey);
    }

    /**
     * Clear all cooldown data.
     */
    clearAll(): void {
        this.itemCooldowns.clear();
        this.lastGlobalSearch.clear();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance for use across the application
export const searchRateLimiter = new SearchRateLimiter();
