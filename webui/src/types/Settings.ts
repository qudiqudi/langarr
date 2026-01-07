export interface AudioTagRule {
    language: string;  // ISO 639-1 code (e.g., "de", "fr")
    tagName: string;   // Tag name to apply (e.g., "german-audio")
}

export interface Settings {
    id: number;
    syncIntervalHours: number;
    runSyncOnStartup: boolean;
    webhookEnabled: boolean;
    webhookAuthToken?: string;
    langarrBaseUrl?: string;
    audioTagRules: AudioTagRule[];
    dryRunMode: boolean;
    updatedAt: string;
}
