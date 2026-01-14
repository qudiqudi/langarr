/**
 * Audio Tag Processor
 *
 * Processes audio track languages from mediaInfo and applies tags.
 * Unlike profile assignment (which uses original language metadata),
 * this inspects the actual mediaInfo of imported files to detect
 * which audio tracks are present.
 */

import { AudioTagRule } from '../../shared/types';

export type { AudioTagRule };

export interface MediaInfo {
    audioLanguages?: string;
    [key: string]: any;
}
/**
 * Language name normalization map (various forms -> canonical name)
 * This allows matching regardless of format (code, full name, variations)
 */
const LANGUAGE_ALIASES: Record<string, string> = {
    // German
    'de': 'german', 'deu': 'german', 'ger': 'german', 'german': 'german', 'deutsch': 'german',
    // English
    'en': 'english', 'eng': 'english', 'english': 'english',
    // French
    'fr': 'french', 'fra': 'french', 'fre': 'french', 'french': 'french', 'francais': 'french', 'français': 'french',
    // Spanish
    'es': 'spanish', 'spa': 'spanish', 'spanish': 'spanish', 'espanol': 'spanish', 'español': 'spanish',
    // Italian
    'it': 'italian', 'ita': 'italian', 'italian': 'italian', 'italiano': 'italian',
    // Japanese
    'ja': 'japanese', 'jpn': 'japanese', 'japanese': 'japanese',
    // Korean
    'ko': 'korean', 'kor': 'korean', 'korean': 'korean',
    // Chinese
    'zh': 'chinese', 'zho': 'chinese', 'chi': 'chinese', 'chinese': 'chinese', 'mandarin': 'chinese',
    // Russian
    'ru': 'russian', 'rus': 'russian', 'russian': 'russian',
    // Portuguese
    'pt': 'portuguese', 'por': 'portuguese', 'portuguese': 'portuguese',
    // Dutch
    'nl': 'dutch', 'nld': 'dutch', 'dut': 'dutch', 'dutch': 'dutch',
    // Polish
    'pl': 'polish', 'pol': 'polish', 'polish': 'polish',
    // Swedish
    'sv': 'swedish', 'swe': 'swedish', 'swedish': 'swedish',
    // Norwegian
    'no': 'norwegian', 'nor': 'norwegian', 'norwegian': 'norwegian',
    // Danish
    'da': 'danish', 'dan': 'danish', 'danish': 'danish',
    // Finnish
    'fi': 'finnish', 'fin': 'finnish', 'finnish': 'finnish',
    // Turkish
    'tr': 'turkish', 'tur': 'turkish', 'turkish': 'turkish',
    // Arabic
    'ar': 'arabic', 'ara': 'arabic', 'arabic': 'arabic',
    // Hindi
    'hi': 'hindi', 'hin': 'hindi', 'hindi': 'hindi',
    // Czech
    'cs': 'czech', 'ces': 'czech', 'cze': 'czech', 'czech': 'czech',
    // Hungarian
    'hu': 'hungarian', 'hun': 'hungarian', 'hungarian': 'hungarian',
    // Thai
    'th': 'thai', 'tha': 'thai', 'thai': 'thai',
    // Vietnamese
    'vi': 'vietnamese', 'vie': 'vietnamese', 'vietnamese': 'vietnamese',
    // Greek
    'el': 'greek', 'ell': 'greek', 'gre': 'greek', 'greek': 'greek',
    // Hebrew
    'he': 'hebrew', 'heb': 'hebrew', 'hebrew': 'hebrew',
    // Romanian
    'ro': 'romanian', 'ron': 'romanian', 'rum': 'romanian', 'romanian': 'romanian',
    // Croatian
    'hr': 'croatian', 'hrv': 'croatian', 'croatian': 'croatian',
    // Ukrainian
    'uk': 'ukrainian', 'ukr': 'ukrainian', 'ukrainian': 'ukrainian',
};

/**
 * Normalize a single language string to canonical name.
 *
 * @param lang - Language string to normalize (e.g., "eng", "German", "en")
 * @returns Canonical language name (e.g., "english", "german")
 */
// Cache map entries for performance (avoid re-creating array on every call)
const ALIAS_ENTRIES = Object.entries(LANGUAGE_ALIASES);

// Constants for normalization lookup optimization
// No more regex or substring checks needed - O(1) only
const MIN_ALIAS_LENGTH_FOR_MATCH = 2; // Unused but kept if needed later, or remove

