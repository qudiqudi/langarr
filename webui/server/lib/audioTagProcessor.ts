/**
 * Audio Tag Processor
 *
 * Processes audio track languages from mediaInfo and applies tags.
 * Unlike profile assignment (which uses original language metadata),
 * this inspects the actual mediaInfo of imported files to detect
 * which audio tracks are present.
 */

import ISO6391 from 'iso-639-1';

export interface AudioTagRule {
    language: string;  // ISO 639-1 code (e.g., 'de', 'en')
    tagName: string;
}

export interface ParsedLanguage {
    code: string;      // ISO 639-1 code
    canonical: string; // Canonical name (e.g., 'german')
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
export function normalizeLanguage(lang: string): string {
    const langLower = lang.toLowerCase().trim();
    if (!langLower) return '';

    // Try exact match first
    const canonical = LANGUAGE_ALIASES[langLower];
    if (canonical) return canonical;

    // Try partial matching for names like "english (us)"
    for (const [alias, canonicalName] of Object.entries(LANGUAGE_ALIASES)) {
        if (alias.length > 2 && (langLower.includes(alias) || alias.includes(langLower))) {
            return canonicalName;
        }
    }

    // Unknown language - return as-is (lowercase)
    return langLower;
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
    mediaInfo: Record<string, any> | null | undefined,
    languagesFallback: Array<{ name?: string; id?: number }> | null | undefined
): Set<string> {
    const normalized = new Set<string>();

    // Try mediaInfo.audioLanguages first (most accurate - from file metadata)
    let audioLangs = '';
    if (mediaInfo) {
        audioLangs = mediaInfo.audioLanguages || '';
    }

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

    // Fallback to languages field if mediaInfo.audioLanguages was empty
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
 * @param tagNameToId - Map of tag names to tag IDs
 * @param currentTags - Current tag IDs on the item
 * @returns Object with tagsToAdd and tagsToRemove sets
 */
export function determineAudioTagChanges(
    detectedLanguages: Set<string>,
    audioTagRules: AudioTagRule[],
    tagNameToId: Map<string, number>,
    currentTags: number[]
): { tagsToAdd: Set<number>; tagsToRemove: Set<number> } {
    const tagsToAdd = new Set<number>();
    const tagsToRemove = new Set<number>();
    const currentTagSet = new Set(currentTags);

    for (const rule of audioTagRules) {
        const ruleCanonical = getCanonicalFromCode(rule.language);
        const tagId = tagNameToId.get(rule.tagName);

        if (!tagId) continue;

        if (detectedLanguages.has(ruleCanonical)) {
            // Language detected - ensure tag is present
            if (!currentTagSet.has(tagId)) {
                tagsToAdd.add(tagId);
            }
        } else {
            // Language not detected - ensure tag is removed
            if (currentTagSet.has(tagId)) {
                tagsToRemove.add(tagId);
            }
        }
    }

    return { tagsToAdd, tagsToRemove };
}
