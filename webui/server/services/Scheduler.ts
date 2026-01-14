import { SyncService } from './SyncService';
import { getRepository } from '../datasource';
import { RadarrInstance } from '../entity/RadarrInstance';
import { SonarrInstance } from '../entity/SonarrInstance';
import { OverseerrInstance } from '../entity/OverseerrInstance';
import { Settings } from '../entity/Settings';

export class Scheduler {
    private syncService: SyncService;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private intervals: Map<string, number> = new Map(); // Track current intervals for change detection
    private running: boolean = false;
    private startTime: Date | null = null;
    private hasRunStartup: Set<string> = new Set();

    constructor() {
        this.syncService = new SyncService();
    }

    start() {
        console.log('[Scheduler] Starting scheduler...');
        this.running = true;
        this.startTime = new Date();
        this.scheduleJobs();
        // Refresh jobs every 5 minutes to catch config changes
        setInterval(() => this.scheduleJobs(), 5 * 60 * 1000);
    }

    isRunning(): boolean {
        return this.running;
    }

    getStartTime(): Date | null {
        return this.startTime;
    }

    private async scheduleJobs() {
        // Get global settings for sync interval
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });
        const syncIntervalHours = settings?.syncIntervalHours || 24;
        const runOnStartup = settings?.runSyncOnStartup ?? true;

        // Radarr instances - use per-instance or global sync interval
        const radarrRepo = getRepository(RadarrInstance);
        const radarrInstances = await radarrRepo.find();

        for (const instance of radarrInstances) {
            const instanceInterval = instance.syncIntervalHours ?? syncIntervalHours;
            this.ensureArrJob(
                `radarr-${instance.id}`,
                instance,
                instanceInterval,
                runOnStartup,
                () => this.syncService.syncRadarr(instance.id)
            );
        }

        // Sonarr instances - use per-instance or global sync interval
        const sonarrRepo = getRepository(SonarrInstance);
        const sonarrInstances = await sonarrRepo.find();

        for (const instance of sonarrInstances) {
            const instanceInterval = instance.syncIntervalHours ?? syncIntervalHours;
            this.ensureArrJob(
                `sonarr-${instance.id}`,
                instance,
                instanceInterval,
                runOnStartup,
                () => this.syncService.syncSonarr(instance.id)
            );
        }

        // Overseerr instances - use their own poll interval
        const overseerrRepo = getRepository(OverseerrInstance);
        const overseerrInstances = await overseerrRepo.find();

        for (const instance of overseerrInstances) {
            this.ensureOverseerrJob(
                `overseerr-${instance.id}`,
                instance,
                runOnStartup,
                () => this.syncService.syncOverseerr(instance.id)
            );
        }
    }

    private ensureArrJob(
        key: string,
        instance: { enabled: boolean; syncIntervalHours?: number },
        syncIntervalHours: number,
        runOnStartup: boolean,
        callback: () => void
    ) {
        if (!instance.enabled) {
            this.clearJob(key);
            return;
        }

        const intervalMs = syncIntervalHours * 60 * 60 * 1000;
        const currentInterval = this.intervals.get(key);

        // Check if interval changed - if so, recreate the timer
        if (this.timers.has(key) && currentInterval !== intervalMs) {
            console.log(`[Scheduler] Interval changed for ${key}: ${currentInterval}ms -> ${intervalMs}ms, recreating timer`);
            this.clearJob(key);
        }

        if (!this.timers.has(key)) {
            console.log(`[Scheduler] Scheduling ${key} every ${syncIntervalHours}h`);

            // Run on startup if enabled and not already run
            if (runOnStartup && !this.hasRunStartup.has(key)) {
                this.hasRunStartup.add(key);
                callback();
            }

            const timer = setInterval(callback, intervalMs);
            this.timers.set(key, timer);
            this.intervals.set(key, intervalMs);
        }
    }

    private ensureOverseerrJob(
        key: string,
        instance: { enabled: boolean; pollIntervalMinutes: number },
        runOnStartup: boolean,
        callback: () => void
    ) {
        if (!instance.enabled) {
            this.clearJob(key);
            return;
        }

        const intervalMs = Math.max(instance.pollIntervalMinutes, 1) * 60 * 1000;
        const currentInterval = this.intervals.get(key);

        // Check if interval changed - if so, recreate the timer
        if (this.timers.has(key) && currentInterval !== intervalMs) {
            console.log(`[Scheduler] Interval changed for ${key}: ${currentInterval}ms -> ${intervalMs}ms, recreating timer`);
            this.clearJob(key);
        }

        if (!this.timers.has(key)) {
            console.log(`[Scheduler] Scheduling ${key} every ${instance.pollIntervalMinutes}m`);

            // Run on startup if enabled and not already run
            if (runOnStartup && !this.hasRunStartup.has(key)) {
                this.hasRunStartup.add(key);
                callback();
            }

            const timer = setInterval(callback, intervalMs);
            this.timers.set(key, timer);
            this.intervals.set(key, intervalMs);
        }
    }

    private clearJob(key: string) {
        if (this.timers.has(key)) {
            clearInterval(this.timers.get(key));
            this.timers.delete(key);
            this.intervals.delete(key);
            this.hasRunStartup.delete(key);
            console.log(`[Scheduler] Stopped job for ${key}`);
        }
    }
}
