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
  selectedClasses: string[]; // Array of classIds from cohort
}

// Section 3: Experience & Background
export interface ExperienceBackground {
  combatService: 'Yes' | 'No';
  militaryServiceDescription: string; // max 75 words
  professionalExperience?: string; // max 150 words, optional
  hasProjectIdea: 'Yes' | 'No'; // New question to address feedback
  projectIdea?: {
    problemStatement: string;
    ideaSummary: string;
    solutionApproach: string;
    marketClients: string;
  }; // max 200 words total, optional if hasProjectIdea is No
}

// Section 4: Skills (1-5 scale)
export interface Skills {
  aiDailyUse: number; // 1-5
  programming: number; // 1-5
  marketingSales: number; // 1-5
  management: number; // 1-5
  graphicDesign: number; // 1-5
  other?: {
    skill: string;
    rating: number; // 1-5
  };
}

// Section 5: Personal Qualities (0-10 scale with examples)
export interface PersonalQuality {
  rating: number; // 0-10
  example: string;
}

export interface PersonalQualities {
  proactivePersonality: PersonalQuality;
  persistenceHandleDifficulties: PersonalQuality;
  performUnderStress: PersonalQuality;
  independence: PersonalQuality;
  teamwork: PersonalQuality;
  mentalFlexibility: PersonalQuality;
  passionForProjects: PersonalQuality;
  creativeThinking: PersonalQuality;
}

// Section 6: Short Answer
export interface ShortAnswer {
  failureDescription: string; // max 200 words
}

// Section 7: Cover Letter
export interface CoverLetter {
  content: string; // max 300 words
}

// Section 8: Video Introduction
export interface VideoIntroduction {
  videoUrl: string; // YouTube or other platform URL
}

// Section 9: Friends (optional)
export interface Friends {
  friend1StudentId?: string;
  friend2StudentId?: string;
}

export interface ApplicationFormData {
  personalInformation: PersonalInformation;
  serviceAvailability: ServiceAvailability;
  experienceBackground: ExperienceBackground;
  skills: Skills;
  personalQualities: PersonalQualities;
  shortAnswer: ShortAnswer;
  coverLetter: CoverLetter;
  videoIntroduction: VideoIntroduction;
  friends?: Friends;
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
}

export interface CreateApplicationRequest {
  cohortId: string;
  formData: ApplicationFormData;
}