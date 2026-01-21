import { DateTime } from 'luxon';

export const NY_TZ = 'America/New_York';

export function getNyDate(timestampMs: number): string {
  return DateTime.fromMillis(timestampMs, { zone: NY_TZ }).toISODate() ?? '';
}

export function isRegularSessionMinute(timestampMs: number): boolean {
  const dt = DateTime.fromMillis(timestampMs, { zone: NY_TZ });
  const hour = dt.hour;
  const minute = dt.minute;
  const afterOpen = hour > 9 || (hour === 9 && minute >= 30);
  const beforeClose = hour < 16 || (hour === 16 && minute === 0);
  return afterOpen && beforeClose;
}

export function getSessionStartMs(timestampMs: number): number {
  const date = DateTime.fromMillis(timestampMs, { zone: NY_TZ }).toISODate() ?? '';
  return DateTime.fromISO(date, { zone: NY_TZ })
    .set({ hour: 9, minute: 30, second: 0, millisecond: 0 })
    .toMillis();
}
