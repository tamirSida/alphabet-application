import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, CohortService, ApplicationService, UserService, FirebaseService } from '../../services';
import { Cohort, ApplicationFormData, CreateApplicationRequest, CohortClass, ProgramGoalChoice, PROGRAM_GOALS_REQUIRING_MINDSET } from '../../models';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

@Component({
  selector: 'app-application',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './application.component.html',
  styleUrls: ['./application.component.css']
})
export class ApplicationComponent implements OnInit {
  currentStep = signal(1);
  totalSteps = 8;
  isLoading = signal(true);
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  cohort = signal<Cohort | null>(null);
  applicationForm!: FormGroup;

  // (Friend lookup-by-Operator-ID machinery was removed when the friends
  // field was simplified to plain email inputs.)

  // Drag and drop state
  isDragOver = signal(false);
  
  // Validation popup state
  showValidationPopup = signal(false);
  validationErrors = signal<string>('');
  
  // Progress computation
  progress = computed(() => (this.currentStep() / this.totalSteps) * 100);
  
  // Date format based on locale
  dateFormat = signal<'mm/dd' | 'dd/mm'>('mm/dd');
  
  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cohortService: CohortService,
    private applicationService: ApplicationService,
    private userService: UserService,
    private firebaseService: FirebaseService,
    public router: Router,
    private route: ActivatedRoute
  ) {
    this.initializeForm();
  }

  async ngOnInit() {
    // Detect locale for date format
    this.detectDateFormat();
    
    // Wait for auth to load
    while (this.authService.isLoading()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (!this.authService.isAuthenticated || this.authService.isAdmin) {
      this.router.navigate(['/']);
      return;
    }

    await this.loadCohortAndUserData();
    this.isLoading.set(false);
  }

  private initializeForm() {
    this.applicationForm = this.fb.group({
      // Section 1: Personal Information
      personalInformation: this.fb.group({
        studentId: ['', Validators.required],
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        telephone: [''],
        email: ['', [Validators.required, Validators.email]]
      }),
      
      // Section 2: Service & Availability
      serviceAvailability: this.fb.group({
        countryOfService: ['', Validators.required],
        englishProficiency: [''],
        unavailableClasses: [[]],
        commitToBoth: [false]
      }),
      
      // Section 3: Experience & Background
      experienceBackground: this.fb.group({
        combatService: ['', Validators.required],
        militaryDraftDate: [''],
        militaryReleaseDate: [''],
        militaryServiceDescription: ['', [Validators.required, this.wordCountValidator(75)]],
        // Always required (1-2 files). All applicants must provide combat proof
        // — this is the program's hard intake requirement.
        proofOfCombatService: this.fb.array([], [Validators.required, Validators.minLength(1), Validators.maxLength(2)]),
        professionalExperience: ['', this.wordCountValidator(150)],
        hasProjectIdea: ['', Validators.required],
        projectIdea: this.fb.group({
          description: ['']
        })
      }),
      
      // Section 4: Program Goal (single multiple-choice question + a follow-up
      // "mindset" question that only applies when goal is (c) or (d). Mindset is
      // conditionally required — handled in isCurrentStepValid() / validators.
      programGoal: this.fb.group({
        goal: ['', Validators.required],
        mindset: ['']
      }),

      // Section 5: Short Answer
      shortAnswer: this.fb.group({
        failureDescription: ['', [Validators.required, this.wordCountValidator(200)]]
      }),

      // Section 6: Video Introduction
      videoIntroduction: this.fb.group({
        videoUrl: ['', Validators.required]
      }),

      // Section 7: Cover Letter
      coverLetter: this.fb.group({
        content: ['', this.wordCountValidator(300)]
      }),

      // Section 8: Friends (optional). Simplified from Operator-ID lookups to
      // plain email inputs — admins can match emails against the user pool.
      friends: this.fb.group({
        friend1Email: ['', Validators.email],
        friend2Email: ['', Validators.email]
      })
    });

    // Watch for changes in country of service
    this.applicationForm.get('serviceAvailability.countryOfService')?.valueChanges.subscribe(country => {
      const englishField = this.applicationForm.get('serviceAvailability.englishProficiency');
      if (country === 'IL') {
        englishField?.setValidators(Validators.required);
      } else {
        englishField?.clearValidators();
        englishField?.setValue('');
      }
      englishField?.updateValueAndValidity();
    });

    // Watch for changes in hasProjectIdea
    this.applicationForm.get('experienceBackground.hasProjectIdea')?.valueChanges.subscribe(hasIdea => {
      const projectIdeaGroup = this.applicationForm.get('experienceBackground.projectIdea') as FormGroup;
      if (hasIdea === 'Yes') {
        projectIdeaGroup?.get('description')?.setValidators([Validators.required, this.wordCountValidator(200)]);
      } else {
        projectIdeaGroup?.get('description')?.clearValidators();
        projectIdeaGroup?.get('description')?.setValue('');
      }
      projectIdeaGroup?.updateValueAndValidity();
    });

    // Clear the mindset answer when the goal moves away from a value that
    // requires it. Prevents stale data if the applicant changes their mind.
    this.applicationForm.get('programGoal.goal')?.valueChanges.subscribe(goal => {
      if (!PROGRAM_GOALS_REQUIRING_MINDSET.has(goal as ProgramGoalChoice)) {
        const mindset = this.applicationForm.get('programGoal.mindset');
        if (mindset?.value) mindset.setValue('');
      }
    });
  }

  private async loadCohortAndUserData() {
    try {
      const cohortId = this.route.snapshot.queryParamMap.get('cohort');
      if (!cohortId) {
        this.router.navigate(['/dashboard']);
        return;
      }

      const [cohort, userData] = await Promise.all([
        this.cohortService.getCohort(cohortId),
        this.userService.getUserData(this.authService.currentUser()?.uid || '')
      ]);

      if (!cohort) {
        this.error.set('Cohort not found');
        return;
      }

      this.cohort.set(cohort);

      // Pre-populate user data
      if (userData) {
        this.applicationForm.patchValue({
          personalInformation: {
            studentId: userData.operatorId,
            firstName: userData.firstName || '', 
            lastName: userData.lastName || '', 
            telephone: userData.phone || '',
            email: userData.email
          }
        });
      }

    } catch (error) {
      console.error('Error loading data:', error);
      this.error.set('Failed to load application data');
    }
  }

  // Custom validator for word count
  private wordCountValidator(maxWords: number) {
    return (control: any) => {
      if (!control.value) return null;
      
      const wordCount = control.value.trim().split(/\s+/).filter((word: string) => word.length > 0).length;
      if (wordCount > maxWords) {
        return { wordCount: { actual: wordCount, max: maxWords } };
      }
      return null;
    };
  }

  // Navigation methods
  nextStep() {
    if (this.currentStep() < this.totalSteps) {
      this.currentStep.update(step => step + 1);
    }
  }

  prevStep() {
    if (this.currentStep() > 1) {
      this.currentStep.update(step => step - 1);
    }
  }

  goToStep(step: number) {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep.set(step);
    }
  }

  // Validation for current step
  isCurrentStepValid(): boolean {
    switch (this.currentStep()) {
      case 1:
        return this.applicationForm.get('personalInformation')?.valid || false;
      case 2:
        // Check country selection and validate unavailable classes have reasons
        const serviceGroup = this.applicationForm.get('serviceAvailability');
        const unavailableClasses = serviceGroup?.get('unavailableClasses')?.value || [];
        const hasEmptyReasons = unavailableClasses.some((item: any) => item.reason.trim() === '');
        const hasOverLimitReasons = unavailableClasses.some((item: any) => this.getWordCount(item.reason) > 80);
        return (serviceGroup?.get('countryOfService')?.valid || false) && !hasEmptyReasons && !hasOverLimitReasons;
      case 3:
        // proofOfCombatService now has Validators.required + minLength(1) on
        // the FormArray, so the standard formGroup.valid check is sufficient.
        return this.applicationForm.get('experienceBackground')?.valid || false;
      case 4: {
        const pg = this.applicationForm.get('programGoal');
        const baseValid = pg?.valid || false;
        // Mindset is conditionally required when goal is (c) or (d). The
        // FormControl itself has no required validator (the requirement is
        // sibling-dependent), so re-check it explicitly here.
        const mindsetMissing = this.requiresMindset()
          && !pg?.get('mindset')?.value;
        return baseValid && !mindsetMissing;
      }
      case 5:
        return this.applicationForm.get('shortAnswer')?.valid || false;
      case 6:
        return this.applicationForm.get('videoIntroduction')?.valid || false;
      case 7:
        return this.applicationForm.get('coverLetter')?.valid || false;
      case 8:
        return true; // Friends section is optional
      default:
        return false;
    }
  }

  // Get word count for text areas
  getWordCount(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }


  // Check if class is unavailable
  isClassUnavailable(classId: string): boolean {
    const unavailableClasses = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    return unavailableClasses.some((item: any) => item.classId === classId);
  }

  // Get unavailability reason for a class
  getUnavailabilityReason(classId: string): string {
    const unavailableClasses = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    const item = unavailableClasses.find((item: any) => item.classId === classId);
    return item?.reason || '';
  }

  // Set unavailability reason for a class
  setUnavailabilityReason(classId: string, event: any) {
    const reason = event.target.value;
    const unavailableClasses = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    const itemIndex = unavailableClasses.findIndex((item: any) => item.classId === classId);
    
    if (itemIndex > -1) {
      unavailableClasses[itemIndex].reason = reason;
      this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue(unavailableClasses);
    }
  }

  // Commit to both classes functionality
  canCommitToBoth(): boolean {
    return this.applicationForm.get('serviceAvailability.commitToBoth')?.value || false;
  }

  /** Label shown on the "commit" option, pluralized based on the cohort's class count.
   *  - 0/1 classes → "I can commit to the class" (singular)
   *  - 2 classes   → "I can commit to both classes"
   *  - 3+ classes  → "I can commit to all classes"
   *  Used both in the template and in the related validator error message so
   *  the on-screen wording and the error stay in sync. */
  commitOptionLabel(): string {
    const count = this.cohort()?.classes?.length ?? 0;
    if (count <= 1) return 'I can commit to the class';
    if (count === 2) return 'I can commit to both classes';
    return 'I can commit to all classes';
  }

  // ── Single-class cohort UX ─────────────────────────────────────────────────
  // For cohorts with exactly one class, the multi-class checkbox+reason flow
  // collapses into two clean toggles: "I can commit" / "I cannot commit + why".
  // Helpers below drive that branch in the template.

  isSingleClassCohort(): boolean {
    return (this.cohort()?.classes?.length ?? 0) === 1;
  }

  /** True iff the user has selected the "I cannot commit" option for the only class. */
  singleClassDeclined(): boolean {
    if (!this.isSingleClassCohort()) return false;
    if (this.canCommitToBoth()) return false;
    const onlyClassId = this.cohort()!.classes[0].classId;
    const unavailable = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    return unavailable.some((item: any) => item.classId === onlyClassId);
  }

  /** Choose the "I can commit to this class" option in the single-class flow. */
  singleClassCommit() {
    this.applicationForm.get('serviceAvailability.commitToBoth')?.setValue(true);
    this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue([]);
  }

  /** Choose the "I cannot commit to this class" option in the single-class flow.
   *  Preserves any reason already typed in case the user toggles back and forth. */
  singleClassDecline() {
    if (!this.isSingleClassCohort()) return;
    const onlyClassId = this.cohort()!.classes[0].classId;
    const existing = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    const prev = existing.find((item: any) => item.classId === onlyClassId);
    this.applicationForm.get('serviceAvailability.commitToBoth')?.setValue(false);
    this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue([
      { classId: onlyClassId, reason: prev?.reason ?? '' }
    ]);
  }

  toggleCommitToBoth() {
    const currentValue = this.canCommitToBoth();
    this.applicationForm.get('serviceAvailability.commitToBoth')?.setValue(!currentValue);
    
    // If committing to both, clear any unavailable classes
    if (!currentValue) {
      this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue([]);
    }
  }

  // Override toggleClassUnavailability to prevent selection when commitToBoth is true
  toggleClassUnavailability(classId: string) {
    // Prevent individual class selection if committed to both
    if (this.canCommitToBoth()) {
      return;
    }
    
    const unavailableClasses = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    const existingIndex = unavailableClasses.findIndex((item: any) => item.classId === classId);
    
    if (existingIndex > -1) {
      unavailableClasses.splice(existingIndex, 1);
    } else {
      unavailableClasses.push({ classId, reason: '' });
      // Clear commitToBoth if selecting individual classes
      this.applicationForm.get('serviceAvailability.commitToBoth')?.setValue(false);
    }
    
    this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue(unavailableClasses);
  }

  // Show validation issues popup
  showValidationIssues() {
    const errors = this.getValidationErrors();
    this.validationErrors.set(errors);
    this.showValidationPopup.set(true);
  }

  // Submit application
  async submitApplication() {
    if (!this.applicationForm.valid) {
      this.error.set('Please fix all validation errors before submitting.');
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);
    
    try {
      const formData: ApplicationFormData = this.applicationForm.value;

      // Friend emails are validated by Validators.email on the form controls;
      // no extra format check needed here.

      const request: CreateApplicationRequest = {
        cohortId: this.cohort()!.cohortId,
        formData
      };

      await this.applicationService.createApplication(
        this.authService.currentUser()!.uid,
        request
      );

      // Navigate immediately to dashboard
      this.router.navigate(['/dashboard']);

    } catch (error: any) {
      this.error.set(error.message || 'Failed to submit application');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Helper methods for UI
  /** True iff the currently-selected Program Goal triggers the mindset follow-up.
   *  Used by the template to conditionally render the second radio group on Step 4
   *  and by the validators to make mindset conditionally required. */
  requiresMindset(): boolean {
    const goal = this.applicationForm.get('programGoal.goal')?.value as ProgramGoalChoice;
    return PROGRAM_GOALS_REQUIRING_MINDSET.has(goal);
  }

  getStepTitle(step: number): string {
    const titles = [
      'Personal Information',
      'Service & Availability',
      'Experience & Background',
      'Program Goal',
      'Short Answer',
      'Video Introduction',
      'Cover Letter',
      'Friends (Optional)'
    ];
    return titles[step - 1] || '';
  }

  formatClassSchedule(cohortClass: CohortClass): string {
    return cohortClass.weeklySchedule
      .map(schedule => this.formatScheduleWithTimezones(schedule.day, schedule.startTime, schedule.endTime))
      .join('\n\n');
  }

  formatLabSchedule(lab: any): string {
    return lab.weeklySchedule
      .map((schedule: any) => this.formatScheduleWithTimezones(schedule.day, schedule.startTime, schedule.endTime))
      .join('\n\n');
  }

  // Format schedule entry in user's local timezone
  formatScheduleWithTimezones(day: string, startTime: string, endTime: string): string {
    // Times are now stored as UTC, convert to user's local time
    const localStartTime = this.convertUTCTimeToLocal(startTime);
    const localEndTime = this.convertUTCTimeToLocal(endTime);
    
    return `${day}\n${localStartTime} - ${localEndTime} (your local time)`;
  }

  // Convert UTC time string to user's local time
  private convertUTCTimeToLocal(utcTimeStr: string): string {
    // Create a reference date (today) with the UTC time
    const today = new Date();
    const [hours, minutes] = utcTimeStr.split(':').map(Number);
    
    // Create UTC date
    const utcDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes));
    
    // Convert to user's local timezone
    const localTime = utcDate.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    return localTime;
  }


  // File upload handling — path-driven so the same helpers can serve any
  // upload field. Default points at the only currently-used path.
  async onFileSelected(event: any, fieldPath: string = 'experienceBackground.proofOfCombatService') {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const arr = this.applicationForm.get(fieldPath) as FormArray | null;
    if (!arr) return;

    // Check if we're at the limit for this field
    if (arr.length >= 2) {
      this.error.set('Maximum 2 files allowed');
      return;
    }

    for (let i = 0; i < Math.min(files.length, 2 - arr.length); i++) {
      const file = files[i];

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        this.error.set(`File ${file.name} is too large. Maximum 5MB per file.`);
        continue;
      }

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        this.error.set(`File ${file.name} is not supported. Only PDF, JPG, JPEG, and PNG files are allowed.`);
        continue;
      }

      try {
        this.isLoading.set(true);

        // Upload to Firebase Storage. Subfolder reflects which field this is for
        // so combat-proof and service-proof don't clobber each other in storage.
        const timestamp = Date.now();
        const userId = this.authService.currentUser()?.uid;
        const fileName = `${timestamp}_${file.name}`;
        const subfolder = fieldPath.endsWith('proofOfCombatService')
          ? 'proofs-of-combat-service'
          : 'proofs-of-service';
        const filePath = `${subfolder}/${userId}/${fileName}`;

        // Create storage reference and upload
        const storageRef = ref(this.firebaseService.storage, filePath);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // Add to form array
        arr.push(this.fb.group({
          fileUrl: downloadURL,
          fileName: file.name
        }));

        this.success.set(`File ${file.name} uploaded successfully!`);
        setTimeout(() => this.success.set(null), 3000);

      } catch (error) {
        console.error('Error uploading file:', error);
        this.error.set(`Failed to upload ${file.name}. Please try again.`);
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  // Get proof of combat service FormArray (the only upload field on this form)
  getProofOfCombatServiceArray(): FormArray {
    return this.applicationForm.get('experienceBackground.proofOfCombatService') as FormArray;
  }

  // Remove file from a given upload field's array
  removeFile(index: number, fieldPath: string = 'experienceBackground.proofOfCombatService') {
    const arr = this.applicationForm.get(fieldPath) as FormArray | null;
    arr?.removeAt(index);
  }

  // Check if we can add more files to a given upload field's array
  canAddMoreFiles(fieldPath: string = 'experienceBackground.proofOfCombatService'): boolean {
    const arr = this.applicationForm.get(fieldPath) as FormArray | null;
    return (arr?.length ?? 0) < 2;
  }

  // Get detailed validation errors
  getValidationErrors(): string {
    const errors: string[] = [];
    
    // Check each section
    const personalInfo = this.applicationForm.get('personalInformation');
    if (personalInfo?.invalid) {
      if (personalInfo.get('firstName')?.hasError('required')) {
        errors.push('• First Name is required');
      }
      if (personalInfo.get('lastName')?.hasError('required')) {
        errors.push('• Last Name is required');
      }
      if (personalInfo.get('email')?.hasError('required')) {
        errors.push('• Email is required');
      }
      if (personalInfo.get('email')?.hasError('email')) {
        errors.push('• Please enter a valid email address');
      }
    }

    const serviceAvail = this.applicationForm.get('serviceAvailability');
    if (serviceAvail?.invalid) {
      if (serviceAvail.get('countryOfService')?.hasError('required')) {
        errors.push('• Country of Service is required');
      }
      if (serviceAvail.get('englishProficiency')?.hasError('required')) {
        errors.push('• English Proficiency is required for IL service');
      }
      
      // Check class availability selection
      const unavailableClasses = serviceAvail.get('unavailableClasses')?.value || [];
      const commitToBoth = serviceAvail.get('commitToBoth')?.value || false;
      const totalClasses = this.cohort()?.classes?.length || 0;
      
      // Validate that user has made a clear choice
      if (totalClasses === 1) {
        // Single-class cohort: must explicitly pick "I can commit" or
        // "I cannot commit". Both are valid endings; only "no choice" fails here.
        // The empty-reason check below will catch "decline but didn't explain".
        if (!commitToBoth && unavailableClasses.length === 0) {
          errors.push('• Please indicate whether you can commit to the class.');
        }
      } else if (!commitToBoth && unavailableClasses.length === totalClasses) {
        // Multi-class: marking every class unavailable without picking
        // "commit-to-all" is contradictory.
        errors.push(`• You cannot mark all classes as unavailable. Either select classes you can attend or choose "${this.commitOptionLabel()}"`);
      }
      
      // Check unavailable classes reasons
      const hasEmptyReasons = unavailableClasses.some((item: any) => !item.reason || item.reason.trim() === '');
      if (hasEmptyReasons) {
        errors.push('• Please provide reasons for all unavailable classes');
      }
      const hasOverLimitReasons = unavailableClasses.some((item: any) => this.getWordCount(item.reason) > 80);
      if (hasOverLimitReasons) {
        errors.push('• Unavailability reasons must be 80 words or less');
      }
    }

    const experience = this.applicationForm.get('experienceBackground');
    if (experience?.invalid) {
      if (experience.get('combatService')?.hasError('required')) {
        errors.push('• Combat Service selection is required');
      }
      if (experience.get('militaryServiceDescription')?.hasError('required')) {
        errors.push('• Military Service Description is required');
      }
      if (experience.get('militaryServiceDescription')?.hasError('wordCount')) {
        const error = experience.get('militaryServiceDescription')?.errors?.['wordCount'];
        errors.push(`• Military Service Description must be ${error.max} words or less (currently ${error.actual} words)`);
      }
      if (experience.get('proofOfCombatService')?.hasError('required')) {
        errors.push('• Proof of Combat Service documents are required (1-2 files)');
      }
      if (experience.get('hasProjectIdea')?.hasError('required')) {
        errors.push('• Please specify if you have a project idea');
      }

      // Check project idea description if "Yes" was selected
      const hasProjectIdea = experience.get('hasProjectIdea')?.value;
      if (hasProjectIdea === 'Yes') {
        const projectDesc = experience.get('projectIdea.description');
        if (projectDesc?.hasError('required')) {
          errors.push('• Project idea description is required when you have a project idea');
        }
        if (projectDesc?.hasError('wordCount')) {
          const error = projectDesc?.errors?.['wordCount'];
          errors.push(`• Project idea description must be ${error.max} words or less (currently ${error.actual} words)`);
        }
      }

      // Check professional experience word count
      if (experience.get('professionalExperience')?.hasError('wordCount')) {
        const error = experience.get('professionalExperience')?.errors?.['wordCount'];
        errors.push(`• Professional Experience must be ${error.max} words or less (currently ${error.actual} words)`);
      }
    }

    const programGoal = this.applicationForm.get('programGoal');
    if (programGoal?.get('goal')?.hasError('required')) {
      errors.push('• Please select your goal in this program');
    }
    // Mindset is conditionally required (only when goal is c or d).
    if (this.requiresMindset() && !programGoal?.get('mindset')?.value) {
      errors.push('• Please select the mindset that best describes you');
    }

    const shortAnswer = this.applicationForm.get('shortAnswer');
    if (shortAnswer?.invalid) {
      if (shortAnswer.get('failureDescription')?.hasError('required')) {
        errors.push('• Failure description is required');
      }
      if (shortAnswer.get('failureDescription')?.hasError('wordCount')) {
        const error = shortAnswer.get('failureDescription')?.errors?.['wordCount'];
        errors.push(`• Failure description must be ${error.max} words or less (currently ${error.actual} words)`);
      }
    }

    const video = this.applicationForm.get('videoIntroduction');
    if (video?.invalid) {
      if (video.get('videoUrl')?.hasError('required')) {
        errors.push('• Video Introduction URL is required');
      }
    }

    const coverLetter = this.applicationForm.get('coverLetter');
    if (coverLetter?.get('content')?.hasError('wordCount')) {
      const error = coverLetter.get('content')?.errors?.['wordCount'];
      errors.push(`• Additional Information must be ${error.max} words or less (currently ${error.actual} words)`);
    }

    if (errors.length === 0) {
      return 'Please check all required fields';
    }

    return `Please fix the following issues:\n\n${errors.join('\n')}`;
  }

  // Get validation issues as structured list for better UI
  getValidationIssuesList(): Array<{step: number, title: string, description: string, icon: string}> {
    const issues: Array<{step: number, title: string, description: string, icon: string}> = [];
    
    // Check Personal Information (Step 1)
    const personalInfo = this.applicationForm.get('personalInformation');
    if (personalInfo?.invalid) {
      let personalIssues: string[] = [];
      if (personalInfo.get('firstName')?.hasError('required')) personalIssues.push('First Name');
      if (personalInfo.get('lastName')?.hasError('required')) personalIssues.push('Last Name');
      if (personalInfo.get('email')?.hasError('required')) personalIssues.push('Email');
      if (personalInfo.get('email')?.hasError('email')) personalIssues.push('Valid Email Address');
      
      if (personalIssues.length > 0) {
        issues.push({
          step: 1,
          title: 'Personal Information',
          description: `Missing: ${personalIssues.join(', ')}`,
          icon: 'fas fa-user-circle'
        });
      }
    }

    // Check Service & Availability (Step 2)
    const serviceAvail = this.applicationForm.get('serviceAvailability');
    if (serviceAvail?.invalid) {
      let serviceIssues: string[] = [];
      if (serviceAvail.get('countryOfService')?.hasError('required')) serviceIssues.push('Country of Service');
      if (serviceAvail.get('englishProficiency')?.hasError('required')) serviceIssues.push('English Proficiency');
      
      const unavailableClasses = serviceAvail.get('unavailableClasses')?.value || [];
      const hasEmptyReasons = unavailableClasses.some((item: any) => !item.reason || item.reason.trim() === '');
      if (hasEmptyReasons) serviceIssues.push('Unavailable class reasons');
      
      const hasOverLimitReasons = unavailableClasses.some((item: any) => this.getWordCount(item.reason) > 80);
      if (hasOverLimitReasons) serviceIssues.push('Reason length (80 words max)');
      
      if (serviceIssues.length > 0) {
        issues.push({
          step: 2,
          title: 'Service & Availability',
          description: `Missing: ${serviceIssues.join(', ')}`,
          icon: 'fas fa-globe'
        });
      }
    }

    // Check Experience & Background (Step 3)
    const experience = this.applicationForm.get('experienceBackground');
    let expIssues: string[] = [];
    if (experience?.invalid) {
      if (experience.get('combatService')?.hasError('required')) expIssues.push('Combat Service');
      if (experience.get('militaryServiceDescription')?.hasError('required')) expIssues.push('Military Description');
      if (experience.get('militaryServiceDescription')?.hasError('wordCount')) expIssues.push('Military Description (75 words max)');
      if (experience.get('proofOfCombatService')?.hasError('required')) expIssues.push('Proof of Combat Service Files');
      if (experience.get('hasProjectIdea')?.hasError('required')) expIssues.push('Project Idea Selection');

      // Check project idea if "Yes" was selected
      const hasProjectIdea = experience.get('hasProjectIdea')?.value;
      if (hasProjectIdea === 'Yes') {
        const projectDesc = experience.get('projectIdea.description');
        if (projectDesc?.hasError('required')) expIssues.push('Project Description');
        if (projectDesc?.hasError('wordCount')) expIssues.push('Project Description (200 words max)');
      }

      if (experience.get('professionalExperience')?.hasError('wordCount')) {
        expIssues.push('Professional Experience (150 words max)');
      }
    }
    if (expIssues.length > 0) {
      issues.push({
        step: 3,
        title: 'Experience & Background',
        description: `Issues: ${expIssues.join(', ')}`,
        icon: 'fas fa-briefcase'
      });
    }

    // Check Program Goal (Step 4)
    const programGoal = this.applicationForm.get('programGoal');
    const goalIssues: string[] = [];
    if (programGoal?.get('goal')?.hasError('required')) goalIssues.push('Goal selection');
    if (this.requiresMindset() && !programGoal?.get('mindset')?.value) goalIssues.push('Mindset selection');
    if (goalIssues.length > 0) {
      issues.push({
        step: 4,
        title: 'Program Goal',
        description: goalIssues.join(', '),
        icon: 'fas fa-bullseye'
      });
    }

    // Check Short Answer (Step 5)
    const shortAnswer = this.applicationForm.get('shortAnswer');
    if (shortAnswer?.invalid) {
      let shortIssues: string[] = [];
      if (shortAnswer.get('failureDescription')?.hasError('required')) {
        shortIssues.push('Failure description required');
      }
      if (shortAnswer.get('failureDescription')?.hasError('wordCount')) {
        shortIssues.push('Failure description (200 words max)');
      }

      if (shortIssues.length > 0) {
        issues.push({
          step: 5,
          title: 'Short Answer',
          description: shortIssues.join(', '),
          icon: 'fas fa-edit'
        });
      }
    }

    // Check Video Introduction (Step 6)
    const video = this.applicationForm.get('videoIntroduction');
    if (video?.invalid) {
      issues.push({
        step: 6,
        title: 'Video Introduction',
        description: 'Video URL is required',
        icon: 'fas fa-video'
      });
    }

    // Check Cover Letter (Step 7)
    const coverLetter = this.applicationForm.get('coverLetter');
    if (coverLetter?.get('content')?.hasError('wordCount')) {
      issues.push({
        step: 7,
        title: 'Cover Letter',
        description: 'Content exceeds 300 words',
        icon: 'fas fa-file-text'
      });
    }

    return issues;
  }

  // Navigate to specific step when clicking validation issue
  goToIssueStep(step: number) {
    this.goToStep(step);
    this.closeValidationPopup();
  }

  // Detect user's locale to determine date format preference
  private detectDateFormat() {
    const locale = navigator.language || 'en-US';
    
    // US/CA use MM/DD, most other English-speaking countries use DD/MM
    if (locale.startsWith('en-US') || locale.startsWith('en-CA')) {
      this.dateFormat.set('mm/dd');
    } else {
      this.dateFormat.set('dd/mm');
    }
  }

  // Get placeholder text for date inputs
  getDatePlaceholder(): string {
    return this.dateFormat() === 'mm/dd' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
  }

  // Drag and drop event handlers
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onFileDrop(event: DragEvent, fieldPath: string) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // Create a synthetic event for the existing file handler
      const syntheticEvent = {
        target: {
          files: files
        }
      };
      this.onFileSelected(syntheticEvent, fieldPath);
    }
  }

  // Validation popup methods
  closeValidationPopup() {
    this.showValidationPopup.set(false);
    this.validationErrors.set('');
  }

  goToFirstInvalidStep() {
    // Find the first invalid step and navigate to it
    for (let step = 1; step <= this.totalSteps; step++) {
      this.currentStep.set(step);
      if (!this.isCurrentStepValid()) {
        this.closeValidationPopup();
        return;
      }
    }
    
    // If no specific step is invalid, go to step 1
    this.currentStep.set(1);
    this.closeValidationPopup();
  }
}