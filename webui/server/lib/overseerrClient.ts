import axios, { AxiosInstance } from 'axios';

export interface OverseerrRequest {
    id: number;
    status: number; // 1 = PENDING_APPROVAL
    requestedBy: {
        id: number;
        email: string;
        username: string;
    };
    type: 'movie' | 'tv';
    media: {
        tmdbId: number;
        imdbId?: string;
        tvdbId?: number;
        status: number; // 1 = UNKNOWN, 2 = PENDING, 3 = PROCESSING, 4 = PARTIALLY_AVAILABLE, 5 = AVAILABLE
        title?: string;
    };
    seasons?: {
        seasonNumber: number;
        status: number;
    }[];
    serverId?: number;
    profileId?: number;
    rootFolder?: string;
    languageProfileId?: number;
}

export interface OverseerrMedia {
    id: number;
    tmdbId: number;
    originalLanguage?: string;
}

export interface OverseerrProfile {
    id: number;
    name: string;
}

export class OverseerrClient {
    private client: AxiosInstance;

    constructor(baseUrl: string, apiKey: string) {
        const cleanUrl = baseUrl.replace(/\/$/, '');
        this.client = axios.create({
            baseURL: cleanUrl,
            headers: {
                'X-Api-Key': apiKey,
            },
            timeout: 10000,
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/api/v1/status');
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    // --- Settings & Metadata ---

    async getRadarrServers() {
        const response = await this.client.get('/api/v1/settings/radarr');
        return response.data;
    }

    async getSonarrServers() {
        const response = await this.client.get('/api/v1/settings/sonarr');
        return response.data;
    }

    // --- Requests ---

    async getPendingRequests(): Promise<OverseerrRequest[]> {
        const response = await this.client.get('/api/v1/request', {
            params: {
                take: 100,
                filter: 'pending',
                sort: 'added',
            },
        });
        return response.data.results;
    }

    async updateRequest(requestId: number, payload: { mediaType: 'movie' | 'tv'; profileId: number; seasons?: number[] }) {
        // PUT /api/v1/request/:requestId
        const response = await this.client.put(`/api/v1/request/${requestId}`, payload);
        return response.data;
    }

    // --- Media Info (for Original Language) ---

    async getMovie(tmdbId: number): Promise<OverseerrMedia> {
        const response = await this.client.get(`/api/v1/movie/${tmdbId}`);
        return response.data;
    }

    async getShow(tmdbId: number): Promise<OverseerrMedia> {
        const response = await this.client.get(`/api/v1/tv/${tmdbId}`);
        return response.data;
    }

    // --- Proxy to Arr instances ---

    async getServerProfiles(serviceType: 'radarr' | 'sonarr', serverId: number): Promise<OverseerrProfile[]> {
        // GET /api/v1/service/:serviceType/:serverId
        // Returns the server config including profiles
        const response = await this.client.get(`/api/v1/service/${serviceType}/${serverId}`);
        return response.data.profiles;
    }

    // --- Webhook Status (Read-only) ---
    // NOTE: Auto-configuration removed due to Overseerr UI bug.
    // Their GET API returns jsonPayload as object but UI expects string.

    async getWebhookSettings(): Promise<WebhookSettings> {
        const response = await this.client.get('/api/v1/settings/notifications/webhook');
        return response.data;
    }
}

export interface WebhookSettings {
    enabled: boolean;
    types: number;
    options: {
        webhookUrl: string;
        jsonPayload: string | object;
    };
}
