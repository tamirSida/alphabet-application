export interface User {
  uid: string;
  userId: string;
  email: string;
  phone?: string;
  operatorId: string;
  role: 'applicant' | 'admin';
  isOperator: boolean;
  status: 'not_submitted' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | null;
  applicationId: string | null;
  createdAt: Date;
}

export interface CreateUserRequest {
  email: string;
  phone?: string;
  password: string;
  role?: 'applicant' | 'admin';
}