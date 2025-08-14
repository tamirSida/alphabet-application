import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CohortService, AuthService } from '../../services';
import { Cohort } from '../../models';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {
  nextCohort = signal<Cohort | null>(null);
  currentAcceptingCohort = signal<Cohort | null>(null);
  isLoading = signal(true);

  constructor(
    private cohortService: CohortService,
    private authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadCohortInfo();
    this.isLoading.set(false);
  }

  private async loadCohortInfo() {
    try {
      const [nextCohort, currentCohort] = await Promise.all([
        this.cohortService.getNextOpenCohort(),
        this.cohortService.getCurrentAcceptingCohort()
      ]);

      this.nextCohort.set(nextCohort);
      this.currentAcceptingCohort.set(currentCohort);
    } catch (error) {
      console.error('Error loading cohort info:', error);
      // Set default values when Firestore is not accessible
      this.nextCohort.set(null);
      this.currentAcceptingCohort.set(null);
    }
  }

  goToAuth() {
    this.router.navigate(['/auth']);
  }

  goToDashboard() {
    if (this.authService.isAdmin) {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  get isAuthenticated() {
    return this.authService.isAuthenticated;
  }

  get hasOpenApplications() {
    return !!this.currentAcceptingCohort();
  }

  get showNextCohortInfo() {
    return !this.hasOpenApplications && !!this.nextCohort();
  }

  get noUpcomingCohorts() {
    return !this.hasOpenApplications && !this.nextCohort();
  }
}