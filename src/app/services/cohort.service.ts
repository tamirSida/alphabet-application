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
  where,
  orderBy,
  limit 
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { Cohort, CreateCohortRequest } from '../models';

@Injectable({
  providedIn: 'root'
})
export class CohortService {
  constructor(private firebaseService: FirebaseService) {}

  private calculateCohortStatus(applicationStartDate: Date, applicationEndDate: Date, cohortStartDate: Date, cohortEndDate: Date): Cohort['status'] {
    const now = new Date();
    
    if (now >= applicationStartDate && now <= applicationEndDate) {
      return 'accepting_applications';
    } else if (now > applicationEndDate && now < cohortStartDate) {
      return 'closed';
    } else if (now >= cohortStartDate && now <= cohortEndDate) {
      return 'in_progress';
    } else if (now > cohortEndDate) {
      return 'completed';
    }
    
    return 'upcoming';
  }

  async createCohort(request: CreateCohortRequest): Promise<Cohort> {
    const status = this.calculateCohortStatus(
      request.applicationStartDate,
      request.applicationEndDate,
      request.cohortStartDate,
      request.cohortEndDate
    );

    const cohortData = {
      ...request,
      status
    };

    const docRef = await addDoc(
      collection(this.firebaseService.firestore, 'cohorts'), 
      cohortData
    );

    // Add classIds and enrolled count to classes
    const cohortWithClasses: Cohort = {
      cohortId: docRef.id,
      ...cohortData,
      classes: request.classes.map((cls, index) => ({
        ...cls,
        classId: `${docRef.id}_class_${index}`,
        enrolled: 0
      }))
    };

    return cohortWithClasses;
  }

