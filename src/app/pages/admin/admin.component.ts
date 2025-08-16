import { Component, OnInit, OnDestroy, signal } from '@angular/core';
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
export class AdminComponent implements OnInit, OnDestroy {
  currentView = signal<'applications' | 'cohorts' | 'admin'>('applications');
  applications = signal<(Application & { user?: User, cohort?: Cohort })[]>([]);
  filteredApplications = signal<(Application & { user?: User, cohort?: Cohort })[]>([]);
  cohorts = signal<Cohort[]>([]);
  admins = signal<User[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  // Auto-refresh properties
  private refreshInterval: any;
  private lastApplicationCount = 0;
  
  // Publish results state
  isPublishing = signal(false);
  lastPublishTime = signal<Date | null>(null);
  
  // Search and filter
  searchTerm = signal('');
  statusFilter = signal<string>('all');
  countryFilter = signal<string>('all');
  classFilter = signal<string>('all');
  selectedApplication = signal<(Application & { user?: User, cohort?: Cohort }) | null>(null);
  availableClasses = signal<string[]>([]);
  
  // Class selection modal
  showClassSelectionModal = signal(false);
  pendingApplication = signal<(Application & { user?: User, cohort?: Cohort }) | null>(null);
  classSelectionModalTitle = signal('');
  classSelectionModalSubtitle = signal('');

  // Notes functionality
  showNotesPopup = signal(false);
  notesContent = signal('');
  isSavingNotes = signal(false);
  notesPosition = signal({ x: 100, y: 100 });
  isDragging = signal(false);
  dragOffset = signal({ x: 0, y: 0 });

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
    
    // Start auto-refresh for applications view
    this.startAutoRefresh();
    
    // Add global mouse event listeners for popup dragging
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseUp());
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
    
