import axios, { AxiosInstance } from 'axios';

export class ArrClient {
    private client: AxiosInstance;

    constructor(baseUrl: string, apiKey: string) {
        // Ensure baseUrl doesn't end with slash and has /api/v3 (or appropriate version)
        const cleanUrl = baseUrl.replace(/\/$/, '');
        console.log(`[ArrClient] Initializing for ${cleanUrl} with key length: ${apiKey?.length}`);

        // We'll rely on the caller to provide the full base URL including /api/v3 if needed, 
        // or we can append it. usually Radarr/Sonarr use /api/v3.
        // Let's assume the user provides the root URL (e.g. http://localhost:7878) and we append /api/v3

        this.client = axios.create({
            baseURL: cleanUrl,
            params: {
                apikey: apiKey,
            },
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 10000,
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/api/v3/system/status');
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async getProfiles() {
        const response = await this.client.get('/api/v3/qualityprofile');
        return response.data;
    }

    async getTags() {
        const response = await this.client.get('/api/v3/tag');
        return response.data;
    }

    async createTag(label: string) {
        const response = await this.client.post('/api/v3/tag', { label });
        return response.data;
    }

    // Radarr specific
    async getLanguages() {
        // Radarr v3 uses /api/v3/language
        const response = await this.client.get('/api/v3/language');
        return response.data;
    }

    // Radarr Methods
    async getMovies() {
        const response = await this.client.get('/api/v3/movie');
        return response.data;
    }

    async getMovie(id: number) {
        const response = await this.client.get(`/api/v3/movie/${id}`);
        return response.data;
    }

    async updateMovie(id: number, movieData: any) {
        const response = await this.client.put(`/api/v3/movie/${id}`, movieData, {
            params: { moveFiles: false } // Safety first
        });
        return response.data;
    }

    async getMovieFile(movieFileId: number) {
        const response = await this.client.get(`/api/v3/moviefile/${movieFileId}`);
        return response.data;
    }

    // Sonarr Methods
    async getSeries() {
        const response = await this.client.get('/api/v3/series');
        return response.data;
    }

    async getSeriesById(id: number) {
        const response = await this.client.get(`/api/v3/series/${id}`);
        return response.data;
    }

    async updateSeries(id: number, seriesData: any) {
        const response = await this.client.put(`/api/v3/series/${id}`, seriesData, {
            params: { moveFiles: false }
        });
        return response.data;
    }

    async getEpisodes(seriesId: number) {
        const response = await this.client.get('/api/v3/episode', {
            params: { seriesId }
        });
        return response.data;
    }

    async getEpisodeFile(episodeFileId: number) {
        const response = await this.client.get(`/api/v3/episodefile/${episodeFileId}`);
        return response.data;
    }
    /**
     * Get episode files.
     * If seriesId is provided, fetches files for that series (standard).
     * If seriesId is omitted, attempts to fetch ALL episode files (if API supports it).
     */
    async getEpisodeFiles(seriesId?: number): Promise<any[]> {
        const url = seriesId ? `/episodefile?seriesId=${seriesId}` : '/episodefile';
        const { data } = await this.client.get(url);
        return data;
    }

    // Get all movie files (includes mediaInfo) - Radarr only
    async getMovieFiles() {
        const response = await this.client.get('/api/v3/moviefile');
        return response.data;
    }

    // Command
    async runCommand(name: string, opts: any = {}) {
        const response = await this.client.post('/api/v3/command', {
            name, ...opts
        });
        return response.data;
    }

    // Search commands
    // Radarr: MoviesSearch with movieIds array
    async searchMovie(movieId: number): Promise<any> {
        return this.runCommand('MoviesSearch', { movieIds: [movieId] });
    }

    // Sonarr: SeriesSearch with seriesId
    async searchSeries(seriesId: number): Promise<any> {
        return this.runCommand('SeriesSearch', { seriesId });
    }

    // Efficient lookup by TMDb ID (avoids fetching entire library)
    async getMovieByTmdbId(tmdbId: number): Promise<any | null> {
        const response = await this.client.get('/api/v3/movie', {
            params: { tmdbId }
        });
        return response.data?.[0] || null;
    }

    // Efficient lookup by TVDb ID
    async getSeriesByTvdbId(tvdbId: number): Promise<any | null> {
        const response = await this.client.get('/api/v3/series', {
            params: { tvdbId }
        });
        return response.data?.[0] || null;
    }
}


