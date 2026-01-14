import { getRepository } from '../datasource';
import { OverseerrInstance } from '../entity/OverseerrInstance';
import { OverseerrClient } from '../lib/overseerrClient';

/**
 * Service for Overseerr webhook configuration status checks.
 *
 * NOTE: Auto-configuration via API is not supported because Overseerr has a bug
 * where their GET API returns jsonPayload as a parsed object, but their UI's
 * JSONEditor expects a string. This causes the webhook settings page to crash
 * with "e.match is not a function" error. This affects Overseerr, Jellyseerr,
 * and Seerr (all share the same codebase).
 *
 * Users must manually configure webhooks in Overseerr's UI.
 */
export class OverseerrConfigService {

    /**
     * Gets the webhook URL that users should configure in Overseerr.
     * @param authToken The token for webhook authentication
     * @returns The webhook URL to use
     */
    public getWebhookUrl(authToken: string): string {
        return `http://langarr:8383/api/v1/webhook?token=${authToken}`;
    }

    /**
     * Checks if a webhook is already configured in Overseerr pointing to Langarr.
     * @returns Status of webhook configuration, or null if unavailable
     */
    public async getWebhookStatus(): Promise<{
        configured: boolean;
        enabled: boolean;
        webhookUrl: string;
        pointsToLangarr: boolean;
    } | null> {
        try {
            const overseerrRepo = getRepository(OverseerrInstance);
            const instance = await overseerrRepo
                .createQueryBuilder('overseerr')
                .addSelect('overseerr.apiKey')
                .where('overseerr.enabled = :enabled', { enabled: true })
                .getOne();

            if (!instance || !instance.apiKey) {
                return null;
            }

            const client = new OverseerrClient(instance.baseUrl, instance.apiKey);
            const settings = await client.getWebhookSettings();

            const webhookUrl = settings.options?.webhookUrl || '';
            const pointsToLangarr = webhookUrl.includes('/api/v1/webhook');

            return {
                configured: !!webhookUrl,
                enabled: settings.enabled,
                webhookUrl: webhookUrl,
                pointsToLangarr: pointsToLangarr
            };
        } catch (error) {
            console.error('[OverseerrConfig] Failed to get webhook status:', error);
            return null;
        }
    }
}
