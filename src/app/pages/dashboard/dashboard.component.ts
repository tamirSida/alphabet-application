import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, ApplicationService, CohortService, UserService } from '../../services';
import { MessageTemplateService } from '../../services/message-template.service';
import { Application, Cohort, User } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user = signal<User | null>(null);
  application = signal<Application | null>(null);
  cohort = signal<Cohort | null>(null);
  currentAcceptingCohort = signal<Cohort | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  timeRemaining = signal<{months: number, weeks: number, days: number, hours: number, minutes: number, seconds: number} | null>(null);
  private countdownInterval: any;

  constructor(
    private authService: AuthService,
    private applicationService: ApplicationService,
    private cohortService: CohortService,
    private userService: UserService,
    private messageTemplateService: MessageTemplateService,
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
    this.startCountdown();
    this.isLoading.set(false);
  }

  private async loadUserData() {
    try {
      // Refresh user data from database to get latest status
      const uid = this.authService.currentUser()?.uid;
      if (!uid) {
        this.router.navigate(['/auth']);
        return;
      }

      const userData = await this.userService.getUserData(uid);
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

  // Public method to refresh data (called after application submission)
  async refreshData() {
    this.isLoading.set(true);
    await this.loadUserData();
    this.updateStatusDisplay();
    this.isLoading.set(false);
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
    const cohort = this.currentAcceptingCohort();
    if (cohort) {
      this.router.navigate(['/application'], { queryParams: { cohort: cohort.cohortId } });
    } else {
      this.error.set('No active cohort available for applications.');
    }
  }

  statusDisplay = signal({ text: 'Loading...', class: 'status-unknown', icon: 'fas fa-question' });

  private updateStatusDisplay() {
    const status = this.user()?.status;
    switch (status) {
      case 'not_submitted':
        this.statusDisplay.set({ text: 'Not Submitted', class: 'status-not-submitted', icon: 'fas fa-clock' });
        break;
      case 'submitted':
        this.statusDisplay.set({ text: 'Application Submitted and Under Review', class: 'status-submitted', icon: 'fas fa-hourglass-half' });
        break;
      case 'under_review':
        this.statusDisplay.set({ text: 'Application Submitted and Under Review', class: 'status-submitted', icon: 'fas fa-hourglass-half' });
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

  getAcceptedMessage(): string {
    const user = this.user();
    const application = this.application();
    const cohort = this.cohort();
    
    if (!user || !application || !cohort) return '';
    
    // Find the assigned class details
    const assignedClass = cohort.classes?.find(c => c.name === application.assignedClass);
    
    // Format class schedule
    let classDays = 'TBD';
    let classSchedule = 'TBD';
    
    if (assignedClass && assignedClass.weeklySchedule.length > 0) {
      classDays = assignedClass.weeklySchedule.map(s => s.day).join(', ');
      const times = assignedClass.weeklySchedule.map(s => `${s.startTime}-${s.endTime}`);
      classSchedule = Array.from(new Set(times)).join(', ');
    }
    
    return this.messageTemplateService.getAcceptedMessage({
      firstName: application.formData.personalInformation.firstName,
      lastName: application.formData.personalInformation.lastName,
      className: application.assignedClass || 'TBD',
      classDays,
      classSchedule,
      applicationId: application.applicationId,
      operatorId: user.operatorId
    });
  }

  getRejectedMessage(): string {
    const user = this.user();
    const application = this.application();
    
    if (!user || !application) return '';
    
    return this.messageTemplateService.getRejectedMessage({
      firstName: application.formData.personalInformation.firstName,
      lastName: application.formData.personalInformation.lastName,
      applicationId: application.applicationId,
      operatorId: user.operatorId,
      reviewDate: application.reviewedAt ? application.reviewedAt.toLocaleDateString() : 'TBD'
    });
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  private startCountdown() {
    // Clear existing interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    // Update countdown every second
    this.updateCountdown();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
    }, 1000); // Update every second
  }

  private updateCountdown() {
    const cohort = this.currentAcceptingCohort();
    if (!cohort || this.user()?.status !== 'not_submitted') {
      this.timeRemaining.set(null);
      return;
    }

    const now = new Date();
    const deadline = cohort.applicationEndDate;
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      this.timeRemaining.set({ months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    this.timeRemaining.set({ months: 0, weeks: 0, days, hours, minutes, seconds });
  }

  getTimeRemaining() {
    return this.timeRemaining() || { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
}