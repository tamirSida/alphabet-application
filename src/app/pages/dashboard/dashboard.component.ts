import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, ApplicationService, CohortService, UserService } from '../../services';
import { Application, Cohort, User } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  user = signal<User | null>(null);
  application = signal<Application | null>(null);
  cohort = signal<Cohort | null>(null);
  currentAcceptingCohort = signal<Cohort | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private applicationService: ApplicationService,
    private cohortService: CohortService,
    private userService: UserService,
    private router: Router
  ) {}

  async ngOnInit() {
    // Wait for auth service to finish loading
    while (this.authService.isLoading()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (!this.authService.isAuthenticated || this.authService.isAdmin) {
      this.router.navigate(['/']);
      return;
    }

    await this.loadUserData();
    this.updateStatusDisplay();
    this.isLoading.set(false);
  }

  private async loadUserData() {
    try {
      const userData = this.authService.userData();
      if (!userData) {
        this.router.navigate(['/auth']);
        return;
      }

      this.user.set(userData);

      // Load application if exists
      if (userData.applicationId) {
        const application = await this.applicationService.getApplication(userData.applicationId);
        this.application.set(application);
        
        if (application) {
          const cohort = await this.cohortService.getCohort(application.cohortId);
          this.cohort.set(cohort);
        }
      }

      // Load current accepting cohort for new applications
      const currentCohort = await this.cohortService.getCurrentAcceptingCohort();
      this.currentAcceptingCohort.set(currentCohort);

    } catch (error) {
      console.error('Error loading user data:', error);
      this.error.set('Failed to load dashboard data.');
    }
  }

  async signOut() {
    try {
      await this.userService.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  goToApplication() {
    this.router.navigate(['/application']);
  }

  statusDisplay = signal({ text: 'Loading...', class: 'status-unknown', icon: 'fas fa-question' });

  private updateStatusDisplay() {
    const status = this.user()?.status;
    switch (status) {
      case 'not_submitted':
        this.statusDisplay.set({ text: 'Not Submitted', class: 'status-not-submitted', icon: 'fas fa-clock' });
        break;
      case 'submitted':
        this.statusDisplay.set({ text: 'Submitted - Awaiting Review', class: 'status-submitted', icon: 'fas fa-hourglass-half' });
        break;
      case 'accepted':
        this.statusDisplay.set({ text: 'Accepted', class: 'status-accepted', icon: 'fas fa-check-circle' });
        break;
      case 'rejected':
        this.statusDisplay.set({ text: 'Not Selected', class: 'status-rejected', icon: 'fas fa-times-circle' });
        break;
      default:
        this.statusDisplay.set({ text: 'Unknown', class: 'status-unknown', icon: 'fas fa-question' });
        break;
    }
  }

  get canApply() {
    return this.user()?.status === 'not_submitted' && !!this.currentAcceptingCohort();
  }

  get hasApplication() {
    return !!this.application();
  }

  get canReapply() {
    return this.user()?.status === 'rejected' && !!this.currentAcceptingCohort();
  }
}