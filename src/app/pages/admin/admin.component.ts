import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserService, ApplicationService, CohortService } from '../../services';
import { User, Application, Cohort } from '../../models';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  currentView = signal<'applications' | 'cohorts' | 'admin'>('applications');
  applications = signal<(Application & { user?: User, cohort?: Cohort })[]>([]);
  filteredApplications = signal<(Application & { user?: User, cohort?: Cohort })[]>([]);
  cohorts = signal<Cohort[]>([]);
  admins = signal<User[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  // Search and filter
  searchTerm = signal('');
  statusFilter = signal<string>('all');
  selectedApplication = signal<(Application & { user?: User, cohort?: Cohort }) | null>(null);

  cohortForm: FormGroup;
  adminForm: FormGroup;
  showCohortForm = signal(false);
  showAdminForm = signal(false);
  editingCohort = signal<Cohort | null>(null);

  constructor(
    public authService: AuthService,
    private userService: UserService,
    private applicationService: ApplicationService,
    private cohortService: CohortService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.cohortForm = this.fb.group({
      number: ['', Validators.required],
      applicationStartDate: ['', Validators.required],
      applicationStartTime: ['09:00', Validators.required],
      applicationEndDate: ['', Validators.required],
      applicationEndTime: ['23:59', Validators.required],
      cohortStartDate: ['', Validators.required],
      cohortEndDate: ['', Validators.required],
      classes: this.fb.array([], [Validators.required, Validators.minLength(1)])
    });

    // Add initial class
    this.addNewClass();

    this.adminForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async ngOnInit() {
    // Wait for auth service to finish loading
    while (this.authService.isLoading()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

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
      } else if (this.currentView() === 'cohorts') {
        await this.loadCohorts();
      } else if (this.currentView() === 'admin') {
        await this.loadAdmins();
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
    this.filterApplications();
  }

  private filterApplications() {
    const apps = this.applications();
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    let filtered = apps;

    // Apply search filter
    if (search) {
      filtered = filtered.filter(app => 
        app.user?.email?.toLowerCase().includes(search) ||
        app.user?.operatorId?.toLowerCase().includes(search) ||
        `${app.user?.email?.split('@')[0] || ''}`.toLowerCase().includes(search) ||
        app.operatorId.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (status !== 'all') {
      filtered = filtered.filter(app => app.status === status);
    }

    this.filteredApplications.set(filtered);
  }

  updateSearch(term: string) {
    this.searchTerm.set(term);
    this.filterApplications();
  }

  updateStatusFilter(status: string) {
    this.statusFilter.set(status);
    this.filterApplications();
  }

  viewApplication(application: Application & { user?: User, cohort?: Cohort }) {
    this.selectedApplication.set(application);
  }

  closeApplicationView() {
    this.selectedApplication.set(null);
  }

  private async loadCohorts() {
    const cohorts = await this.cohortService.getAllCohorts();
    this.cohorts.set(cohorts);
  }

  private async loadAdmins() {
    const admins = await this.userService.getAllAdmins();
    this.admins.set(admins);
  }

  async switchView(view: 'applications' | 'cohorts' | 'admin') {
    this.currentView.set(view);
    this.isLoading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.showCohortForm.set(false);
    this.showAdminForm.set(false);
    await this.loadData();
    this.isLoading.set(false);
  }

  async updateApplicationStatus(applicationId: string, status: Application['status']) {
    try {
      await this.applicationService.updateApplicationStatus(applicationId, status);
      
      // Close detail view if open
      if (this.selectedApplication()) {
        this.selectedApplication.set(null);
      }
      
      await this.loadApplications();
      this.success.set(`Application ${status} successfully!`);
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

  async createCohort() {
    if (this.cohortForm.invalid) return;

    try {
      const formData = this.cohortForm.value;
      
      // Combine date and time for application dates
      const appStartDateTime = new Date(`${formData.applicationStartDate}T${formData.applicationStartTime}`);
      const appEndDateTime = new Date(`${formData.applicationEndDate}T${formData.applicationEndTime}`);
      
      if (this.editingCohort()) {
        // Update existing cohort
        const cohortClasses = this.convertFormClassesToCohortClasses(formData.classes);
        await this.cohortService.updateCohort(this.editingCohort()!.cohortId, {
          number: formData.number,
          applicationStartDate: appStartDateTime,
          applicationEndDate: appEndDateTime,
          cohortStartDate: new Date(formData.cohortStartDate),
          cohortEndDate: new Date(formData.cohortEndDate),
          classes: cohortClasses
        });
        this.success.set('Cohort updated successfully!');
      } else {
        // Create new cohort
        const cohortClasses = this.convertFormClassesToCohortClasses(formData.classes);
        await this.cohortService.createCohort({
          number: formData.number,
          applicationStartDate: appStartDateTime,
          applicationEndDate: appEndDateTime,
          cohortStartDate: new Date(formData.cohortStartDate),
          cohortEndDate: new Date(formData.cohortEndDate),
          classes: cohortClasses
        });
        this.success.set('Cohort created successfully!');
      }

      this.showCohortForm.set(false);
      this.editingCohort.set(null);
      this.cohortForm.reset();
      this.resetCohortFormDefaults();
      await this.loadCohorts();
    } catch (error: any) {
      this.error.set(error.message || 'Failed to save cohort.');
    }
  }

  async createAdmin() {
    if (this.adminForm.invalid) return;

    try {
      const formData = this.adminForm.value;
      await this.userService.createUser({
        email: formData.email,
        password: formData.password,
        role: 'admin'
      });

      this.success.set('Admin created successfully!');
      this.showAdminForm.set(false);
      this.adminForm.reset();
      await this.loadAdmins();
    } catch (error: any) {
      this.error.set(error.message || 'Failed to create admin.');
    }
  }

  toggleCohortForm() {
    this.showCohortForm.update(val => !val);
    this.showAdminForm.set(false);
    this.error.set(null);
    this.success.set(null);
    
    if (!this.showCohortForm()) {
      this.editingCohort.set(null);
      this.cohortForm.reset();
      this.resetCohortFormDefaults();
    }
  }

  private resetCohortFormDefaults() {
    // Clear existing classes
    while (this.classesArray.length !== 0) {
      this.classesArray.removeAt(0);
    }
    
    // Add one default class
    this.addNewClass();
    
    this.cohortForm.patchValue({
      applicationStartTime: '09:00',
      applicationEndTime: '23:59'
    });
  }

  editCohort(cohort: Cohort) {
    this.editingCohort.set(cohort);
    this.showCohortForm.set(true);
    this.showAdminForm.set(false);
    this.error.set(null);
    this.success.set(null);
    
    // Format dates for form inputs
    const appStartDate = cohort.applicationStartDate.toISOString().split('T')[0];
    const appStartTime = cohort.applicationStartDate.toTimeString().slice(0, 5);
    const appEndDate = cohort.applicationEndDate.toISOString().split('T')[0];
    const appEndTime = cohort.applicationEndDate.toTimeString().slice(0, 5);
    const cohortStartDate = cohort.cohortStartDate.toISOString().split('T')[0];
    const cohortEndDate = cohort.cohortEndDate.toISOString().split('T')[0];
    
    // Clear existing classes
    while (this.classesArray.length !== 0) {
      this.classesArray.removeAt(0);
    }
    
    // Populate classes from cohort data
    if (cohort.classes && cohort.classes.length > 0) {
      cohort.classes.forEach(cohortClass => {
        const classFormGroup = this.createClassFormGroup();
        
        // Set basic class info
        classFormGroup.patchValue({
          name: cohortClass.name,
          capacity: cohortClass.capacity
        });
        
        // Set weekdays and times from weeklySchedule
        const weekdaysGroup = classFormGroup.get('weekdays') as FormGroup;
        const timesGroup = classFormGroup.get('times') as FormGroup;
        
        // Reset all weekdays to false first
        Object.keys(weekdaysGroup.controls).forEach(day => {
          weekdaysGroup.get(day)?.setValue(false);
        });
        
        // Set selected weekdays and their times
        cohortClass.weeklySchedule.forEach(schedule => {
          weekdaysGroup.get(schedule.day)?.setValue(true);
          
          const dayTimeGroup = timesGroup.get(schedule.day) as FormGroup;
          dayTimeGroup.patchValue({
            startTime: schedule.startTime,
            endTime: schedule.endTime
          });
        });
        
        this.classesArray.push(classFormGroup);
      });
    } else {
      // If no classes exist, add one default class
      this.addNewClass();
    }
    
    this.cohortForm.patchValue({
      number: cohort.number,
      applicationStartDate: appStartDate,
      applicationStartTime: appStartTime,
      applicationEndDate: appEndDate,
      applicationEndTime: appEndTime,
      cohortStartDate: cohortStartDate,
      cohortEndDate: cohortEndDate
    });
  }

  async deleteCohort(cohortId: string) {
    if (!confirm('Are you sure you want to delete this cohort? This action cannot be undone.')) {
      return;
    }
    
    try {
      await this.cohortService.deleteCohort(cohortId);
      this.success.set('Cohort deleted successfully!');
      await this.loadCohorts();
    } catch (error: any) {
      this.error.set(error.message || 'Failed to delete cohort.');
    }
  }

  toggleAdminForm() {
    this.showAdminForm.update(val => !val);
    this.showCohortForm.set(false);
    this.error.set(null);
    this.success.set(null);
  }

  // Class management methods
  get classesArray(): FormArray {
    return this.cohortForm.get('classes') as FormArray;
  }

  createClassFormGroup(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      capacity: [25, [Validators.required, Validators.min(1)]],
      weekdays: this.fb.group({
        Monday: [false],
        Tuesday: [false],
        Wednesday: [false],
        Thursday: [false],
        Friday: [false]
      }),
      times: this.fb.group({
        Monday: this.fb.group({ startTime: ['09:00'], endTime: ['12:00'] }),
        Tuesday: this.fb.group({ startTime: ['09:00'], endTime: ['12:00'] }),
        Wednesday: this.fb.group({ startTime: ['09:00'], endTime: ['12:00'] }),
        Thursday: this.fb.group({ startTime: ['09:00'], endTime: ['12:00'] }),
        Friday: this.fb.group({ startTime: ['09:00'], endTime: ['12:00'] })
      })
    });
  }

  addNewClass() {
    const classForm = this.createClassFormGroup();
    
    // Set default name based on current count
    const classCount = this.classesArray.length + 1;
    classForm.get('name')?.setValue(`Class ${String.fromCharCode(64 + classCount)}`);
    
    this.classesArray.push(classForm);
  }

  removeClass(index: number) {
    if (this.classesArray.length > 1) { // Keep at least one class
      this.classesArray.removeAt(index);
    }
  }

  onWeekdayChange(classIndex: number, day: string, checked: boolean) {
    const classControl = this.classesArray.at(classIndex);
    if (!classControl) return;
    
    const weekdaysGroup = classControl.get('weekdays') as FormGroup;
    if (!weekdaysGroup) return;
    
    weekdaysGroup.get(day)?.setValue(checked);
  }

  isWeekdaySelected(classIndex: number, day: string): boolean {
    const classControl = this.classesArray.at(classIndex);
    if (!classControl) return false;
    
    const weekdaysGroup = classControl.get('weekdays') as FormGroup;
    if (!weekdaysGroup) return false;
    
    return weekdaysGroup.get(day)?.value || false;
  }

  getSelectedWeekdays(classIndex: number): string[] {
    const classControl = this.classesArray.at(classIndex);
    if (!classControl) return [];
    
    const weekdaysGroup = classControl.get('weekdays') as FormGroup;
    if (!weekdaysGroup) return [];
    
    return Object.keys(weekdaysGroup.controls).filter(day => weekdaysGroup.get(day)?.value);
  }

  // Convert form classes to cohort classes format
  private convertFormClassesToCohortClasses(formClasses: any[]): any[] {
    return formClasses.map(formClass => {
      const selectedDays = Object.keys(formClass.weekdays).filter(day => formClass.weekdays[day]);
      
      const weeklySchedule = selectedDays.map(day => ({
        day: day as 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday',
        startTime: formClass.times[day].startTime,
        endTime: formClass.times[day].endTime
      }));

      return {
        name: formClass.name,
        capacity: formClass.capacity,
        weeklySchedule
      };
    });
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