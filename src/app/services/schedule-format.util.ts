/**
 * Shared helpers for rendering cohort schedules consistently across the
 * acceptance email and the applicant dashboard.
 *
 * Times are stored as Eastern Time (ET) per the project's timezone convention.
 * Display conversion is simple hour arithmetic: PST = ET - 3, IST = ET + 7.
 */

interface ScheduleEntry {
  day: string;
  startTime: string; // "HH:MM" in ET
  endTime: string;   // "HH:MM" in ET
}

/** "HH:MM" -> minutes since midnight (minutes default to 0 if absent). */
function toMinutes(time: string): number {
  const [h, m] = (time || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes since midnight -> "8am" / "10:30am" / "1:30pm" (wraps across midnight). */
function formatClock(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

/**
 * Format an ET start/end range across all three program timezones, e.g.
 * "8am - 10:30am PST / 11am - 1:30pm EST / 6pm - 8:30pm IST".
 */
export function formatMultiTzTime(startTimeET: string, endTimeET: string): string {
  const start = toMinutes(startTimeET);
  const end = toMinutes(endTimeET);
  const range = (offsetHrs: number) =>
    `${formatClock(start + offsetHrs * 60)} - ${formatClock(end + offsetHrs * 60)}`;
  return `${range(-3)} PST / ${range(0)} EST / ${range(7)} IST`;
}

/** Distinct day names from a weekly schedule, e.g. "Monday" or "Monday, Wednesday". */
export function scheduleDays(weeklySchedule?: ScheduleEntry[]): string {
  const days = (weeklySchedule || []).map(s => s.day).filter(Boolean);
  return days.length ? Array.from(new Set(days)).join(', ') : 'TBD';
}

/** Multi-timezone time string for the first session of a weekly schedule. */
export function scheduleTime(weeklySchedule?: ScheduleEntry[]): string {
  const first = weeklySchedule?.[0];
  return first ? formatMultiTzTime(first.startTime, first.endTime) : 'TBD';
}
