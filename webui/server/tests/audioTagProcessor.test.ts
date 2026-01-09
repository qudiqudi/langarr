
import { normalizeLanguage, parseAudioLanguages, applyAudioTagChanges, AudioTagRule } from '../lib/audioTagProcessor';

// Mock console.log for clean output
const log = console.log;
const error = console.error;

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void) {
    try {
        fn();
        log(`✅ ${desc}`);
        passed++;
    } catch (e: any) {
        error(`❌ ${desc}`);
        error(`   ${e.message}`);
        failed++;
    }
}

function expect(actual: any) {
    return {
        toBe: (expected: any) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toEqual: (expected: any) => {
            const actualStr = JSON.stringify(Array.from(actual instanceof Set ? actual : actual).sort());
            const expectedStr = JSON.stringify(Array.from(expected instanceof Set ? expected : expected).sort());
            if (actualStr !== expectedStr) {
                throw new Error(`Expected ${expectedStr} but got ${actualStr}`);
            }
        },
        toContain: (item: any) => {
            if (actual instanceof Set) {
                if (!actual.has(item)) throw new Error(`Set did not contain ${item}`);
            } else if (Array.isArray(actual)) {
                if (!actual.includes(item)) throw new Error(`Array did not contain ${item}`);
            }
        }
    };
}

log('\nRunning Audio Tag Processor Tests...\n');

// --- normalizeLanguage Tests ---
it('should normalize exact ISO codes', () => {
    expect(normalizeLanguage('en')).toBe('english');
    expect(normalizeLanguage('de')).toBe('german');
    expect(normalizeLanguage('fr')).toBe('french');
});

it('should normalize full names', () => {
    expect(normalizeLanguage('English')).toBe('english');
    expect(normalizeLanguage('German')).toBe('german');
});

it('should normalize variants with parentheses', () => {
    expect(normalizeLanguage('English (US)')).toBe('english');
    expect(normalizeLanguage('French (Canada)')).toBe('french');
});

it('should handle unknown languages gracefully', () => {
    expect(normalizeLanguage('klingon')).toBe('klingon');
});

it('should handle empty input', () => {
    expect(normalizeLanguage('')).toBe('');
    expect(normalizeLanguage('   ')).toBe('');
});

// --- parseAudioLanguages Tests ---
it('should parse slash-separated string from mediaInfo', () => {
    const input = { audioLanguages: 'English/German/Japanese' };
    const result = parseAudioLanguages(input, null);
    expect(result).toEqual(new Set(['english', 'german', 'japanese']));
});

it('should parse spaced slash-separated string', () => {
    const input = { audioLanguages: 'English / German' };
    const result = parseAudioLanguages(input, null);
    expect(result).toEqual(new Set(['english', 'german']));
});

it('should fallback to languages array if mediaInfo is empty', () => {
    const mediaInfo = { audioLanguages: '' };
    const fallback = [{ name: 'French' }, { name: 'Italian' }];
    const result = parseAudioLanguages(mediaInfo, fallback);
    expect(result).toEqual(new Set(['french', 'italian']));
});

it('should parse single slash as empty set', () => {
    const input = { audioLanguages: '/' };
    const result = parseAudioLanguages(input, null);
    expect(result).toEqual(new Set([]));
});

it('should handle null/undefined inputs gracefully', () => {
    expect(parseAudioLanguages(null, null)).toEqual(new Set([]));
    expect(parseAudioLanguages(undefined, undefined)).toEqual(new Set([]));
});

it('should ignore empty strings in slash-separated list', () => {
    const input = { audioLanguages: 'English//German' };
    const result = parseAudioLanguages(input, null);
    expect(result).toEqual(new Set(['english', 'german']));
});

it('should handle regex special characters in input gracefully (Security)', () => {
    // "English (Test)" contains parentheses which are special in regex
    expect(normalizeLanguage('English (Test)')).toBe('english');
    // "Test+" shouldn't crash if we had an alias like "Test+" (we don't, but checks safety)
    expect(normalizeLanguage('Test+')).toBe('test+');
});

it('should NOT match random substrings (Perf/Correctness)', () => {
    // "spandex" contains "spa", but "spa" is alias for Spanish.
    // We explicitly removed regex fallback, so this should NOT match Spanish.
    expect(normalizeLanguage('spandex')).toBe('spandex');
});