  async getAllCohorts(): Promise<Cohort[]> {
    const querySnapshot = await getDocs(
      collection(this.firebaseService.firestore, 'cohorts')
    );
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const classes = (data['classes'] || []).map((cls: any, index: number) => ({
        ...cls,
        classId: cls.classId || `${doc.id}_class_${index}`,
        enrolled: cls.enrolled || 0
      }));
      
      const applicationStartDate = data['applicationStartDate']?.toDate ? data['applicationStartDate'].toDate() : new Date(data['applicationStartDate']);
      const applicationEndDate = data['applicationEndDate']?.toDate ? data['applicationEndDate'].toDate() : new Date(data['applicationEndDate']);
      const cohortStartDate = data['cohortStartDate']?.toDate ? data['cohortStartDate'].toDate() : new Date(data['cohortStartDate']);
      const cohortEndDate = data['cohortEndDate']?.toDate ? data['cohortEndDate'].toDate() : new Date(data['cohortEndDate']);
      
      // Calculate current status based on dates
      const currentStatus = this.calculateCohortStatus(applicationStartDate, applicationEndDate, cohortStartDate, cohortEndDate);
      
      return {
        cohortId: doc.id,
        ...data,
        applicationStartDate,
        applicationEndDate,
        cohortStartDate,
        cohortEndDate,
        status: currentStatus,
        classes: classes
      } as Cohort;
    });
  }

  async getCohort(cohortId: string): Promise<Cohort | null> {
    const docRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const classes = (data['classes'] || []).map((cls: any, index: number) => ({
        ...cls,
        classId: cls.classId || `${docSnap.id}_class_${index}`,
        enrolled: cls.enrolled || 0
      }));
      
      const applicationStartDate = data['applicationStartDate']?.toDate ? data['applicationStartDate'].toDate() : new Date(data['applicationStartDate']);
      const applicationEndDate = data['applicationEndDate']?.toDate ? data['applicationEndDate'].toDate() : new Date(data['applicationEndDate']);
      const cohortStartDate = data['cohortStartDate']?.toDate ? data['cohortStartDate'].toDate() : new Date(data['cohortStartDate']);
      const cohortEndDate = data['cohortEndDate']?.toDate ? data['cohortEndDate'].toDate() : new Date(data['cohortEndDate']);
      
      // Calculate current status based on dates
      const currentStatus = this.calculateCohortStatus(applicationStartDate, applicationEndDate, cohortStartDate, cohortEndDate);
      
      return {
        cohortId: docSnap.id,
        ...data,
        applicationStartDate,
        applicationEndDate,
        cohortStartDate,
        cohortEndDate,
        status: currentStatus,
        classes: classes
      } as Cohort;
    }
    return null;
  }

  async getNextOpenCohort(): Promise<Cohort | null> {
    const now = new Date();
    const q = query(
      collection(this.firebaseService.firestore, 'cohorts'),
      where('applicationStartDate', '>', now),
      orderBy('applicationStartDate', 'asc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    const docData = querySnapshot.docs[0];
    const data = docData.data();
    return {
      cohortId: docData.id,
      ...data,
      applicationStartDate: data['applicationStartDate']?.toDate ? data['applicationStartDate'].toDate() : new Date(data['applicationStartDate']),
      applicationEndDate: data['applicationEndDate']?.toDate ? data['applicationEndDate'].toDate() : new Date(data['applicationEndDate']),
      cohortStartDate: data['cohortStartDate']?.toDate ? data['cohortStartDate'].toDate() : new Date(data['cohortStartDate']),
      cohortEndDate: data['cohortEndDate']?.toDate ? data['cohortEndDate'].toDate() : new Date(data['cohortEndDate']),
      classes: data['classes'] || []
    } as Cohort;
  }

  async getCurrentAcceptingCohort(): Promise<Cohort | null> {
    const q = query(
      collection(this.firebaseService.firestore, 'cohorts'),
      where('status', '==', 'accepting_applications'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    const docData = querySnapshot.docs[0];
    const data = docData.data();
    return {
      cohortId: docData.id,
      ...data,
      applicationStartDate: data['applicationStartDate']?.toDate ? data['applicationStartDate'].toDate() : new Date(data['applicationStartDate']),
      applicationEndDate: data['applicationEndDate']?.toDate ? data['applicationEndDate'].toDate() : new Date(data['applicationEndDate']),
      cohortStartDate: data['cohortStartDate']?.toDate ? data['cohortStartDate'].toDate() : new Date(data['cohortStartDate']),
      cohortEndDate: data['cohortEndDate']?.toDate ? data['cohortEndDate'].toDate() : new Date(data['cohortEndDate']),
      classes: data['classes'] || []
    } as Cohort;
  }

  async updateCohortStatus(cohortId: string, status: Cohort['status']): Promise<void> {
    const cohortRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    await updateDoc(cohortRef, { status });
  }

  async updateCohort(cohortId: string, updates: Partial<Omit<Cohort, 'cohortId' | 'status'>>): Promise<void> {
    const cohortRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    await updateDoc(cohortRef, updates);
  }

  async deleteCohort(cohortId: string): Promise<void> {
    const cohortRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    await deleteDoc(cohortRef);
  }

  // Alternative methods that work better for unauthenticated users
  async getCohortsForLanding(): Promise<{ current: Cohort | null, next: Cohort | null }> {
    try {
      const cohorts = await this.getAllCohorts();
      const now = new Date();
      
      // Find current accepting cohort
      const currentCohort = cohorts.find(cohort => 
        now >= cohort.applicationStartDate && 
        now <= cohort.applicationEndDate
      ) || null;
      
      // Find next upcoming cohort
      const upcomingCohorts = cohorts.filter(cohort => 
        cohort.applicationStartDate > now
      ).sort((a, b) => a.applicationStartDate.getTime() - b.applicationStartDate.getTime());
      
      const nextCohort = upcomingCohorts.length > 0 ? upcomingCohorts[0] : null;
      
      return { current: currentCohort, next: nextCohort };
    } catch (error) {
      console.error('Error getting cohorts for landing:', error);
      return { current: null, next: null };
    }
  }

  async checkApplicationPeriodOverlap(startDate: Date, endDate: Date, excludeCohortId?: string): Promise<boolean> {
    const allCohorts = await this.getAllCohorts();
    
    return allCohorts.some(cohort => {
      if (excludeCohortId && cohort.cohortId === excludeCohortId) {
        return false;
      }
      
      const cohortStart = cohort.applicationStartDate;
      const cohortEnd = cohort.applicationEndDate;
      
      return (startDate <= cohortEnd && endDate >= cohortStart);
    });
  }
}