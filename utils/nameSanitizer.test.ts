import { describe, it, expect } from 'vitest';
import parityCases from '../docker/worker/tests/fixtures/parity_cases.json';
import { toTableName, sanitizeTechnicalName } from './nameSanitizer';

// ---------------------------------------------------------------------------
// toTableName — cross-language parity suite
// The same fixture is read by test_safe_name.py in docker/worker/tests/.
// Both implementations must produce the same `expected` value.
// ---------------------------------------------------------------------------

describe('toTableName', () => {
  it.each(parityCases)('$input → $expected ($note)', ({ input, expected }) => {
    expect(toTableName(input)).toBe(expected);
  });

  it('returns "untitled" for empty string (TS fallback differs from Python "layer")', () => {
    expect(toTableName('')).toBe('untitled');
  });

  it('returns "untitled" for null-ish values coerced by callers', () => {
    expect(toTableName(undefined as any)).toBe('untitled');
  });

  it('all-special-chars collapses to "untitled" after strip', () => {
    expect(toTableName('!!!')).toBe('untitled');
    expect(toTableName('---')).toBe('untitled');
  });

  it('cafe: accented e maps to underscore (no NFD normalization in toTableName)', () => {
    // é is not in [a-z0-9], maps to _, then stripped → "caf"
    expect(toTableName('café')).toBe('caf');
  });

  it('long clean name preserved', () => {
    const name = 'a'.repeat(100);
    expect(toTableName(name)).toBe(name);
  });

  it('schema.table notation', () => {
    expect(toTableName('public.roads')).toBe('public_roads');
  });
});

// ---------------------------------------------------------------------------
// sanitizeTechnicalName — separate contract, for field/column names
// ---------------------------------------------------------------------------

describe('sanitizeTechnicalName', () => {
  it('lowercases ASCII', () => {
    expect(sanitizeTechnicalName('ROADS')).toBe('roads');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeTechnicalName('my field')).toBe('my_field');
  });

  it('squeezes consecutive underscores', () => {
    expect(sanitizeTechnicalName('a  b')).toBe('a_b');
  });

  it('strips leading and trailing underscores', () => {
    expect(sanitizeTechnicalName('__hidden__')).toBe('hidden');
  });

  it('replaces Nordic æ → ae', () => {
    expect(sanitizeTechnicalName('æra')).toBe('aera');
  });

  it('replaces Nordic ø → oe', () => {
    expect(sanitizeTechnicalName('sjø')).toBe('sjoe');
  });

  it('replaces Nordic å → aa', () => {
    expect(sanitizeTechnicalName('åpen')).toBe('aapen');
  });

  it('NFD normalization removes accents: café → cafe', () => {
    expect(sanitizeTechnicalName('café')).toBe('cafe');
  });

  it('prepends underscore when name starts with digit', () => {
    expect(sanitizeTechnicalName('2024roads')).toBe('_2024roads');
  });

  it('preserves colon for OSM-style column names', () => {
    expect(sanitizeTechnicalName('addr:street')).toBe('addr:street');
  });

  it('returns "" for empty string (null-guard returns early)', () => {
    expect(sanitizeTechnicalName('')).toBe('');
  });

  it('returns "untitled_field" for all-special chars', () => {
    expect(sanitizeTechnicalName('!!!')).toBe('untitled_field');
  });

  it('preserves numbers in the middle', () => {
    expect(sanitizeTechnicalName('road_2024_type')).toBe('road_2024_type');
  });
});
