import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, AuthService, CohortService } from '../../services';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {
  isLogin = signal(true);
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  generatedOperatorId = signal<string | null>(null);

  loginForm: FormGroup;
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private cohortService: CohortService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  toggleMode() {
    this.isLogin.update(val => !val);
    this.error.set(null);
    this.success.set(null);
    this.generatedOperatorId.set(null);
  }

  async onLogin() {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { email, password } = this.loginForm.value;
      await this.userService.signIn(email, password);
      
      // Wait for auth state to update
      setTimeout(async () => {
        await this.authService.refreshUserData();
        
        const userData = this.authService.userData();
        
        // If user data is null, the user document doesn't exist in Firestore
        if (!userData) {
          this.error.set('User account not found. Please contact an administrator.');
          return;
        }
        
        if (userData.role === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      }, 1000);

    } catch (error: any) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) return;

    const { password, confirmPassword } = this.registerForm.value;
    if (password !== confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const { email, phone, password } = this.registerForm.value;
      const user = await this.userService.createUser({ email, phone, password });
      
      this.generatedOperatorId.set(user.operatorId);
      this.success.set('Account created successfully! Please save your Operator ID.');
      
      // Auto redirect after showing operator ID
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 3000);

    } catch (error: any) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'Email address is already registered';
      case 'auth/weak-password':
        return 'Password is too weak';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later';
      default:
        return error.message || 'An error occurred. Please try again.';
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }
}