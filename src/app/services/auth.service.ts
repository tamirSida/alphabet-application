import { Injectable, signal } from '@angular/core';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { UserService } from './user.service';
import { User } from '../models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public currentUser = signal<FirebaseUser | null>(null);
  public userData = signal<User | null>(null);
  public isLoading = signal(true);

  constructor(
    private firebaseService: FirebaseService,
    private userService: UserService
  ) {
    this.initAuthListener();
  }

  private initAuthListener(): void {
    onAuthStateChanged(this.firebaseService.auth, async (firebaseUser) => {
      this.currentUser.set(firebaseUser);
      
      if (firebaseUser) {
        const userData = await this.userService.getUserData(firebaseUser.uid);
        this.userData.set(userData);
      } else {
        this.userData.set(null);
      }
      
      this.isLoading.set(false);
    });
  }

  get isAuthenticated(): boolean {
    return !!this.currentUser();
  }

  get isAdmin(): boolean {
    return this.userData()?.role === 'admin';
  }

  get isApplicant(): boolean {
    return this.userData()?.role === 'applicant';
  }

  async refreshUserData(): Promise<void> {
    const firebaseUser = this.currentUser();
    if (firebaseUser) {
      const userData = await this.userService.getUserData(firebaseUser.uid);
      this.userData.set(userData);
    }
  }
}