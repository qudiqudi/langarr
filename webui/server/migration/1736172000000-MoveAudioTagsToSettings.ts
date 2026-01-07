import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MoveAudioTagsToSettings1736172000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new audioTagRules column to settings table if not exists
        const settingsTable = await queryRunner.getTable('settings');
        const hasAudioTagRules = settingsTable?.columns.find(col => col.name === 'audioTagRules');

        if (!hasAudioTagRules) {
            await queryRunner.addColumn('settings', new TableColumn({
                name: 'audioTagRules',
                type: 'text',
                isNullable: true
            }));
        }

        // Add audioTaggingEnabled column to radarr_instance table if not exists
        const radarrTable = await queryRunner.getTable('radarr_instance');
        const hasRadarrAudioTaggingEnabled = radarrTable?.columns.find(col => col.name === 'audioTaggingEnabled');

        if (!hasRadarrAudioTaggingEnabled) {
            await queryRunner.addColumn('radarr_instance', new TableColumn({
                name: 'audioTaggingEnabled',
                type: 'boolean',
                default: false
            }));
        }

        // Add audioTaggingEnabled column to sonarr_instance table if not exists
        const sonarrTable = await queryRunner.getTable('sonarr_instance');
        const hasSonarrAudioTaggingEnabled = sonarrTable?.columns.find(col => col.name === 'audioTaggingEnabled');

        if (!hasSonarrAudioTaggingEnabled) {
            await queryRunner.addColumn('sonarr_instance', new TableColumn({
                name: 'audioTaggingEnabled',
                type: 'boolean',
                default: false
            }));
        }

        // Migrate existing audioTags data from instances to global settings
        // First check if any instances have audioTags configured
        const radarrInstances = await queryRunner.query(
            'SELECT id, audioTags FROM radarr_instance WHERE audioTags IS NOT NULL'
        );
        const sonarrInstances = await queryRunner.query(
            'SELECT id, audioTags FROM sonarr_instance WHERE audioTags IS NOT NULL'
        );

        // If any instance has audioTags, merge them into global settings
        const allAudioTags = [...radarrInstances, ...sonarrInstances]
            .map(instance => {
                try {
                    return JSON.parse(instance.audioTags || '[]');
                } catch {
                    return [];
                }
            })
            .flat();

        // Remove duplicates based on language+tagName combination
        const uniqueAudioTags = Array.from(
            new Map(
                allAudioTags.map((tag: any) => [`${tag.language}-${tag.tagName}`, tag])
            ).values()
        );

        if (uniqueAudioTags.length > 0) {
            // Update settings with merged audio tags
            await queryRunner.query(
                'UPDATE settings SET audioTagRules = ? WHERE id = 1',
                [JSON.stringify(uniqueAudioTags)]
            );

            // Enable audio tagging for instances that had audioTags
            if (radarrInstances.length > 0) {
                const radarrIds = radarrInstances.map((i: any) => i.id);
                await queryRunner.query(
                    `UPDATE radarr_instance SET audioTaggingEnabled = 1 WHERE id IN (${radarrIds.join(',')})`
                );
            }

            if (sonarrInstances.length > 0) {
                const sonarrIds = sonarrInstances.map((i: any) => i.id);
                await queryRunner.query(
                    `UPDATE sonarr_instance SET audioTaggingEnabled = 1 WHERE id IN (${sonarrIds.join(',')})`
                );
            }
        }

        // Drop old audioTags columns
        const hasRadarrAudioTags = radarrTable?.columns.find(col => col.name === 'audioTags');
        if (hasRadarrAudioTags) {
            await queryRunner.dropColumn('radarr_instance', 'audioTags');
        }

        const hasSonarrAudioTags = sonarrTable?.columns.find(col => col.name === 'audioTags');
        if (hasSonarrAudioTags) {
            await queryRunner.dropColumn('sonarr_instance', 'audioTags');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rollback: restore audioTags columns
        await queryRunner.addColumn('radarr_instance', new TableColumn({
            name: 'audioTags',
            type: 'text',
            isNullable: true
        }));

        await queryRunner.addColumn('sonarr_instance', new TableColumn({
            name: 'audioTags',
            type: 'text',
            isNullable: true
        }));

        // Remove new columns
        await queryRunner.dropColumn('radarr_instance', 'audioTaggingEnabled');
        await queryRunner.dropColumn('sonarr_instance', 'audioTaggingEnabled');
        await queryRunner.dropColumn('settings', 'audioTagRules');
    }
}
