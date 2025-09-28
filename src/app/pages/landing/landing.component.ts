import { Component, OnInit, OnDestroy, signal } from '@angular/core';
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
export class LandingComponent implements OnInit, OnDestroy {
  nextCohort = signal<Cohort | null>(null);
  currentAcceptingCohort = signal<Cohort | null>(null);
  isLoading = signal(true);
  timeRemaining = signal<{months: number, weeks: number, days: number, hours: number, minutes: number, seconds: number} | null>(null);
  private countdownInterval: any;

  constructor(
    private cohortService: CohortService,
    private authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    // Check if user is already logged in and redirect accordingly
    if (this.authService.isAuthenticated) {
      const userData = this.authService.userData();
      if (userData) {
        if (userData.role === 'admin') {
          this.router.navigate(['/admin']);
          return;
        } else {
          this.router.navigate(['/dashboard']);
          return;
        }
      }
    }

    await this.loadCohortInfo();
    this.startCountdown();
    this.isLoading.set(false);
  }

  private async loadCohortInfo() {
    try {
      const { current, next } = await this.cohortService.getCohortsForLanding();
      
      this.currentAcceptingCohort.set(current);
      this.nextCohort.set(next);
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

  goToCreateAccount() {
    this.router.navigate(['/auth'], { queryParams: { mode: 'register' } });
  }

  goToSignIn() {
    this.router.navigate(['/auth'], { queryParams: { mode: 'login' } });
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
    }, 1000);
  }

  private updateCountdown() {
    const cohort = this.currentAcceptingCohort();
    if (!cohort) {
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

  // Format date for multiple timezones
  formatDateWithTimezones(date: Date | undefined): string {
    if (!date) return '';

    // First, get the EST time components by forcing EST timezone
    const estFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const estParts = estFormatter.formatToParts(date);
    const estYear = parseInt(estParts.find(p => p.type === 'year')!.value);
    const estMonth = parseInt(estParts.find(p => p.type === 'month')!.value) - 1;
    const estDay = parseInt(estParts.find(p => p.type === 'day')!.value);
    const estHour = parseInt(estParts.find(p => p.type === 'hour')!.value);
    const estMinute = parseInt(estParts.find(p => p.type === 'minute')!.value);

    // Create new dates with EST as base, then apply hour arithmetic
    const ilDate = new Date(estYear, estMonth, estDay, estHour + 7, estMinute);
    const pstDate = new Date(estYear, estMonth, estDay, estHour - 3, estMinute);
    const estDate = new Date(estYear, estMonth, estDay, estHour, estMinute);

    // Format dates
    const formatDate = (d: Date, label: string) => {
      const dateStr = d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric', 
        month: 'long',
        day: 'numeric'
      });
      const timeStr = d.toTimeString().slice(0, 5);
      return `${label}: ${dateStr} at ${timeStr}`;
    };
    
    return `${formatDate(ilDate, 'IL')}\n${formatDate(pstDate, 'PT')}\n${formatDate(estDate, 'ET')}`;
  }
}