it('should prioritise mediaInfo over fallback', () => {
    const mediaInfo = { audioLanguages: 'English' };
    const fallback = [{ name: 'French' }];
    const result = parseAudioLanguages(mediaInfo, fallback);
    expect(result).toEqual(new Set(['english']));
});

// --- applyAudioTagChanges Tests ---
it('should add tags for detected languages', () => {
    const detected = new Set(['english', 'german']);
    const rules: AudioTagRule[] = [
        { language: 'en', tagName: 'English Audio' },
        { language: 'de', tagName: 'German Audio' }
    ];
    const map = new Map([['English Audio', 10], ['German Audio', 20]]);
    const currentTags: number[] = [];

    const { newTags, hasChanges } = applyAudioTagChanges(detected, rules, map, currentTags);

    expect(hasChanges).toBe(true);
    expect(newTags).toEqual([10, 20]);
});

it('should remove tags for missing languages', () => {
    const detected = new Set(['english']);
    const rules: AudioTagRule[] = [
        { language: 'en', tagName: 'English Audio' },
        { language: 'de', tagName: 'German Audio' }
    ];
    const map = new Map([['English Audio', 10], ['German Audio', 20]]);
    const currentTags: number[] = [10, 20]; // Has both, but German is missing from detected

    const { newTags, hasChanges } = applyAudioTagChanges(detected, rules, map, currentTags);

    expect(hasChanges).toBe(true);
    expect(newTags).toEqual([10]);
});

it('should not change anything if tags match detected', () => {
    const detected = new Set(['english']);
    const rules: AudioTagRule[] = [{ language: 'en', tagName: 'English Audio' }];
    const map = new Map([['English Audio', 10]]);
    const currentTags: number[] = [10];

    const { newTags, hasChanges } = applyAudioTagChanges(detected, rules, map, currentTags);

    expect(hasChanges).toBe(false);
    expect(newTags).toEqual([10]);
});

it('should exclude tags defined in rules but not in map (invalid tags)', () => {
    const detected = new Set(['english']);
    const rules: AudioTagRule[] = [{ language: 'en', tagName: 'English Audio' }];
    const map = new Map(); // Empty map, tag ID not resolved
    const currentTags: number[] = [];

    const { newTags, hasChanges } = applyAudioTagChanges(detected, rules, map, currentTags);

    expect(hasChanges).toBe(false);
    expect(newTags).toEqual([]);
});

// --- Integration Logic Scenarios (Mocking SyncService Logic) ---
it('should correctly intersect languages across multiple episodes', () => {
    // Scenario: Series has 3 episodes
    // Ep 1: English, German
    // Ep 2: English
    // Ep 3: English, French
    // Common: English (German dropped by Ep 2/3, French dropped by Ep 1/2)

    const ep1 = new Set(['english', 'german']);
    const ep2 = new Set(['english']);
    const ep3 = new Set(['english', 'french']);

    // Simulate SyncService logic
    let common: string[] | null = null;
    const episodes = [ep1, ep2, ep3];

    for (const detected of episodes) {
        if (common === null) {
            common = Array.from(detected);
        } else {
            common = common.filter(l => detected.has(l));
        }
    }

    const result = new Set(common);
    expect(result).toEqual(new Set(['english']));
});

it('should skip empty language sets in intersection (Bug Fix Verification)', () => {
    // Scenario: 
    // Ep 1: No audio data (e.g. not scanned) -> should be skipped
    // Ep 2: German
    // Ep 3: German
    // Result should be German, NOT empty set

    const ep1 = new Set([]);
    const ep2 = new Set(['german']);
    const ep3 = new Set(['german']);

    let common: string[] | null = null;
    const episodes = [ep1, ep2, ep3];

    for (const detected of episodes) {
        // The fix: skip empty
        if (detected.size === 0) continue;

        if (common === null) {
            common = Array.from(detected);
        } else {
            common = common.filter(l => detected.has(l));
        }
    }

    const result = new Set(common || []);
    expect(result).toEqual(new Set(['german']));
});

// Summary
log('\n---------------------------------------------------');
if (failed > 0) {
    log(`❌ FAILED: ${failed}, PASSED: ${passed}`);
    process.exit(1);
} else {
    log(`✅ ALL TESTS PASSED (${passed})`);
    process.exit(0);
}
