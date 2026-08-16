import { uuidV7 } from './uuid-v7.ts';

describe('uuidV7', () => {
  it('sets the version nibble to 7 and the variant bits to 10xx', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('encodes the supplied millisecond in the leading 48 bits', () => {
    const ms = 1_760_000_000_000;
    const hex = uuidV7(ms).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(ms);
  });

  it('sorts lexicographically in generation order across milliseconds', () => {
    const earlier = uuidV7(1_000_000_000_000);
    const later = uuidV7(1_000_000_000_001);
    expect(earlier < later).toBe(true);
  });
});
