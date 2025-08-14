import { Injectable } from '@angular/core';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
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

  async createCohort(request: CreateCohortRequest): Promise<Cohort> {
    const now = new Date();
    let status: Cohort['status'] = 'upcoming';
    
    if (now >= request.applicationStartDate && now <= request.applicationEndDate) {
      status = 'accepting_applications';
    } else if (now > request.applicationEndDate && now < request.cohortStartDate) {
      status = 'closed';
    } else if (now >= request.cohortStartDate && now <= request.cohortEndDate) {
      status = 'in_progress';
    } else if (now > request.cohortEndDate) {
      status = 'completed';
    }

    const cohortData = {
      ...request,
      status
    };

    const docRef = await addDoc(
      collection(this.firebaseService.firestore, 'cohorts'), 
      cohortData
    );

    return {
      cohortId: docRef.id,
      ...cohortData
    };
  }

  async getAllCohorts(): Promise<Cohort[]> {
    const querySnapshot = await getDocs(
      collection(this.firebaseService.firestore, 'cohorts')
    );
    
    return querySnapshot.docs.map(doc => ({
      cohortId: doc.id,
      ...doc.data()
    } as Cohort));
  }

  async getCohort(cohortId: string): Promise<Cohort | null> {
    const docRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        cohortId: docSnap.id,
        ...docSnap.data()
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

    const doc = querySnapshot.docs[0];
    return {
      cohortId: doc.id,
      ...doc.data()
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

    const doc = querySnapshot.docs[0];
    return {
      cohortId: doc.id,
      ...doc.data()
    } as Cohort;
  }

  async updateCohortStatus(cohortId: string, status: Cohort['status']): Promise<void> {
    const cohortRef = doc(this.firebaseService.firestore, 'cohorts', cohortId);
    await updateDoc(cohortRef, { status });
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