/**
 * Single source of truth for every timezone conversion in the app.
 *
 * Design (see CLAUDE.md "Timezone Management"):
 *   - A wall-clock time is meaningless without the zone it was typed in, so
 *     every stored schedule entry carries an explicit IANA `timeZone`.
 *   - All conversion goes through `Intl`, keyed to the ACTUAL DATE of the
 *     occurrence. There is no fixed-offset arithmetic anywhere in this file,
 *     because fixed offsets are wrong across DST transitions — and the US and
 *     Israel transition on different dates, so even the ET↔IL gap is not
 *     constant (it is +7h most of the year but +6h between Israel's DST end
 *     and the US's, e.g. 2026-10-25 → 2026-11-01).
 *
 * Nothing outside this module should call getTimezoneOffset(), hardcode a
 * UTC offset, or assume a fixed hour delta between two zones.
 */

/** The zone cohort schedules are authored in. Admin types Eastern Time. */
export const PROGRAM_TIME_ZONE = 'America/New_York';

/** Display zones for the applicant-facing multi-timezone schedule line.
 *  Labels are intentionally the fixed strings PST/EST/IST rather than
 *  season-correct PDT/EDT/IDT, because the approved email copy uses them. */
export const DISPLAY_ZONES: ReadonlyArray<{ zone: string; label: string }> = [
  { zone: 'America/Los_Angeles', label: 'PST' },
  { zone: 'America/New_York', label: 'EST' },
  { zone: 'Asia/Jerusalem', label: 'IST' },
];

export type Weekday =
  | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday'
  | 'Thursday' | 'Friday' | 'Saturday';

export const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/** A stored schedule entry. `timeZone` is optional ONLY for backward
 *  compatibility — see `entryTimeZone()`. New writes always set it. */
export interface ZonedScheduleEntry {
  day: Weekday | string;
  startTime: string; // "HH:MM" wall clock in `timeZone`
  endTime: string;   // "HH:MM" wall clock in `timeZone`
  timeZone?: string; // IANA zone id
}

/**
 * Resolve the zone a stored entry's times are expressed in.
 *
 * Legacy cohorts (written before this module existed) stored times already
 * converted to UTC and carry no `timeZone` field, so absence means UTC. This
 * is what lets old and new cohort documents coexist with no data migration.
 */
export function entryTimeZone(entry: { timeZone?: string } | undefined): string {
  return entry?.timeZone || 'UTC';
}

interface WallClock {
  year: number; month: number; day: number;
  hour: number; minute: number; weekday: number;
}

const WEEKDAY_NAMES: Weekday[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Read the wall-clock fields an instant maps to inside `timeZone`. */
export function getWallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl can emit "24" for midnight under hour12:false in some engines.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

/** Offset of `timeZone` at `instant`, in milliseconds (east of UTC positive). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wc = getWallClock(instant, timeZone);
  const asIfUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute,
    instant.getUTCSeconds(), instant.getUTCMilliseconds());
  return asIfUtc - instant.getTime();
}

/**
 * Convert a wall-clock date+time in `timeZone` to the absolute instant.
 *
 * Two-pass: the offset itself depends on the instant we're solving for, so we
 * guess with the offset at the naive UTC interpretation, then re-solve using
 * the offset that actually applies at that moment. This is what makes DST
 * boundaries land correctly.
 */
export function wallClockToInstant(
  year: number, month: number, day: number,
  hour: number, minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = naive - zoneOffsetMs(new Date(naive), timeZone);
  ts = naive - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** `"YYYY-MM-DD"` + `"HH:MM"` in `timeZone` → absolute instant. */
export function parseZonedDateTime(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = (dateStr || '').split('-').map(Number);
  const [hour, minute] = (timeStr || '00:00').split(':').map(Number);
  return wallClockToInstant(year, month, day, hour || 0, minute || 0, timeZone);
}

/** Instant → `"YYYY-MM-DD"` as seen in `timeZone`. */
export function formatDateInZone(instant: Date, timeZone: string): string {
  const wc = getWallClock(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${wc.year}-${pad(wc.month)}-${pad(wc.day)}`;
}

/** Instant → `"HH:MM"` (24h) as seen in `timeZone`. */
export function formatTimeInZone(instant: Date, timeZone: string): string {
  const wc = getWallClock(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(wc.hour)}:${pad(wc.minute)}`;
}

/** Instant → e.g. `"Monday, October 12, 2026"` as seen in `timeZone`. */
export function formatLongDateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(instant);
}

/** Instant → e.g. `"Oct 12, 2026, 09:00"` as seen in `timeZone`. */
export function formatDateTimeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instant);
}

