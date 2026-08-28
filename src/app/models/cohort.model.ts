import { Weekday } from '../services/timezone.util';

/**
 * One weekly session. `startTime`/`endTime` are wall-clock "HH:MM" values in
 * `timeZone` — NOT UTC and NOT the browser's zone.
 *
 * `timeZone` is optional only so legacy cohort documents (written before
 * schedules carried an explicit zone) still parse. Absence is interpreted as
 * UTC, which is what the old write path produced — see `entryTimeZone()` in
 * services/timezone.util.ts. Every new write sets it to PROGRAM_TIME_ZONE.
 */
export interface WeeklyScheduleEntry {
  day: Weekday;
  startTime: string;
  endTime: string;
  timeZone?: string;
}

export interface CohortClass {
  classId: string;
  name: string; // "Class A", "Class B", etc.
  weeklySchedule: WeeklyScheduleEntry[];
  capacity: number;
  enrolled: number;
}

export interface CohortLab {
  name: string; // Always "Lab"
  weeklySchedule: WeeklyScheduleEntry[];
}

export interface Cohort {
  cohortId: string;
  number: string;
  applicationStartDate: Date;
  applicationEndDate: Date;
  cohortStartDate: Date;
  cohortEndDate: Date;
  status: 'upcoming' | 'accepting_applications' | 'closed' | 'in_progress' | 'completed';
  classes: CohortClass[];
  lab: CohortLab;
  scheduleLink: string;
}

export interface CreateCohortRequest {
  number: string;
  applicationStartDate: Date;
  applicationEndDate: Date;
  cohortStartDate: Date;
  cohortEndDate: Date;
  classes: Omit<CohortClass, 'classId' | 'enrolled'>[];
  lab: CohortLab;
  scheduleLink: string;
}
