/**
 * Shared helpers for rendering cohort schedules consistently across the
 * acceptance email, the applicant dashboard, and the application form.
 *
 * All timezone maths lives in timezone.util.ts. This file only decides WHAT
 * to render; it never computes an offset itself.
 *
 * Every formatter takes an `occurrence` date because a weekly schedule has no
 * single correct rendering — the US and Israel change DST on different dates,
 * so the same "11:00 ET" class is 6pm IST in one week of a cohort and 5pm IST
 * in another. The occurrence anchors the conversion to a real date.
 */

import {
  ZonedScheduleEntry,
  formatEntryAcrossZones,
  formatEntryInZone,
  browserTimeZone,
  firstOccurrenceOnOrAfter,
  PROGRAM_TIME_ZONE,
} from './timezone.util';

/**
 * Distinct day names from a weekly schedule.
 *
 * `plural` renders them as recurring days — "Mondays", "Mondays, Wednesdays" —
 * which is how the acceptance copy refers to a weekly session. Every English
 * weekday pluralises with a bare "s", so no irregular-case table is needed.
 */
export function scheduleDays(
  weeklySchedule?: ZonedScheduleEntry[],
  plural = false,
): string {
  const days = (weeklySchedule || []).map(s => s.day).filter(Boolean);
  if (!days.length) return 'TBD';
  const unique = Array.from(new Set(days));
  return (plural ? unique.map(d => `${d}s`) : unique).join(', ');
}

/**
 * Multi-timezone time string for the first session of a weekly schedule,
 * resolved against the first date that session actually runs on or after
 * `cohortStartDate`.
 *
 * e.g. "8am - 10:30am PST / 11am - 1:30pm EST / 6pm - 8:30pm IST"
 */
export function scheduleTime(
  weeklySchedule?: ZonedScheduleEntry[],
  cohortStartDate?: Date,
): string {
  const first = weeklySchedule?.[0];
  if (!first) return 'TBD';
  const occurrence = scheduleFirstOccurrence(weeklySchedule, cohortStartDate);
  if (!occurrence) return 'TBD';
  return formatEntryAcrossZones(first, occurrence);
}

/**
 * The first date the first session of `weeklySchedule` runs, on or after
 * `cohortStartDate`. Returns null when either is missing.
 */
export function scheduleFirstOccurrence(
  weeklySchedule?: ZonedScheduleEntry[],
  cohortStartDate?: Date,
): Date | null {
  const first = weeklySchedule?.[0];
  if (!first || !cohortStartDate) return null;
  const start = cohortStartDate instanceof Date ? cohortStartDate : new Date(cohortStartDate);
  if (isNaN(start.getTime())) return null;
  return firstOccurrenceOnOrAfter(start, first.day, PROGRAM_TIME_ZONE);
}

/**
 * Render every session of a weekly schedule, one per line, as
 * "Monday: 8am - 10:30am PST / 11am - 1:30pm EST / 6pm - 8:30pm IST".
 * Used by the application form, where the applicant is comparing classes.
 */
export function formatFullSchedule(
  weeklySchedule?: ZonedScheduleEntry[],
  cohortStartDate?: Date,
): string {
  const entries = weeklySchedule || [];
  if (!entries.length || !cohortStartDate) return 'TBD';

  const anchor = cohortStartDate instanceof Date ? cohortStartDate : new Date(cohortStartDate);
  if (isNaN(anchor.getTime())) return 'TBD';

  // The applicant's own zone is shown alongside the three program zones —
  // an applicant outside PT/ET/IL should not have to do the arithmetic.
  const localZone = browserTimeZone();
  const showLocal = !['America/Los_Angeles', 'America/New_York', 'Asia/Jerusalem']
    .includes(localZone);

  return entries
    .map(entry => {
      const occurrence = firstOccurrenceOnOrAfter(anchor, entry.day, PROGRAM_TIME_ZONE);
      if (!occurrence) return `${entry.day}\nTBD`;
      const zones = formatEntryAcrossZones(entry, occurrence);
      const local = showLocal
        ? `\n${formatEntryInZone(entry, occurrence, localZone)} (your local time)`
        : '';
      return `${entry.day}\n${zones}${local}`;
    })
    .join('\n\n');
}
