// Red flags for admin screening
export interface ApplicationFlags {
  englishProficiency: boolean; // true if IL selected and No to English comfort
  combatService: boolean; // true if No to combat service
}

// Section 1: Personal Information
export interface PersonalInformation {
  studentId: string; // Auto-generated, same as operatorId
  firstName: string;
  lastName: string;
  telephone?: string;
  email: string; // Auto-populated
}

// Section 2: Service & Availability
export interface ServiceAvailability {
  countryOfService: 'US' | 'IL';
  englishProficiency?: 'Yes' | 'No'; // Only shown if IL selected
  unavailableClasses: {
    classId: string;
    reason: string;
  }[]; // Array of classes user cannot attend with reasons
  commitToBoth?: boolean; // User can commit to both classes
}

// File upload interface
export interface UploadedFile {
  fileUrl: string;
  fileName: string;
}

// Section 3: Experience & Background
export interface ExperienceBackground {
  combatService: 'Yes' | 'No';
  militaryDraftDate?: string;
  militaryReleaseDate?: string;
  militaryServiceDescription: string; // max 75 words
  /** @deprecated Older applications collected a generic "Proof of Military
   *  Service" upload before the field was narrowed to combat service only.
   *  Kept on the type so legacy Firestore documents still parse cleanly.
   *  New submissions write proofOfCombatService instead. */
  proofOfService?: UploadedFile[];
  proofOfCombatService?: UploadedFile[]; // Required when combatService === 'Yes', max 2 files
  professionalExperience?: string; // max 150 words, optional
  hasProjectIdea: 'Yes' | 'No'; // New question to address feedback
  projectIdea?: {
    description: string; // Combined description covering problem, solution, and market
  }; // max 200 words, optional if hasProjectIdea is No
}

// Section 4: Program Goal — single multiple-choice question. The chosen value
// is stored as a descriptive enum (not 'a'|'b'|'c'|'d') so analysts reading
// the export / Firestore can interpret without a key.
export type ProgramGoalChoice =
  | 'just_to_learn'
  | 'find_cofounders'
  | 'find_idea_and_start'
  | 'launch_existing';

/** Follow-up "mindset" question — only collected when the applicant picks
 *  goals (c) or (d) (find_idea_and_start or launch_existing). Helps cohort
 *  organizers know who's open to building a team with other participants. */
export type ProgramMindsetChoice =
  | 'open_to_cofounders'
  | 'closed_team';

/** True iff a given Program Goal value triggers the mindset follow-up.
 *  Single source of truth used by the form, validators, admin detail, and export. */
export const PROGRAM_GOALS_REQUIRING_MINDSET: ReadonlySet<ProgramGoalChoice> =
  new Set<ProgramGoalChoice>(['find_idea_and_start', 'launch_existing']);

export interface ProgramGoal {
  goal: ProgramGoalChoice;
  /** Only set when `goal` is one of PROGRAM_GOALS_REQUIRING_MINDSET. Optional
   *  on the type so legacy applications and the (a)/(b) goal answers parse cleanly. */
  mindset?: ProgramMindsetChoice;
}

/** Single source of truth for human-readable Program Goal labels. Used by the
 *  application form radio options, the admin detail view, and the data export
 *  so all three render identical wording. */
export const PROGRAM_GOAL_LABELS: Record<ProgramGoalChoice, string> = {
  just_to_learn: 'Just to learn.',
  find_cofounders: 'To find co-founders to start a company with after the program.',
  find_idea_and_start: 'To find an idea and immediately start a company after the program.',
  launch_existing: 'To launch an existing idea or business with lessons learned from this program.',
};

/** Human-readable mindset labels — same role as PROGRAM_GOAL_LABELS. */
export const PROGRAM_MINDSET_LABELS: Record<ProgramMindsetChoice, string> = {
  open_to_cofounders: "I'd like to find co-founders through this program and/or would be willing to continue working with people from this program",
  closed_team: 'I have an existing team and would not be willing to have others join us after the program.',
};

// Section 5: Short Answer
export interface ShortAnswer {
  failureDescription: string; // max 200 words
}

// Section 6: Video Introduction
export interface VideoIntroduction {
  videoUrl: string; // YouTube or other platform URL
}

// Section 7: Cover Letter
export interface CoverLetter {
  content: string; // max 300 words
}

// Section 8: Friends (optional)
export interface Friends {
  friend1Email?: string;
  friend2Email?: string;
  /** @deprecated Older applications were collected using Operator IDs before
   *  the field was simplified to email. Kept on the type so legacy Firestore
   *  documents still parse cleanly. New submissions only write friend{1,2}Email. */
  friend1StudentId?: string;
  /** @deprecated See friend1StudentId. */
  friend2StudentId?: string;
}

export interface ApplicationFormData {
  personalInformation: PersonalInformation;
  serviceAvailability: ServiceAvailability;
  experienceBackground: ExperienceBackground;
  programGoal: ProgramGoal;
  shortAnswer: ShortAnswer;
  videoIntroduction: VideoIntroduction;
  coverLetter: CoverLetter;
  friends?: Friends;
  // NOTE: Older applications submitted before the Skills/PersonalQualities
  // sections were removed still carry `skills` and `personalQualities` keys
  // in their stored Firestore documents. Those keys are intentionally not
  // declared on this interface — they're preserved at runtime when reading
  // legacy docs but no UI renders them and no new submissions write them.
}

export interface AdminNote {
  content: string;
  adminEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Application {
  applicationId: string;
  userId: string;
  cohortId: string;
  operatorId: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  assignedClass?: string;
  formData: ApplicationFormData;
  flags: ApplicationFlags;
  notes?: AdminNote; // Notes added by admin reviewers with attribution
  // Internal admin workflow fields (not visible to applicants)
  recommendation?: 'recommend_accept' | 'recommend_reject' | 'need_fix' | 'none';
  assignedTo?: string | null; // Admin email/ID who is assigned to review this application
}

export interface CreateApplicationRequest {
  cohortId: string;
  formData: ApplicationFormData;
}