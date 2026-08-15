import { CursorDirectionError, InvalidCursorError } from './errors.ts';

export type SortDirection = 'asc' | 'desc';

export type Cursor = {
  readonly timestamp: Date;
  readonly id: string;
  readonly direction: SortDirection;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    `${cursor.timestamp.getTime()}:${cursor.id}:${cursor.direction}`,
  ).toString('base64url');
}

export function decodeCursor(raw: string, expected: SortDirection): Cursor {
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(':');
  if (parts.length !== 3) throw new InvalidCursorError();
  const [ms, id, direction] = parts as [string, string, string];

  if (!/^\d+$/.test(ms)) throw new InvalidCursorError();
  if (!UUID_PATTERN.test(id)) throw new InvalidCursorError();
  if (direction !== 'asc' && direction !== 'desc') throw new InvalidCursorError();
  if (direction !== expected) throw new CursorDirectionError();

  return { timestamp: new Date(Number(ms)), id, direction };
}
