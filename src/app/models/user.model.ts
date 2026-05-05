export interface AdminPreferences {
  applicationsTable?: {
    /** Stored as the HIDDEN column keys (not visible) so future new columns
     *  default to visible for every existing admin without a migration. */
    hiddenColumns?: string[];
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
  };
}

export interface User {
  uid: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  operatorId: string;
  role: 'applicant' | 'admin';
  isOperator: boolean;
  status: 'not_submitted' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | null;
  applicationId: string | null;
  createdAt: Date;
  /** Per-admin UI preferences (columns, sort). Optional/absent for new admins. */
  adminPreferences?: AdminPreferences;
}

export interface CreateUserRequest {
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  password: string;
  role?: 'applicant' | 'admin';
}
