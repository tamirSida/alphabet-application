import { Injectable } from '@angular/core';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  query,
  where 
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { UserService } from './user.service';
import { Application, CreateApplicationRequest } from '../models';

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

  async updateApplicationStatus(applicationId: string, status: Application['status']): Promise<void> {
    const applicationRef = doc(this.firebaseService.firestore, 'applications', applicationId);
    const updateData: any = { status };
    
    if (status === 'accepted' || status === 'rejected') {
      updateData.reviewedAt = new Date();
    }
    
    await updateDoc(applicationRef, updateData);

    const application = await this.getApplication(applicationId);
    if (application) {
      const userStatus = status === 'accepted' ? 'accepted' : 
                        status === 'rejected' ? 'rejected' : 'submitted';
      await this.userService.updateUserStatus(application.userId, userStatus);
    }
  }
}