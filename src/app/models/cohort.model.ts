export interface Cohort {
  cohortId: string;
  number: string;
  applicationStartDate: Date;
  applicationEndDate: Date;
  cohortStartDate: Date;
  cohortEndDate: Date;
  status: 'upcoming' | 'accepting_applications' | 'closed' | 'in_progress' | 'completed';
}

export interface CreateCohortRequest {
  number: string;
  applicationStartDate: Date;
  applicationEndDate: Date;
  cohortStartDate: Date;
  cohortEndDate: Date;
}