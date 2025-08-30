import { Injectable } from '@angular/core';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs 
} from 'firebase/firestore';
import { Observable, from, map, switchMap } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { User, CreateUserRequest } from '../models';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private firebaseService: FirebaseService) {}

  generateOperatorId(): string {
    return Math.floor(Math.random() * 900000000 + 100000000).toString();
  }

  async createUser(request: CreateUserRequest): Promise<User> {
    let userCredential;
    
    try {
      // First create the auth user
      userCredential = await createUserWithEmailAndPassword(
        this.firebaseService.auth,
        request.email,
        request.password
      );

      const operatorId = this.generateOperatorId();
      const role = request.role || 'applicant';
      const user: User = {
        uid: userCredential.user.uid,
        userId: userCredential.user.uid,
        email: request.email,
        operatorId,
        role,
        isOperator: role === 'applicant',
        status: role === 'applicant' ? 'not_submitted' : null,
        applicationId: null,
        createdAt: new Date()
      };

      // Only add optional fields if they exist to avoid undefined values
      if (request.firstName) {
        user.firstName = request.firstName;
      }
      if (request.lastName) {
        user.lastName = request.lastName;
      }
      if (request.phone) {
        user.phone = request.phone;
      }

      try {
        // Then create the Firestore document
        await setDoc(doc(this.firebaseService.firestore, 'users', user.uid), user);
        return user;
      } catch (firestoreError) {
        // If Firestore creation fails, delete the auth user
        console.error('Firestore user creation failed, rolling back auth user:', firestoreError);
        await userCredential.user.delete();
        throw new Error('Failed to create user account. Please try again.');
      }
    } catch (authError: any) {
      // If auth creation fails, throw the original error
      console.error('Auth user creation failed:', authError);
      throw authError;
    }
  }

  async createAdmin(email: string, password: string): Promise<User> {
    return this.createUser({
      email,
      password,
      role: 'admin'
    });
  }

  async signIn(email: string, password: string): Promise<FirebaseUser> {
    const userCredential = await signInWithEmailAndPassword(
      this.firebaseService.auth,
      email,
      password
    );
    return userCredential.user;
  }

  async signOut(): Promise<void> {
    await signOut(this.firebaseService.auth);
  }

  async getUserData(uid: string): Promise<User | null> {
    const docRef = doc(this.firebaseService.firestore, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...data,
        createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt'])
      } as User;
    }
    return null;
  }

  async updateUserStatus(uid: string, status: User['status']): Promise<void> {
    const userRef = doc(this.firebaseService.firestore, 'users', uid);
    await updateDoc(userRef, { status });
  }

  async linkApplication(uid: string, applicationId: string): Promise<void> {
    const userRef = doc(this.firebaseService.firestore, 'users', uid);
    await updateDoc(userRef, { 
      applicationId,
      status: 'under_review'  // Auto-change to under review on submission
    });
  }

  async unlinkApplication(uid: string): Promise<void> {
    const userRef = doc(this.firebaseService.firestore, 'users', uid);
    await updateDoc(userRef, { 
      applicationId: null,
      status: 'not_submitted'
    });
  }

  async getAllApplicants(): Promise<User[]> {
    const q = query(
      collection(this.firebaseService.firestore, 'users'),
      where('role', '==', 'applicant')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt'])
      } as User;
    });
  }

  async getAllAdmins(): Promise<User[]> {
    const q = query(
      collection(this.firebaseService.firestore, 'users'),
      where('role', '==', 'admin')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt'])
      } as User;
    });
  }

  async getUserByOperatorId(operatorId: string): Promise<User | null> {
    const q = query(
      collection(this.firebaseService.firestore, 'users'),
      where('operatorId', '==', operatorId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      ...data,
      createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt'])
    } as User;
  }
}