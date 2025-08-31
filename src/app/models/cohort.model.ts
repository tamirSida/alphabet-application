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

export interface CohortLab {
  name: string; // Always "Lab"
  weeklySchedule: {
    day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    startTime: string; // "18:00" 
    endTime: string; // "21:00"
  }[];
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