/** `8am` / `10:30am` / `1:30pm` — the applicant-facing clock format. */
export function formatClock12(hour: number, minute: number): string {
  const period = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12}${period}` : `${h12}:${String(minute).padStart(2, '0')}${period}`;
}

/** Instant → `8am` / `10:30am` as seen in `timeZone`. */
export function formatClock12InZone(instant: Date, timeZone: string): string {
  const wc = getWallClock(instant, timeZone);
  return formatClock12(wc.hour, wc.minute);
}

/**
 * First occurrence of `weekday` on or after `from`, evaluated in `timeZone`.
 *
 * The day-of-week comparison and the day-stepping both happen in the target
 * zone — mixing them (comparing in one zone, formatting in another) is what
 * previously shifted the announced class start date by a full day for admins
 * west of Eastern.
 */
export function firstOccurrenceOnOrAfter(
  from: Date, weekday: Weekday | string, timeZone: string,
): Date | null {
  const target = WEEKDAY_INDEX[weekday as Weekday];
  // Fail closed: an unrecognised day must surface as "TBD" upstream rather
  // than silently resolving to `from` and rendering a plausible-looking but
  // fabricated time.
  if (target === undefined) return null;
  if (isNaN(from.getTime())) return null;

  const wc = getWallClock(from, timeZone);
  const delta = (target - wc.weekday + 7) % 7;
  // Rebuild at noon in-zone: immune to DST shifts that can make a naive
  // midnight land on the previous day.
  return wallClockToInstant(wc.year, wc.month, wc.day + delta, 12, 0, timeZone);
}

/** Weekday name of `instant` as seen in `timeZone`. */
export function weekdayInZone(instant: Date, timeZone: string): Weekday {
  return WEEKDAY_NAMES[getWallClock(instant, timeZone).weekday];
}

/**
 * Render one schedule entry across every display zone, resolved against the
 * date it actually occurs on.
 *
 * `occurrence` anchors the DST calculation. Passing the real class date is
 * what makes the Israel offset come out as +6h during the week where Israel
 * has left DST but the US has not.
 */
export function formatEntryInZone(
  entry: ZonedScheduleEntry, occurrence: Date, targetZone: string,
): string {
  const sourceZone = entryTimeZone(entry);
  const onDate = formatDateInZone(occurrence, sourceZone);
  const start = parseZonedDateTime(onDate, entry.startTime, sourceZone);
  const end = parseZonedDateTime(onDate, entry.endTime, sourceZone);
  return `${formatClock12InZone(start, targetZone)} - ${formatClock12InZone(end, targetZone)}`;
}

/** The viewer's own IANA zone, per the browser. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatEntryAcrossZones(
  entry: ZonedScheduleEntry, occurrence: Date,
): string {
  const sourceZone = entryTimeZone(entry);
  const onDate = formatDateInZone(occurrence, sourceZone);
  const start = parseZonedDateTime(onDate, entry.startTime, sourceZone);
  const end = parseZonedDateTime(onDate, entry.endTime, sourceZone);

  return DISPLAY_ZONES
    .map(({ zone, label }) =>
      `${formatClock12InZone(start, zone)} - ${formatClock12InZone(end, zone)} ${label}`)
    .join(' / ');
}