export function normalizeLanguage(lang: string): string {
    const langLower = lang.toLowerCase().trim();
    if (!langLower) return '';

    // Direct O(1) lookup
    if (LANGUAGE_ALIASES[langLower]) {
        return LANGUAGE_ALIASES[langLower];
    }

    // Common variant suffixes logic (simpler/faster than O(N) includes)
    // Handle "english (us)", "english (uk)", etc.
    if (langLower.includes('(')) {
        const base = langLower.split('(')[0].trim();
        if (LANGUAGE_ALIASES[base]) {
            return LANGUAGE_ALIASES[base];
        }
    }

    // Fallback was removed for performance/correctness.
    // We only rely on direct lookup or "Language (Variant)" format.
    // If it's a random substring like "spandex" containing "spa", we intentionally DO NOT match it.

    // FAST FAIL for very long unknown strings or just return simplified
    return langLower; // Return as-is if no match
}

/**
 * Get canonical name from ISO 639-1 code
 */
export function getCanonicalFromCode(code: string): string {
    return LANGUAGE_ALIASES[code.toLowerCase()] || code.toLowerCase();
}

/**
 * Parse audioLanguages string from mediaInfo into normalized language set.
 *
 * Radarr/Sonarr return audioLanguages as a slash-separated string like:
 * "English", "English / German", "Japanese/English"
 *
 * If mediaInfo.audioLanguages is empty, falls back to the languages field
 * which Sonarr/Radarr parse from the release name.
 *
 * @param mediaInfo - The mediaInfo dict from the file
 * @param languagesFallback - Optional list of language objects (e.g., [{name: 'German'}])
 *                           Used as fallback when mediaInfo.audioLanguages is empty
 * @returns Set of normalized canonical language names (e.g., Set{'english', 'german'})
 */
export function parseAudioLanguages(
    mediaInfo: MediaInfo | null | undefined,
    languagesFallback: Array<{ name?: string; id?: number }> | null | undefined
): Set<string> {
    const normalized = new Set<string>();

    // Try mediaInfo.audioLanguages first (most accurate - from file metadata)
    let audioLangs = '';
    if (mediaInfo) {
        audioLangs = mediaInfo.audioLanguages || '';
    }

    // Parse audio languages if present
    if (audioLangs) {
        // Split by slash (handle both "English/German" and "English / German")
        const rawLangs = audioLangs.split('/').map((l: string) => l.trim().toLowerCase());

        for (const lang of rawLangs) {
            if (!lang) continue;

            const canonical = normalizeLanguage(lang);
            if (canonical) {
                normalized.add(canonical);
            }
        }
    }

    // Check fallback if no languages appear in normalized set
    // This handles cases where mediaInfo exists but audioLanguages is empty/invalid
    if (normalized.size === 0 && languagesFallback && languagesFallback.length > 0) {
        for (const langObj of languagesFallback) {
            if (typeof langObj === 'object' && langObj !== null) {
                const langName = langObj.name?.toLowerCase()?.trim() || '';
                if (langName) {
                    const canonical = normalizeLanguage(langName);
                    if (canonical) {
                        normalized.add(canonical);
                    }
                }
            }
        }
    }

    return normalized;
}

/**
 * Determine which audio tags should be added and removed for a given set of detected languages.
 *
 * @param detectedLanguages - Set of canonical language names detected in audio tracks
 * @param audioTagRules - Array of {language, tagName} rules from settings
 * @param audioTagNameToId - Map of tag name to tag ID (pre-resolved)
 * @param currentTags - Current tag IDs on the item
 * @returns Object with newTags array and hasChanges boolean
 */
export function applyAudioTagChanges(
    detectedLanguages: Set<string>,
    audioTagRules: AudioTagRule[],
    audioTagNameToId: Map<string, number>,
    currentTags: number[]
): { newTags: number[]; hasChanges: boolean } {
    let newTags = [...currentTags];
    let hasChanges = false;
    const currentTagSet = new Set(currentTags);

    for (const rule of audioTagRules) {
        const ruleCanonical = getCanonicalFromCode(rule.language);
        const ruleTagId = audioTagNameToId.get(rule.tagName);

        if (!ruleTagId) continue;

        if (detectedLanguages.has(ruleCanonical)) {
            // Language detected - ensure tag is present
            if (!currentTagSet.has(ruleTagId)) {
                newTags = [...newTags, ruleTagId];
                hasChanges = true;
            }
        } else {
            // Language not detected - ensure tag is removed
            if (currentTagSet.has(ruleTagId)) {
                newTags = newTags.filter(t => t !== ruleTagId);
                hasChanges = true;
            }
        }
    }

    return { newTags, hasChanges };
}
