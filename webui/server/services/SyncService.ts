import { getRepository } from '../datasource';
import { SyncLog } from '../entity/SyncLog';
import { RadarrInstance } from '../entity/RadarrInstance';
import { SonarrInstance } from '../entity/SonarrInstance';
import { Settings } from '../entity/Settings';
import { ArrClient } from '../lib/arrClient';
import ISO6391 from 'iso-639-1';
import { OverseerrInstance } from '../entity/OverseerrInstance';
import { OverseerrClient } from '../lib/overseerrClient';
import { broadcastLogEntry } from '../routes/logs';
import { searchRateLimiter } from '../lib/searchRateLimiter';
import { profileCache } from '../lib/profileCache';

export interface SyncOptions {
    dryRun?: boolean;
}

export class SyncService {
    private processing = new Set<string>();
    private static readonly CONCURRENCY_LIMIT = 3; // Max parallel instance processing

    private async log(level: 'info' | 'error' | 'warn' | 'debug', message: string, source: 'sync' | 'system' = 'sync', metadata?: Record<string, unknown>) {
        // Console log for immediate feedback
        if (level === 'error') console.error(`[${source}] ${message}`, metadata || '');
        else console.log(`[${source}] ${message}`, metadata || '');

        // Persist to DB
        try {
            const logRepo = getRepository(SyncLog);
            const entry = new SyncLog();
            entry.level = level;
            entry.source = source;
            entry.message = message;
            if (metadata) entry.setMetadata(metadata);
            const savedEntry = await logRepo.save(entry);

            // Broadcast to SSE clients
            broadcastLogEntry(savedEntry);
        } catch (err) {
            console.error('Failed to save log entry:', err);
        }
    }

    async syncAll(options?: SyncOptions) {
        await this.log('info', `Starting global sync... ${options?.dryRun ? '(Dry Run)' : ''}`);
        await this.syncRadarr(undefined, options);
        await this.syncSonarr(undefined, options);
        await this.syncOverseerr(undefined, options);
        await this.log('info', 'Global sync completed.');
    }

    async syncOverseerr(instanceId?: number, options?: SyncOptions) {
        const repo = getRepository(OverseerrInstance);
        const query = repo.createQueryBuilder('instance')
            .addSelect('instance.apiKey');

        if (instanceId) {
            query.where('instance.id = :id', { id: instanceId });
        }

        const instances = await query.getMany();

        for (const instance of instances) {
            if (!instance.enabled) continue;
            const key = `overseerr-${instance.id}`;
            if (this.processing.has(key)) {
                await this.log('warn', `Skipping Overseerr ${instance.name}, already processing.`);
                continue;
            }

            this.processing.add(key);
            try {
                await this.processOverseerrInstance(instance, options);
            } catch (err) {
                await this.log('error', `Error processing Overseerr ${instance.name}`, 'sync', { error: String(err) });
            } finally {
                this.processing.delete(key);
            }
        }
    }

    async syncRadarr(instanceId?: number, options?: SyncOptions) {
        const repo = getRepository(RadarrInstance);
        const query = repo.createQueryBuilder('instance')
            .addSelect('instance.apiKey');

        if (instanceId) {
            query.where('instance.id = :id', { id: instanceId });
        }

        const instances = await query.getMany();

        // Filter enabled instances and check if already processing
        const instancesToProcess = instances.filter(instance => {
            if (!instance.enabled) return false;
            const key = `radarr-${instance.id}`;
            if (this.processing.has(key)) {
                this.log('warn', `Skipping Radarr ${instance.name}, already processing.`);
                return false;
            }
            return true;
        });

        // Process instances in parallel with concurrency limit
        await this.processInParallel(
            instancesToProcess,
            async (instance) => {
                const key = `radarr-${instance.id}`;
                this.processing.add(key);
                try {
                    await this.processRadarrInstance(instance, options);
                } catch (err) {
                    await this.log('error', `Error processing Radarr ${instance.name}`, 'sync', { error: String(err) });
                } finally {
                    this.processing.delete(key);
                }
            },
            SyncService.CONCURRENCY_LIMIT
        );
    }

