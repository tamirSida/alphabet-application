import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, UserService, ApplicationService, CohortService } from '../../services';
import { User, Application, Cohort } from '../../models';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  currentView = signal<'applications' | 'cohorts'>('applications');
  applications = signal<(Application & { user?: User, cohort?: Cohort })[]>([]);
  cohorts = signal<Cohort[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  constructor(
    public authService: AuthService,
    private userService: UserService,
    private applicationService: ApplicationService,
    private cohortService: CohortService,
    private router: Router
  ) {}

  async ngOnInit() {
    if (!this.authService.isAuthenticated || !this.authService.isAdmin) {
      this.router.navigate(['/']);
      return;
    }

    await this.loadData();
    this.isLoading.set(false);
  }

  private async loadData() {
    try {
      if (this.currentView() === 'applications') {
        await this.loadApplications();
      } else {
        await this.loadCohorts();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.error.set('Failed to load data.');
    }
  }

  private async loadApplications() {
    const applications = await this.applicationService.getAllApplications();
    const enrichedApplications = [];

    for (const app of applications) {
      const [user, cohort] = await Promise.all([
        this.userService.getUserData(app.userId),
        this.cohortService.getCohort(app.cohortId)
      ]);

      enrichedApplications.push({
        ...app,
        user: user || undefined,
        cohort: cohort || undefined
      });
    }

    this.applications.set(enrichedApplications);
  }

  private async loadCohorts() {
    const cohorts = await this.cohortService.getAllCohorts();
    this.cohorts.set(cohorts);
  }

  async switchView(view: 'applications' | 'cohorts') {
    this.currentView.set(view);
    this.isLoading.set(true);
    await this.loadData();
    this.isLoading.set(false);
  }

  async updateApplicationStatus(applicationId: string, status: Application['status']) {
    try {
      await this.applicationService.updateApplicationStatus(applicationId, status);
      await this.loadApplications();
    } catch (error) {
      console.error('Error updating application status:', error);
      this.error.set('Failed to update application status.');
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

  getStatusClass(status: string): string {
    switch (status) {
      case 'submitted':
        return 'status-submitted';
      case 'under_review':
        return 'status-under-review';
      case 'accepted':
        return 'status-accepted';
      case 'rejected':
        return 'status-rejected';
      default:
        return 'status-unknown';
    }
  }
}