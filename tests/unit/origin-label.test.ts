import { describe, expect, it } from 'vitest';
import { flagEmoji, originLabel } from '../../src/features/recipes/origin-label';

describe('flagEmoji', () => {
  it('turns a two-letter country code into its flag', () => {
    expect(flagEmoji('MX')).toBe('🇲🇽');
    expect(flagEmoji('pr')).toBe('🇵🇷');
  });
  it('gives nothing for a missing or malformed code', () => {
    expect(flagEmoji(null)).toBe('');
    expect(flagEmoji('MEX')).toBe('');
    expect(flagEmoji('1A')).toBe('');
  });
});

describe('originLabel', () => {
  const mexico = { id: 'mexico', label_en: 'Mexico', label_es: 'México', country_code: 'MX' };
  const notSure = { id: 'not-sure', label_en: 'Not sure', label_es: 'No estoy seguro/a', country_code: null };
  it('puts the flag before the name in the reader’s language', () => {
    expect(originLabel(mexico, 'en')).toBe('🇲🇽 Mexico');
    expect(originLabel(mexico, 'es')).toBe('🇲🇽 México');
  });
  it('shows a plain name for origins that are not a country', () => {
    expect(originLabel(notSure, 'en')).toBe('Not sure');
  });
});
