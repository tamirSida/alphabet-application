import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../services';

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './super-admin.component.html',
  styleUrls: ['./super-admin.component.css']
})
export class SuperAdminComponent {
  adminForm: FormGroup;
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  createdAdmin = signal<{ email: string; operatorId: string } | null>(null);

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router
  ) {
    this.adminForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  async onCreateAdmin() {
    if (this.adminForm.invalid) return;

    const { password, confirmPassword } = this.adminForm.value;
    if (password !== confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const { email, password } = this.adminForm.value;
      const admin = await this.userService.createAdmin(email, password);
      
      this.createdAdmin.set({
        email: admin.email,
        operatorId: admin.operatorId
      });

      this.success.set('Admin account created successfully!');
      this.adminForm.reset();

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
      case 'auth/invalid-email':
        return 'Invalid email address';
      default:
        return error.message || 'An error occurred. Please try again.';
    }
  }

  goToLogin() {
    this.router.navigate(['/auth']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}