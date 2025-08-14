export interface Application {
  applicationId: string;
  userId: string;
  cohortId: string;
  operatorId: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  formData: ApplicationFormData;
}

export interface ApplicationFormData {
  // Placeholder - will be updated with actual form fields later
  personalInfo?: any;
  responses?: any;
}

export interface CreateApplicationRequest {
  cohortId: string;
  formData: ApplicationFormData;
}