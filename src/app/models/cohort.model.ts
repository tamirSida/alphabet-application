export interface CohortClass {
  classId: string;
  name: string; // "Class A", "Class B", etc.
  weeklySchedule: {
    day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    startTime: string; // "09:00"
    endTime: string; // "12:00"
  }[];
  capacity: number;
  enrolled: number;
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
}

export interface CreateCohortRequest {
  number: string;
  applicationStartDate: Date;
  applicationEndDate: Date;
  cohortStartDate: Date;
  cohortEndDate: Date;
  classes: Omit<CohortClass, 'classId' | 'enrolled'>[];
}