import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApplicationService, CohortService, AuthService } from '../../services';
import { Cohort } from '../../models';

@Component({
  selector: 'app-application-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './application-form.component.html',
  styleUrls: ['./application-form.component.css']
})
export class ApplicationFormComponent implements OnInit {
  applicationForm: FormGroup;
  currentCohort = signal<Cohort | null>(null);
  isLoading = signal(true);
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  constructor(
    private fb: FormBuilder,
    private applicationService: ApplicationService,
    private cohortService: CohortService,
    private authService: AuthService,
    private router: Router
  ) {
    this.applicationForm = this.fb.group({
      // Placeholder form fields - will be updated with actual form structure
      fullName: ['', [Validators.required]],
      age: ['', [Validators.required, Validators.min(18)]],
      experience: ['', [Validators.required]],
      motivation: ['', [Validators.required, Validators.minLength(50)]],
      goals: ['', [Validators.required, Validators.minLength(50)]],
      availability: ['', [Validators.required]]
    });
  }

  async ngOnInit() {
    if (!this.authService.isAuthenticated || !this.authService.isApplicant) {
      this.router.navigate(['/auth']);
      return;
    }

    const userData = this.authService.userData();
    if (userData?.status !== 'not_submitted') {
      this.router.navigate(['/dashboard']);
      return;
    }

    await this.loadCurrentCohort();
    this.isLoading.set(false);
  }

  private async loadCurrentCohort() {
    try {
      const cohort = await this.cohortService.getCurrentAcceptingCohort();
      if (!cohort) {
        this.error.set('No applications are currently being accepted.');
        return;
      }
      this.currentCohort.set(cohort);
    } catch (error) {
      console.error('Error loading cohort:', error);
      this.error.set('Failed to load application information.');
    }
  }

  async onSubmit() {
    if (this.applicationForm.invalid || !this.currentCohort()) {
      return;
    }

    const userData = this.authService.userData();
    if (!userData) {
      this.router.navigate(['/auth']);
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await this.applicationService.createApplication(userData.uid, {
        cohortId: this.currentCohort()!.cohortId,
        formData: {
          personalInfo: this.applicationForm.value,
          responses: this.applicationForm.value
        }
      });

      this.success.set(true);
      await this.authService.refreshUserData();
      
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);

    } catch (error: any) {
      console.error('Error submitting application:', error);
      this.error.set('Failed to submit application. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}