import { Injectable } from '@angular/core';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where 
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { UserService } from './user.service';
import { Application, CreateApplicationRequest, AdminNote } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  constructor(
    private firebaseService: FirebaseService,
    private userService: UserService
  ) {}

  async createApplication(userId: string, request: CreateApplicationRequest): Promise<Application> {
    const user = await this.userService.getUserData(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate red flags
    const flags = {
      englishProficiency: 
        request.formData.serviceAvailability.countryOfService === 'IL' && 
        request.formData.serviceAvailability.englishProficiency === 'No',
      combatService: request.formData.experienceBackground.combatService === 'No'
    };

    const applicationData = {
      userId,
      cohortId: request.cohortId,
      operatorId: user.operatorId,
      status: 'submitted' as const,
      submittedAt: new Date(),
      formData: request.formData,
      flags
    };

    const docRef = await addDoc(
      collection(this.firebaseService.firestore, 'applications'), 
      applicationData
    );

    const application: Application = {
      applicationId: docRef.id,
      ...applicationData
    };

    await this.userService.linkApplication(userId, application.applicationId);

    return application;
  }

  async getApplication(applicationId: string): Promise<Application | null> {
    const docRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        applicationId: docSnap.id,
        ...data,
        submittedAt: data['submittedAt']?.toDate ? data['submittedAt'].toDate() : new Date(data['submittedAt']),
        reviewedAt: data['reviewedAt'] ? (data['reviewedAt']?.toDate ? data['reviewedAt'].toDate() : new Date(data['reviewedAt'])) : undefined
      } as Application;
    }
    return null;
  }

  async getUserApplication(userId: string): Promise<Application | null> {
    const q = query(
      collection(this.firebaseService.firestore, 'applications'),
      where('userId', '==', userId)
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      applicationId: doc.id,
      ...data,
      submittedAt: data['submittedAt']?.toDate ? data['submittedAt'].toDate() : new Date(data['submittedAt']),
      reviewedAt: data['reviewedAt'] ? (data['reviewedAt']?.toDate ? data['reviewedAt'].toDate() : new Date(data['reviewedAt'])) : undefined
    } as Application;
  }

  async getAllApplications(): Promise<Application[]> {
    const querySnapshot = await getDocs(
      collection(this.firebaseService.firestore, 'applications')
    );
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        applicationId: doc.id,
        ...data,
        submittedAt: data['submittedAt']?.toDate ? data['submittedAt'].toDate() : new Date(data['submittedAt']),
        reviewedAt: data['reviewedAt'] ? (data['reviewedAt']?.toDate ? data['reviewedAt'].toDate() : new Date(data['reviewedAt'])) : undefined
      } as Application;
    });
  }

  async getCohortApplications(cohortId: string): Promise<Application[]> {
    const q = query(
      collection(this.firebaseService.firestore, 'applications'),
      where('cohortId', '==', cohortId)
    );

    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        applicationId: doc.id,
        ...data,
        submittedAt: data['submittedAt']?.toDate ? data['submittedAt'].toDate() : new Date(data['submittedAt']),
        reviewedAt: data['reviewedAt'] ? (data['reviewedAt']?.toDate ? data['reviewedAt'].toDate() : new Date(data['reviewedAt'])) : undefined
      } as Application;
    });
  }

  async updateApplicationStatus(applicationId: string, status: Application['status'], assignedClass?: string): Promise<void> {
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    const updateData: any = { status };
    
    if (status === 'accepted' || status === 'rejected') {
      updateData.reviewedAt = new Date();
    }
    
    if (assignedClass) {
      updateData.assignedClass = assignedClass;
    }
    
    await updateDoc(applicationRef, updateData);
    
    // DON'T update user status here - only when results are published
    // This keeps the applicant's dashboard showing "under_review" until admin publishes results
  }

  async deleteApplication(applicationId: string): Promise<void> {
    const application = await this.getApplication(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    // Remove application reference from user
    await this.userService.unlinkApplication(application.userId);
    
    // Delete the application document
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    await deleteDoc(applicationRef);
    
    // Reset user status to not_submitted
    await this.userService.updateUserStatus(application.userId, 'not_submitted');
  }

  async publishResults(): Promise<void> {
    // Get all applications and sync user status
    const applications = await this.getAllApplications();
    
    for (const application of applications) {
      const userStatus = application.status === 'accepted' ? 'accepted' : 
                        application.status === 'rejected' ? 'rejected' : 'submitted';
      await this.userService.updateUserStatus(application.userId, userStatus);
    }
  }

  async updateApplicationNotes(applicationId: string, notes: AdminNote): Promise<void> {
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    await updateDoc(applicationRef, { notes });
  }

  async updateApplicationRecommendation(applicationId: string, recommendation: Application['recommendation']): Promise<void> {
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    await updateDoc(applicationRef, { recommendation });
  }

  async updateApplicationAssignedTo(applicationId: string, assignedTo: string | null): Promise<void> {
    console.log('Updating assignedTo:', applicationId, assignedTo);
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    const updateData: any = {};
    
    if (assignedTo === null || assignedTo === '') {
      updateData.assignedTo = null;
    } else {
      updateData.assignedTo = assignedTo;
    }
    
    await updateDoc(applicationRef, updateData);
    console.log('AssignedTo updated successfully');
  }

  async validateFriendIds(friendIds: string[]): Promise<{[key: string]: string | null}> {
    const results: {[key: string]: string | null} = {};
    
    // Get all users to validate friend IDs (admin permission required for this operation)
    try {
      const allUsers = await this.userService.getAllApplicants();
      
      for (const friendId of friendIds) {
        if (!friendId) continue;
        
        const formattedId = friendId.replace(/\D/g, '');
        const user = allUsers.find(u => u.operatorId === formattedId);
        
        if (user && user.firstName && user.lastName) {
          results[friendId] = `${user.firstName} ${user.lastName}`;
        } else {
          results[friendId] = null;
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error validating friend IDs:', error);
      // Return empty validation if we can't access the data
      return {};
    }
  }
}