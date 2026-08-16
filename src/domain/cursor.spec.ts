import { CursorDirectionError, InvalidCursorError } from './errors.ts';
import { decodeCursor, encodeCursor } from './cursor.ts';

const cursor = {
  timestamp: new Date('2026-08-15T10:00:00.000Z'),
  id: '01996a1e-0000-7000-8000-000000000000',
  direction: 'desc' as const,
};

describe('cursor', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(cursor), 'desc')).toEqual(cursor);
  });

  it('is opaque base64url', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64', '!!!!'],
    ['too few parts', Buffer.from('123:abc').toString('base64url')],
    ['a non-numeric timestamp', Buffer.from('abc:x:desc').toString('base64url')],
    ['a malformed id', Buffer.from('123:not-a-uuid:desc').toString('base64url')],
    ['an unknown direction', Buffer.from('123:01996a1e-0000-7000-8000-000000000000:sideways').toString('base64url')],
    ['garbage appended to an otherwise-valid cursor', `${encodeCursor(cursor)}!`],
    ['a timestamp outside the valid Date range', Buffer.from('99999999999999999999:01996a1e-0000-7000-8000-000000000000:desc').toString('base64url')],
  ])('rejects %s', (_label, raw) => {
    expect(() => decodeCursor(raw, 'desc')).toThrow(InvalidCursorError);
  });

  it('rejects a desc cursor presented with sort=asc', () => {
    expect(() => decodeCursor(encodeCursor(cursor), 'asc')).toThrow(CursorDirectionError);
  });
});