    async syncSonarr(instanceId?: number, options?: SyncOptions) {
        const repo = getRepository(SonarrInstance);
        const query = repo.createQueryBuilder('instance')
            .addSelect('instance.apiKey');

        if (instanceId) {
            query.where('instance.id = :id', { id: instanceId });
        }

        const instances = await query.getMany();

        // Filter enabled instances and check if already processing
        const instancesToProcess = instances.filter(instance => {
            if (!instance.enabled) return false;
            const key = `sonarr-${instance.id}`;
            if (this.processing.has(key)) {
                this.log('warn', `Skipping Sonarr ${instance.name}, already processing.`);
                return false;
            }
            return true;
        });

        // Process instances in parallel with concurrency limit
        await this.processInParallel(
            instancesToProcess,
            async (instance) => {
                const key = `sonarr-${instance.id}`;
                this.processing.add(key);
                try {
                    await this.processSonarrInstance(instance, options);
                } catch (err) {
                    await this.log('error', `Error processing Sonarr ${instance.name}`, 'sync', { error: String(err) });
                } finally {
                    this.processing.delete(key);
                }
            },
            SyncService.CONCURRENCY_LIMIT
        );
    }

    private async processRadarrInstance(instance: RadarrInstance, options?: SyncOptions) {
        await this.log('info', `Processing Radarr: ${instance.name}`);
        const client = new ArrClient(instance.baseUrl, instance.apiKey);

        // Check global settings for dryRun if not provided in options
        let isDryRun = options?.dryRun;
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });

        if (isDryRun === undefined) {
            isDryRun = settings?.dryRunMode || false;
        }

        if (isDryRun) {
            await this.log('info', `DRY RUN ACTIVE for ${instance.name}`);
        }

        // Fetch profiles to resolve names to IDs (with caching)
        let profileNameToId = profileCache.getProfiles('radarr', instance.id);
        if (!profileNameToId) {
            const profiles = await client.getProfiles();
            profileNameToId = {};
            profiles.forEach((p: any) => { profileNameToId![p.name] = p.id; });
            profileCache.setProfiles('radarr', instance.id, profileNameToId);
        }

        // Resolve profile names to IDs
        const originalProfileId = profileNameToId[instance.originalProfile] ?? null;
        const dubProfileId = profileNameToId[instance.dubProfile] ?? null;

        if (!originalProfileId && instance.originalProfile) {
            await this.log('warn', `Could not find profile '${instance.originalProfile}' for ${instance.name}`);
        }
        if (!dubProfileId && instance.dubProfile) {
            await this.log('warn', `Could not find profile '${instance.dubProfile}' for ${instance.name}`);
        }

        const clientSettings = await client.getMovies();

        const originalLanguages = instance.getOriginalLanguages(); // e.g., ['en', 'fr']

        // Get global audio tag rules if audio tagging is enabled for this instance
        const audioTags = instance.audioTaggingEnabled && settings
            ? settings.getAudioTagRules()
            : [];

        const targetTagId = instance.tagName ? (await this.getOrCreateTagId(client, instance.tagName, isDryRun)) : null;

        let processedCount = 0;
        let lastTouchedItem: { title: string; poster: string | null; profile: string | null } | null = null;

        // Build reverse profile map (ID -> name) for display
        const profileIdToName: Record<number, string> = {};
        Object.entries(profileNameToId).forEach(([name, id]) => { profileIdToName[id] = name; });

        for (const movie of clientSettings) {
            const updated = await this.processMovie(client, instance, movie, originalLanguages, audioTags, targetTagId, isDryRun, originalProfileId, dubProfileId);
            if (updated) {
                processedCount++;
                // Determine which profile was assigned
                const assignedProfileId = originalLanguages.includes(movie.originalLanguage?.code || '') ? originalProfileId : dubProfileId;
                const profileName = assignedProfileId ? profileIdToName[assignedProfileId] : null;
                // Track last touched item for dashboard display
                lastTouchedItem = {
                    title: movie.title || 'Unknown',
                    poster: movie.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || null,
                    profile: profileName || null
                };
            }
        }
        await this.log('info', `${isDryRun ? '[DRY RUN] Would have updated' : 'Updated'} ${processedCount} movies for ${instance.name}`);

        // Update instance with sync tracking info (skip for dry runs)
        if (!isDryRun) {
            const repo = getRepository(RadarrInstance);
            instance.lastSyncAt = new Date();
            if (lastTouchedItem) {
                instance.lastTouchedItemTitle = lastTouchedItem.title;
                instance.lastTouchedItemPoster = lastTouchedItem.poster || undefined;
                instance.lastTouchedItemProfile = lastTouchedItem.profile || undefined;
            }
            await repo.save(instance);
        }
    }

    private async processSonarrInstance(instance: SonarrInstance, options?: SyncOptions) {
        await this.log('info', `Processing Sonarr: ${instance.name}`);
        const client = new ArrClient(instance.baseUrl, instance.apiKey);

        // Check global settings for dryRun if not provided in options
        let isDryRun = options?.dryRun;
        if (isDryRun === undefined) {
            const settingsRepo = getRepository(Settings);
            const settings = await settingsRepo.findOne({ where: { id: 1 } });
            isDryRun = settings?.dryRunMode || false;
        }

        if (isDryRun) {
            await this.log('info', `DRY RUN ACTIVE for ${instance.name}`);
        }

        // Fetch profiles to resolve names to IDs (with caching)
        let profileNameToId = profileCache.getProfiles('sonarr', instance.id);
        if (!profileNameToId) {
            const profiles = await client.getProfiles();
            profileNameToId = {};
            profiles.forEach((p: any) => { profileNameToId![p.name] = p.id; });
            profileCache.setProfiles('sonarr', instance.id, profileNameToId);
        }

        const originalProfileId = profileNameToId[instance.originalProfile] ?? null;
        const dubProfileId = profileNameToId[instance.dubProfile] ?? null;

        if (!originalProfileId && instance.originalProfile) {
            await this.log('warn', `Could not find profile '${instance.originalProfile}' for ${instance.name}`);
        }
        if (!dubProfileId && instance.dubProfile) {
            await this.log('warn', `Could not find profile '${instance.dubProfile}' for ${instance.name}`);
        }

        const allSeries = await client.getSeries();

        const originalLanguages = instance.getOriginalLanguages();
        const targetTagId = instance.tagName ? (await this.getOrCreateTagId(client, instance.tagName, isDryRun)) : null;

        let processedCount = 0;
        let lastTouchedItem: { title: string; poster: string | null; profile: string | null } | null = null;

        // Build reverse profile map (ID -> name) for display
        const profileIdToName: Record<number, string> = {};
        Object.entries(profileNameToId).forEach(([name, id]) => { profileIdToName[id] = name; });

        for (const series of allSeries) {
            const updated = await this.processSeries(client, instance, series, originalLanguages, targetTagId, isDryRun, originalProfileId, dubProfileId);
            if (updated) {
                processedCount++;
                // Determine which profile was assigned
                const langName = series.originalLanguage?.name || series.originalLanguage || '';
                const langCode = ISO6391.getCode(langName) || 'xx';
                const assignedProfileId = originalLanguages.includes(langCode) ? originalProfileId : dubProfileId;
                const profileName = assignedProfileId ? profileIdToName[assignedProfileId] : null;
                // Track last touched item for dashboard display
                lastTouchedItem = {
                    title: series.title || 'Unknown',
                    poster: series.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || null,
                    profile: profileName || null
                };
            }
        }
        await this.log('info', `${isDryRun ? '[DRY RUN] Would have updated' : 'Updated'} ${processedCount} series for ${instance.name}`);

        // Update instance with sync tracking info (skip for dry runs)
        if (!isDryRun) {
            const repo = getRepository(SonarrInstance);
            instance.lastSyncAt = new Date();
            if (lastTouchedItem) {
                instance.lastTouchedItemTitle = lastTouchedItem.title;
                instance.lastTouchedItemPoster = lastTouchedItem.poster || undefined;
                instance.lastTouchedItemProfile = lastTouchedItem.profile || undefined;
            }
            await repo.save(instance);
        }
    }

    private async getOrCreateTagId(client: ArrClient, tagName: string, isDryRun: boolean = false): Promise<number | null> {
        if (!tagName) return null;
        try {
            const tags = await client.getTags();
            const existing = tags.find((t: any) => t.label.toLowerCase() === tagName.toLowerCase());
            if (existing) return existing.id;

            if (isDryRun) {
                // In dry run, we can't really "create" a tag without side effects, so we just return a dummy ID or null AND warn.
                // But realistically, if we return null, the logic above won't add the tag.
                // Let's pretend it exists with ID -1 for dry run logging purposes.
                return -1;
            }

            const newTag = await client.createTag(tagName);
            return newTag.id;
        } catch (error) {
            await this.log('error', 'Error creating tag', 'sync', { error: String(error) });
            return null;
        }
    }

    // --- Overseerr Logic ---

    private async processOverseerrInstance(instance: OverseerrInstance, options?: SyncOptions) {
        await this.log('info', `Processing Overseerr: ${instance.name}`);
        const client = new OverseerrClient(instance.baseUrl, instance.apiKey);

        // 1. Get Pending Requests
        let requests;
        try {
            requests = await client.getPendingRequests();
        } catch (e) {
            await this.log('error', `Failed to fetch pending requests from ${instance.name}: ${e}`);
            return;
        }

        if (requests.length === 0) {
            await this.log('info', `No pending requests for ${instance.name}`);
            return;
        }

        await this.log('info', `Found ${requests.length} pending requests for ${instance.name}`);

        // Load mappings
        const radarrMappings = instance.getRadarrServerMappings();
        const sonarrMappings = instance.getSonarrServerMappings();

        // Cache for profile names and IDs
        // type -> serverId -> ID -> Name
        const arrProfileCache: Record<string, Record<string, Record<number, string>>> = {};
        // type -> serverId -> Name -> ID (Overseerr side)
        const overseerrProfileCache: Record<string, Record<string, Record<string, number>>> = {};

        let updatedCount = 0;

        for (const request of requests) {
            try {
                // Determine type
                const isMovie = request.type === 'movie';
                const serviceType = isMovie ? 'radarr' : 'sonarr';

                // Determine server ID
                let serverId = request.serverId;
                const mappings = isMovie ? radarrMappings : sonarrMappings;

                // If no serverId, try default (first one)
                if ((serverId === undefined || serverId === null) && Object.keys(mappings).length > 0) {
                    serverId = parseInt(Object.keys(mappings)[0]);
                    await this.log('debug', `Request ${request.id} has no serverId, using default: ${serverId}`);
                }

                if (serverId === undefined || serverId === null) {
                    await this.log('warn', `Request ${request.id} has no serverId and no mappings configured. Skipping.`);
                    continue;
                }

                // Find mapped instance
                const instanceName = mappings[String(serverId)];
                if (!instanceName) {
                    await this.log('warn', `No mapping found for ${serviceType} server ${serverId} in Overseerr ${instance.name}`);
                    continue;
                }

                // Fetch the actual ArrInstance
                const arrRepo = isMovie ? getRepository(RadarrInstance) : getRepository(SonarrInstance);
                const arrInstance = await arrRepo.findOne({ where: { name: instanceName }, select: ['id', 'name', 'baseUrl', 'apiKey', 'originalLanguages', 'originalProfile', 'dubProfile'] });

                if (!arrInstance) {
                    await this.log('error', `Mapped instance '${instanceName}' not found in Langarr DB.`);
                    continue;
                }

                // Resolve Profile Names for this Arr Instance if not cached
                if (!arrProfileCache[serviceType]?.[serverId]) {
                    if (!arrProfileCache[serviceType]) arrProfileCache[serviceType] = {};

                    const arrClient = new ArrClient(arrInstance.baseUrl, arrInstance.apiKey);
                    const profiles = await arrClient.getProfiles();
                    const profileMap: Record<number, string> = {};
                    profiles.forEach((p: any) => profileMap[p.id] = p.name);

                    arrProfileCache[serviceType][serverId] = profileMap;
                }

                const profileNameMap = arrProfileCache[serviceType][serverId];

                // Get Target Profile Name (Original logic)
                const tmdbId = request.media.tmdbId;
                let originalLanguage: string | undefined;

                if (isMovie) {
                    const media = await client.getMovie(tmdbId);
                    originalLanguage = media.originalLanguage;
                } else {
                    const media = await client.getShow(tmdbId);
                    originalLanguage = media.originalLanguage;
                }

                if (!originalLanguage) {
                    await this.log('warn', `Could not determine language for request ${request.id}`);
                    continue;
                }

                const originalLanguages = (arrInstance as any).getOriginalLanguages(); // Cast to allow helper method access if types strictly checked
                const isOriginal = originalLanguages.includes(originalLanguage);

                const targetProfileId = isOriginal ? (arrInstance as any).originalProfile : (arrInstance as any).dubProfile;
                const targetProfileName = profileNameMap[Number(targetProfileId)];

                if (!targetProfileName) {
                    await this.log('error', `Could not find profile name for ID ${targetProfileId} on ${arrInstance.name}`);
                    continue;
                }

                // Resolve Overseerr Profile ID
                if (!overseerrProfileCache[serviceType]?.[serverId]) {
                    if (!overseerrProfileCache[serviceType]) overseerrProfileCache[serviceType] = {};

                    const profiles = await client.getServerProfiles(serviceType as 'radarr' | 'sonarr', serverId);
                    const nameMap: Record<string, number> = {};
                    profiles.forEach(p => nameMap[p.name] = p.id);

                    overseerrProfileCache[serviceType][serverId] = nameMap;
                }

                const overseerrProfileId = overseerrProfileCache[serviceType][serverId][targetProfileName];

                if (!overseerrProfileId) {
                    await this.log('error', `Could not map profile '${targetProfileName}' to ID on Overseerr server ${serverId}`);
                    continue;
                }

                // Check if already correct
                if (request.profileId === overseerrProfileId) {
                    // await this.log('debug', `Request ${request.id} already has correct profile`);
                    continue;
                }

                // Update Request
                const seasons = request.seasons?.map(s => s.seasonNumber);
                const dryRun = options?.dryRun;

                if (dryRun) {
                    await this.log('info', `[DRY RUN] Would update Request ${request.id} (${request.media.title || 'Unknown'}): ${originalLanguage} -> ${targetProfileName}`);
                } else {
                    await this.log('info', `Updating Request ${request.id} (${request.media.title || 'Unknown'}): ${originalLanguage} -> ${targetProfileName}`);

                    await client.updateRequest(request.id, {
                        mediaType: isMovie ? 'movie' : 'tv',
                        profileId: overseerrProfileId,
                        seasons: isMovie ? undefined : seasons
                    });

                    updatedCount++;
                }

            } catch (err) {
                await this.log('error', `Error processing request ${request.id}: ${err}`);
            }
        }

        await this.log('info', `Overseerr Sync: Updated ${updatedCount} requests for ${instance.name}`);
    }

    // --- Webhook Support ---

    async processSingleWebhookItem(mediaType: 'movie' | 'tv', tmdbId?: number, tvdbId?: number) {
        if (!tmdbId && !tvdbId) {
            await this.log('warn', 'Webhook received request without TMDb or TVDb ID', 'sync');
            return;
        }

        await this.log('info', `Webhook triggered for ${mediaType} (TMDb: ${tmdbId}, TVDb: ${tvdbId})`, 'system');

        if (mediaType === 'movie') {
            await this.processSingleMovieGlobally(tmdbId!);
        } else {
            await this.processSingleSeriesGlobally(tvdbId || tmdbId!);
        }
    }

    private async processSingleMovieGlobally(tmdbId: number) {
        const repo = getRepository(RadarrInstance);
        const instances = await repo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .where('instance.enabled = :enabled', { enabled: true })
            .getMany();
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });
        const isDryRun = settings?.dryRunMode || false;

        for (const instance of instances) {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);

                // Resolve profile IDs
                const profiles = await client.getProfiles();
                const profileNameToId: Record<string, number> = {};
                profiles.forEach((p: any) => { profileNameToId[p.name] = p.id; });
                const originalProfileId = profileNameToId[instance.originalProfile] ?? null;
                const dubProfileId = profileNameToId[instance.dubProfile] ?? null;

                // Use efficient TMDb lookup instead of fetching entire library
                const movie = await client.getMovieByTmdbId(tmdbId);

                if (movie) {
                    await this.log('info', `Found movie in Radarr ${instance.name}: ${movie.title}`);
                    const originalLanguages = instance.getOriginalLanguages();

                    // Get global audio tag rules if audio tagging is enabled for this instance
                    const audioTags = instance.audioTaggingEnabled && settings
                        ? settings.getAudioTagRules()
                        : [];

                    const targetTagId = instance.tagName ? (await this.getOrCreateTagId(client, instance.tagName, isDryRun)) : null;

                    await this.processMovie(client, instance, movie, originalLanguages, audioTags, targetTagId, isDryRun, originalProfileId, dubProfileId);
                }
            } catch (error) {
                await this.log('error', `Error checking Radarr ${instance.name} for movie ${tmdbId}: ${error}`, 'sync');
            }
        }
    }

    private async processSingleSeriesGlobally(tvdbId: number) {
        const repo = getRepository(SonarrInstance);
        const instances = await repo.createQueryBuilder('instance')
            .addSelect('instance.apiKey')
            .where('instance.enabled = :enabled', { enabled: true })
            .getMany();
        const settingsRepo = getRepository(Settings);
        const settings = await settingsRepo.findOne({ where: { id: 1 } });
        const isDryRun = settings?.dryRunMode || false;

        for (const instance of instances) {
            try {
                const client = new ArrClient(instance.baseUrl, instance.apiKey);

                // Resolve profile IDs
                const profiles = await client.getProfiles();
                const profileNameToId: Record<string, number> = {};
                profiles.forEach((p: any) => { profileNameToId[p.name] = p.id; });
                const originalProfileId = profileNameToId[instance.originalProfile] ?? null;
                const dubProfileId = profileNameToId[instance.dubProfile] ?? null;

                // Use efficient TVDb lookup instead of fetching entire library
                const series = await client.getSeriesByTvdbId(tvdbId);

                if (series) {
                    await this.log('info', `Found series in Sonarr ${instance.name}: ${series.title}`);
                    const originalLanguages = instance.getOriginalLanguages();
                    const targetTagId = instance.tagName ? (await this.getOrCreateTagId(client, instance.tagName, isDryRun)) : null;

                    await this.processSeries(client, instance, series, originalLanguages, targetTagId, isDryRun, originalProfileId, dubProfileId);
                }
            } catch (error) {
                await this.log('error', `Error checking Sonarr ${instance.name} for series ${tvdbId}: ${error}`, 'sync');
            }
        }
    }

    // --- Extracted Helpers ---

    private async processMovie(client: ArrClient, instance: RadarrInstance, movie: any, originalLanguages: string[], audioTags: any[], targetTagId: number | null, isDryRun: boolean, originalProfileId?: number | null, dubProfileId?: number | null): Promise<boolean> {
        // Skip unmonitored if configured
        if (instance.onlyMonitored && !movie.monitored) return false;

        let needsUpdate = false;
        let newProfileId = movie.qualityProfileId;
        let newTags = [...movie.tags];

        // 1. Profile Logic (Metadata based - Works without files)
        let metadataLangCode = 'xx';
        if (movie.originalLanguage) {
            if (typeof movie.originalLanguage === 'object' && movie.originalLanguage.code) {
                metadataLangCode = movie.originalLanguage.code;
            } else if (typeof movie.originalLanguage === 'object' && movie.originalLanguage.name) {
                metadataLangCode = ISO6391.getCode(movie.originalLanguage.name) || 'xx';
            } else if (typeof movie.originalLanguage === 'string') {
                if (movie.originalLanguage.length === 2) metadataLangCode = movie.originalLanguage;
                else metadataLangCode = ISO6391.getCode(movie.originalLanguage) || 'xx';
            }
        }

        const isOriginalHelper = originalLanguages.includes(metadataLangCode);

        // Apply Profile Rules using resolved IDs
        if (isOriginalHelper && originalProfileId) {
            if (movie.qualityProfileId !== originalProfileId) {
                newProfileId = originalProfileId;
                needsUpdate = true;
            }
        } else if (!isOriginalHelper && dubProfileId) {
            if (movie.qualityProfileId !== dubProfileId) {
                newProfileId = dubProfileId;
                needsUpdate = true;
                // Apply target tag if configured (Tagging for Dubs)
                if (targetTagId && !newTags.includes(targetTagId)) {
                    newTags.push(targetTagId);
                }
            }
        }

        // 2. Audio Tags (Requires File)
        if (movie.movieFile) {
            const languages = movie.movieFile.languages || [];
            const fileLangCodes = languages.map((l: any) => {
                // Radarr languages often { name: 'English' }
                return ISO6391.getCode(l.name) || 'xx';
            });

            for (const rule of audioTags) {
                if (fileLangCodes.includes(rule.language)) {
                    const ruleTagId = await this.getOrCreateTagId(client, rule.tagName, isDryRun);
                    if (ruleTagId && !newTags.includes(ruleTagId)) {
                        newTags.push(ruleTagId);
                        needsUpdate = true;
                    }
                }
            }
        }

        if (needsUpdate) {
            if (isDryRun) {
                await this.log('info', `[DRY RUN] Would update movie ${movie.title} (ID: ${movie.id}) -> Profile: ${newProfileId}, Tags: ${newTags}`);
                if (instance.triggerSearchOnUpdate) {
                    await this.log('info', `[DRY RUN] Would trigger search for ${movie.title}`);
                }
            } else {
                await this.log('info', `Updating movie ${movie.title} (ID: ${movie.id})`);
                // Fetch fresh movie data to ensure we have all required fields for the PUT request
                const fullMovie = await client.getMovie(movie.id);
                try {
                    const profileToSend = Number(newProfileId);
                    await this.log('debug', `Updating movie ${movie.id} with profile ${profileToSend} (original value: ${newProfileId}, type: ${typeof newProfileId})`);
                    await client.updateMovie(movie.id, {
                        ...fullMovie,
                        qualityProfileId: profileToSend,
                        tags: newTags
                    });

                    // Trigger search if enabled
                    if (instance.triggerSearchOnUpdate) {
                        await this.triggerMovieSearch(client, instance, movie.id, movie.title);
                    }
                } catch (updateError: any) {
                    // Log detailed error for debugging
                    if (updateError.response) {
                        await this.log('error', `Radarr API error updating ${movie.title}: Status ${updateError.response.status}`, 'sync', {
                            data: updateError.response.data,
                            movieId: movie.id
                        });
                    }
                    throw updateError;
                }
            }
            return true;
        }
        return false;
    }

    private async triggerMovieSearch(client: ArrClient, instance: RadarrInstance, movieId: number, movieTitle: string): Promise<void> {
        const instanceKey = `radarr-${instance.id}`;

        // Check if item is on cooldown (recently searched)
        if (searchRateLimiter.isItemOnCooldown(instanceKey, movieId, instance.searchCooldownSeconds)) {
            await this.log('debug', `Skipping search for ${movieTitle}: on cooldown`);
            return;
        }

        // Wait for global rate limit
        await searchRateLimiter.waitForGlobalRateLimit(instanceKey, instance.minSearchIntervalSeconds);

        try {
            await client.searchMovie(movieId);
            searchRateLimiter.recordSearch(instanceKey, movieId);
            await this.log('info', `Triggered search for movie: ${movieTitle}`);
        } catch (error: any) {
            await this.log('warn', `Failed to trigger search for ${movieTitle}: ${error.message || error}`);
        }
    }

    private async processSeries(client: ArrClient, instance: SonarrInstance, series: any, originalLanguages: string[], targetTagId: number | null, isDryRun: boolean, originalProfileId?: number | null, dubProfileId?: number | null): Promise<boolean> {
        if (instance.onlyMonitored && !series.monitored) return false;

        let needsUpdate = false;
        let newProfileId = series.qualityProfileId;
        let newTags = [...series.tags];

        // Normalize Series Language
        const langName = series.originalLanguage?.name || series.originalLanguage || '';
        const langCode = ISO6391.getCode(langName) || 'xx';

        const isOriginal = originalLanguages.includes(langCode);

        if (isOriginal && originalProfileId) {
            if (series.qualityProfileId !== originalProfileId) {
                newProfileId = originalProfileId;
                needsUpdate = true;
            }
        } else if (!isOriginal && dubProfileId) {
            if (series.qualityProfileId !== dubProfileId) {
                newProfileId = dubProfileId;
                needsUpdate = true;
                // Apply target tag
                if (targetTagId && !newTags.includes(targetTagId)) {
                    newTags.push(targetTagId);
                }
            }
        }

        if (needsUpdate) {
            if (isDryRun) {
                await this.log('info', `[DRY RUN] Would update series ${series.title} (ID: ${series.id}) -> Profile: ${newProfileId}, Tags: ${newTags}`);
                if (instance.triggerSearchOnUpdate) {
                    await this.log('info', `[DRY RUN] Would trigger search for ${series.title}`);
                }
            } else {
                await this.log('info', `Updating series ${series.title} (ID: ${series.id})`);
                await client.updateSeries(series.id, {
                    ...series,
                    qualityProfileId: newProfileId,
                    tags: newTags
                });

                // Trigger search if enabled
                if (instance.triggerSearchOnUpdate) {
                    await this.triggerSeriesSearch(client, instance, series.id, series.title);
                }
            }
            return true;
        }
        return false;
    }

    private async triggerSeriesSearch(client: ArrClient, instance: SonarrInstance, seriesId: number, seriesTitle: string): Promise<void> {
        const instanceKey = `sonarr-${instance.id}`;

        // Check if item is on cooldown (recently searched)
        if (searchRateLimiter.isItemOnCooldown(instanceKey, seriesId, instance.searchCooldownSeconds)) {
            await this.log('debug', `Skipping search for ${seriesTitle}: on cooldown`);
            return;
        }

        // Wait for global rate limit
        await searchRateLimiter.waitForGlobalRateLimit(instanceKey, instance.minSearchIntervalSeconds);

        try {
            await client.searchSeries(seriesId);
            searchRateLimiter.recordSearch(instanceKey, seriesId);
            await this.log('info', `Triggered search for series: ${seriesTitle}`);
        } catch (error: any) {
            await this.log('warn', `Failed to trigger search for ${seriesTitle}: ${error.message || error}`);
        }
    }

    /**
     * Process items in parallel with a concurrency limit
     */
    private async processInParallel<T>(
        items: T[],
        processor: (item: T) => Promise<void>,
        concurrencyLimit: number
    ): Promise<void> {
        if (items.length === 0) return;

        const executing: Promise<void>[] = [];

        for (const item of items) {
            const promise = processor(item).then(() => {
                executing.splice(executing.indexOf(promise), 1);
            });
            executing.push(promise);

            if (executing.length >= concurrencyLimit) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
    }
}
