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
  proofOfService: UploadedFile[]; // Required, max 2 files
  proofOfCombatService?: UploadedFile[]; // Required when combatService === 'Yes', max 2 files
  professionalExperience?: string; // max 150 words, optional
  hasProjectIdea: 'Yes' | 'No'; // New question to address feedback
  projectIdea?: {
    description: string; // Combined description covering problem, solution, and market
  }; // max 200 words, optional if hasProjectIdea is No
}

// Section 4: Short Answer
export interface ShortAnswer {
  failureDescription: string; // max 200 words
}

// Section 5: Cover Letter
export interface CoverLetter {
  content: string; // max 300 words
}

// Section 6: Video Introduction
export interface VideoIntroduction {
  videoUrl: string; // YouTube or other platform URL
}

// Section 7: Friends (optional)
export interface Friends {
  friend1StudentId?: string;
  friend2StudentId?: string;
}

export interface ApplicationFormData {
  personalInformation: PersonalInformation;
  serviceAvailability: ServiceAvailability;
  experienceBackground: ExperienceBackground;
  shortAnswer: ShortAnswer;
  coverLetter: CoverLetter;
  videoIntroduction: VideoIntroduction;
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