    // Clean up event listeners
    document.removeEventListener('mousemove', (e) => this.onMouseMove(e));
    document.removeEventListener('mouseup', () => this.onMouseUp());
  }

  private startAutoRefresh() {
    this.stopAutoRefresh(); // Clear any existing interval
    
    // Only auto-refresh when viewing applications
    if (this.currentView() === 'applications') {
      this.refreshInterval = setInterval(async () => {
        await this.checkForNewApplications();
      }, 30000); // Check every 30 seconds
    }
  }

  private stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async checkForNewApplications() {
    if (this.currentView() !== 'applications') return;
    
    try {
      const applications = await this.applicationService.getAllApplications();
      
      if (applications.length > this.lastApplicationCount) {
        // New application(s) detected
        await this.loadApplications();
        this.success.set(`${applications.length - this.lastApplicationCount} new application(s) received!`);
        
        // Clear success message after 5 seconds
        setTimeout(() => {
          this.success.set(null);
        }, 5000);
      }
      
      this.lastApplicationCount = applications.length;
    } catch (error) {
      // Silently handle errors in background refresh
      console.log('Auto-refresh check failed:', error);
    }
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
    // Load cohorts first to ensure we have class data
    await this.loadCohorts();
    
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
    this.lastApplicationCount = enrichedApplications.length; // Track count for auto-refresh
    this.loadAvailableClasses();
    this.filterApplications();
  }

  private loadAvailableClasses() {
    const allClasses = new Set<string>();
    
    // Get classes from cohorts (these should be clean names like "Class A", "Class B")
    this.cohorts().forEach(cohort => {
      cohort.classes?.forEach(cohortClass => {
        if (cohortClass.name && this.isValidClassName(cohortClass.name)) {
          allClasses.add(cohortClass.name);
        }
      });
    });
    
    // Get classes from application preferences, but filter out auto-generated IDs
    this.applications().forEach(app => {
      app.formData.serviceAvailability.selectedClasses?.forEach(className => {
        if (className && this.isValidClassName(className)) {
          allClasses.add(className);
        }
      });
      
      // Also include assigned classes
      if (app.assignedClass && this.isValidClassName(app.assignedClass)) {
        allClasses.add(app.assignedClass);
      }
    });
    
    // If no valid classes found, add some defaults
    if (allClasses.size === 0) {
      allClasses.add('Class A');
      allClasses.add('Class B');
      allClasses.add('Class C');
    }
    
    this.availableClasses.set(Array.from(allClasses).sort());
  }

  private isValidClassName(name: string): boolean {
    // Filter out auto-generated Firebase IDs and invalid class names
    if (!name || name.trim() === '') return false;
    
    // Auto-generated IDs are usually long strings with random characters
    if (name.length > 20) return false;
    if (name.includes('_') && name.length > 10) return false;
    if (/^[a-zA-Z0-9]{10,}$/.test(name)) return false; // Pure alphanumeric strings longer than 10 chars
    
    return true;
  }

  private filterApplications() {
    const apps = this.applications();
    const search = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    const country = this.countryFilter();
    const classFilter = this.classFilter();

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

    // Apply country filter
    if (country !== 'all') {
      filtered = filtered.filter(app => app.formData.serviceAvailability.countryOfService === country);
    }

    // Apply class filter
    if (classFilter !== 'all') {
      filtered = filtered.filter(app => 
        app.formData.serviceAvailability.selectedClasses?.includes(classFilter) ||
        app.assignedClass === classFilter
      );
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

  updateCountryFilter(country: string) {
    this.countryFilter.set(country);
    this.filterApplications();
  }

  updateClassFilter(classFilter: string) {
    this.classFilter.set(classFilter);
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
    
    // Restart auto-refresh for new view
    this.startAutoRefresh();
  }

  async acceptApplication(application: Application & { user?: User, cohort?: Cohort }) {
    const availableClasses = this.availableClasses();
    
    if (availableClasses.length === 0) {
      this.error.set('No classes available for assignment.');
      return;
    }
    
    // Open class selection modal
    this.pendingApplication.set(application);
    
    if (application.status === 'accepted') {
      this.classSelectionModalTitle.set('Reassign Class');
      this.classSelectionModalSubtitle.set(`Reassign ${application.formData.personalInformation.firstName} ${application.formData.personalInformation.lastName} to a different class:`);
    } else {
      this.classSelectionModalTitle.set('Accept Application');
      this.classSelectionModalSubtitle.set(`Accept ${application.formData.personalInformation.firstName} ${application.formData.personalInformation.lastName} and assign to a class:`);
    }
    
    this.showClassSelectionModal.set(true);
  }

  async reassignClass(application: Application & { user?: User, cohort?: Cohort }) {
    // Use the same modal as acceptApplication for consistency
    this.acceptApplication(application);
  }

  // Modal management methods
  closeClassSelectionModal() {
    this.showClassSelectionModal.set(false);
    this.pendingApplication.set(null);
    this.classSelectionModalTitle.set('');
    this.classSelectionModalSubtitle.set('');
  }

  async selectClass(className: string) {
    const application = this.pendingApplication();
    if (!application) return;

    try {
      await this.applicationService.updateApplicationStatus(application.applicationId, 'accepted', className);
      
      // Close modal and detail view if open
      this.closeClassSelectionModal();
      if (this.selectedApplication()) {
        this.selectedApplication.set(null);
      }
      
      await this.loadApplications();
      
      if (application.status === 'accepted') {
        this.success.set(`Application reassigned to ${className}!`);
      } else {
        this.success.set(`Application accepted and assigned to ${className}!`);
      }
    } catch (error) {
      console.error('Error updating application:', error);
      this.error.set('Failed to update application.');
      this.closeClassSelectionModal();
    }
  }

  async toggleReject(application: Application & { user?: User, cohort?: Cohort }) {
    // If currently rejected, move back to submitted status
    if (application.status === 'rejected') {
      try {
        await this.applicationService.updateApplicationStatus(application.applicationId, 'submitted');
        
        // Close detail view if open
        if (this.selectedApplication()) {
          this.selectedApplication.set(null);
        }
        
        await this.loadApplications();
        this.success.set('Application returned to submitted status!');
      } catch (error) {
        console.error('Error unrejecting application:', error);
        this.error.set('Failed to unreject application.');
      }
    }
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

  async deleteApplication(applicationId: string) {
    const application = this.applications().find(app => app.applicationId === applicationId);
    if (!application) return;
    
    const applicantName = `${application.formData.personalInformation.firstName} ${application.formData.personalInformation.lastName}`;
    
    if (!confirm(`Are you sure you want to DELETE ${applicantName}'s application? This action cannot be undone and will reset their account status.`)) {
      return;
    }
    
    try {
      await this.applicationService.deleteApplication(applicationId);
      
      // Close detail view if open
      if (this.selectedApplication()?.applicationId === applicationId) {
        this.selectedApplication.set(null);
      }
      
      await this.loadApplications();
      this.success.set(`Application for ${applicantName} has been deleted successfully!`);
    } catch (error) {
      console.error('Error deleting application:', error);
      this.error.set('Failed to delete application.');
    }
  }

  async publishResults() {
    const apps = this.applications();
    
    // Check if all applications are either accepted or rejected
    const hasUnreviewedApps = apps.some(app => 
      app.status !== 'accepted' && app.status !== 'rejected'
    );
    
    if (hasUnreviewedApps) {
      this.error.set('Cannot publish results. All applications must be either accepted or rejected first.');
      return;
    }
    
    if (apps.length === 0) {
      this.error.set('No applications found to publish.');
      return;
    }
    
    const confirmMessage = `Are you sure you want to publish results to all ${apps.length} applicant(s)? This will update their dashboard status and cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    this.isPublishing.set(true);
    this.error.set(null);
    
    try {
      await this.applicationService.publishResults();
      
      // Set last publish time
      this.lastPublishTime.set(new Date());
      
      // Show success with animation
      this.success.set(`🎉 Successfully published results to all ${apps.length} applicant(s)! 🎉`);
      
      // Auto-clear success message after 8 seconds
      setTimeout(() => {
        this.success.set(null);
      }, 8000);
      
    } catch (error) {
      console.error('Error publishing results:', error);
      this.error.set('Failed to publish results.');
    } finally {
      this.isPublishing.set(false);
    }
  }

  canPublishResults(): boolean {
    const apps = this.applications();
    if (apps.length === 0) return false;
    
    // All applications must be either accepted or rejected
    return apps.every(app => app.status === 'accepted' || app.status === 'rejected');
  }

  getLastPublishDisplay(): string {
    const publishTime = this.lastPublishTime();
    if (!publishTime) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - publishTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return publishTime.toLocaleDateString();
  }

  // Notes functionality
  openNotesPopup() {
    const app = this.selectedApplication();
    if (app) {
      this.notesContent.set(app.notes?.content || '');
      
      // Position popup in center-right of screen
      const x = window.innerWidth - 450;
      const y = Math.max(100, (window.innerHeight - 400) / 2);
      this.notesPosition.set({ x, y });
      
      this.showNotesPopup.set(true);
    }
  }

  closeNotesPopup() {
    this.showNotesPopup.set(false);
    this.notesContent.set('');
    this.isDragging.set(false);
  }

  onMouseDown(event: MouseEvent) {
    this.isDragging.set(true);
    const popup = event.currentTarget as HTMLElement;
    const rect = popup.getBoundingClientRect();
    this.dragOffset.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
    event.preventDefault();
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging()) return;
    
    const newX = event.clientX - this.dragOffset().x;
    const newY = event.clientY - this.dragOffset().y;
    
    // Keep popup within viewport bounds
    const maxX = window.innerWidth - 400;
    const maxY = window.innerHeight - 300;
    
    this.notesPosition.set({
      x: Math.max(0, Math.min(maxX, newX)),
      y: Math.max(0, Math.min(maxY, newY))
    });
  }

  onMouseUp() {
    this.isDragging.set(false);
  }

  async saveNotes() {
    const app = this.selectedApplication();
    if (!app) return;

    this.isSavingNotes.set(true);
    this.error.set(null);

    try {
      const currentUser = this.authService.currentUser();
      if (!currentUser) throw new Error('No authenticated user');

      const noteData = {
        content: this.notesContent(),
        adminEmail: currentUser.email || 'unknown',
        createdAt: app.notes?.createdAt || new Date(),
        updatedAt: new Date()
      };

      await this.applicationService.updateApplicationNotes(app.applicationId, noteData);
      
      // Update the local application data
      const updatedApp = { ...app, notes: noteData };
      this.selectedApplication.set(updatedApp);
      
      // Update the applications list
      const apps = this.applications();
      const appIndex = apps.findIndex(a => a.applicationId === app.applicationId);
      if (appIndex !== -1) {
        apps[appIndex] = updatedApp;
        this.applications.set([...apps]);
      }

      this.success.set('Notes saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        this.success.set(null);
      }, 3000);

    } catch (error) {
      console.error('Error saving notes:', error);
      this.error.set('Failed to save notes.');
    } finally {
      this.isSavingNotes.set(false);
    }
  }

  formatTimestamp(date: Date | undefined): string {
    if (!date) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Date(date).toLocaleDateString();
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

  calculateSkillsScore(skills: any): { score: number; maxScore: number; percentage: number } {
    if (!skills) return { score: 0, maxScore: 0, percentage: 0 };
    
    let totalScore = 0;
    let maxScore = 0;
    
    // Add up all the standard skills (1-5 scale)
    const standardSkills = ['aiDailyUse', 'programming', 'marketingSales', 'management', 'graphicDesign'];
    
    standardSkills.forEach(skill => {
      if (skills[skill] !== undefined) {
        totalScore += skills[skill];
        maxScore += 5;
      }
    });
    
    // Add custom skill if present
    if (skills.other && skills.other.rating !== undefined) {
      totalScore += skills.other.rating;
      maxScore += 5;
    }
    
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    
    return { score: totalScore, maxScore, percentage };
  }

  calculatePersonalQualitiesScore(personalQualities: any): { score: number; maxScore: number; percentage: number } {
    if (!personalQualities) return { score: 0, maxScore: 0, percentage: 0 };
    
    let totalScore = 0;
    let maxScore = 0;
    
    // All personal qualities are on 0-10 scale
    const qualities = [
      'proactivePersonality',
      'persistenceHandleDifficulties', 
      'performUnderStress',
      'independence',
      'teamwork',
      'mentalFlexibility',
      'passionForProjects',
      'creativeThinking'
    ];
    
    qualities.forEach(quality => {
      if (personalQualities[quality] && personalQualities[quality].rating !== undefined) {
        totalScore += personalQualities[quality].rating;
        maxScore += 10;
      }
    });
    
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    
    return { score: totalScore, maxScore, percentage };
  }
}