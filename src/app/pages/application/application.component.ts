import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, CohortService, ApplicationService, UserService, FirebaseService } from '../../services';
import { Cohort, ApplicationFormData, CreateApplicationRequest, CohortClass } from '../../models';
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
  totalSteps = 9;
  isLoading = signal(true);
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  cohort = signal<Cohort | null>(null);
  applicationForm!: FormGroup;
  
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
        unavailableClasses: [[]]
      }),
      
      // Section 3: Experience & Background
      experienceBackground: this.fb.group({
        combatService: ['', Validators.required],
        militaryDraftDate: [''],
        militaryReleaseDate: [''],
        militaryServiceDescription: ['', [Validators.required, this.wordCountValidator(75)]],
        proofOfService: this.fb.group({
          fileUrl: [''],
          fileName: ['']
        }),
        professionalExperience: ['', this.wordCountValidator(150)],
        hasProjectIdea: ['', Validators.required],
        projectIdea: this.fb.group({
          description: ['']
        })
      }),
      
      // Section 4: Skills (1-5 scale)
      skills: this.fb.group({
        aiDailyUse: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        programming: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        marketingSales: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        management: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        publicSpeaking: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        other: this.fb.group({
          skill: [''],
          rating: [null, [Validators.min(1), Validators.max(5)]]
        })
      }),
      
      // Section 5: Personal Qualities (0-10 scale)
      personalQualities: this.fb.group({
        proactivePersonality: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        persistenceHandleDifficulties: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        performUnderStress: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        independence: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        teamwork: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        mentalFlexibility: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        passionForProjects: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        }),
        creativeThinking: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', [Validators.required, this.wordCountValidator(100)]]
        })
      }),
      
      // Section 6: Short Answer
      shortAnswer: this.fb.group({
        failureDescription: ['', [Validators.required, this.wordCountValidator(200)]]
      }),
      
      // Section 7: Cover Letter
      coverLetter: this.fb.group({
        content: ['', this.wordCountValidator(300)]
      }),
      
      // Section 8: Video Introduction
      videoIntroduction: this.fb.group({
        videoUrl: ['', Validators.required]
      }),
      
      // Section 9: Friends (optional)
      friends: this.fb.group({
        friend1StudentId: [''],
        friend2StudentId: ['']
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
        return this.applicationForm.get('experienceBackground')?.valid || false;
      case 4:
        return this.applicationForm.get('skills')?.valid || false;
      case 5:
        return this.applicationForm.get('personalQualities')?.valid || false;
      case 6:
        return this.applicationForm.get('shortAnswer')?.valid || false;
      case 7:
        return this.applicationForm.get('videoIntroduction')?.valid || false;
      case 8:
        return this.applicationForm.get('coverLetter')?.valid || false;
      case 9:
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

  // Toggle class unavailability
  toggleClassUnavailability(classId: string) {
    const unavailableClasses = this.applicationForm.get('serviceAvailability.unavailableClasses')?.value || [];
    const existingIndex = unavailableClasses.findIndex((item: any) => item.classId === classId);
    
    if (existingIndex > -1) {
      unavailableClasses.splice(existingIndex, 1);
    } else {
      unavailableClasses.push({ classId, reason: '' });
    }
    
    this.applicationForm.get('serviceAvailability.unavailableClasses')?.setValue(unavailableClasses);
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

  // Submit application
  async submitApplication() {
    if (!this.applicationForm.valid) {
      this.error.set('Please fill in all required fields');
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);
    
    try {
      const formData: ApplicationFormData = this.applicationForm.value;
      
      const request: CreateApplicationRequest = {
        cohortId: this.cohort()!.cohortId,
        formData
      };

      await this.applicationService.createApplication(
        this.authService.currentUser()!.uid,
        request
      );

      this.success.set('Application submitted successfully! Redirecting to dashboard...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);

    } catch (error: any) {
      this.error.set(error.message || 'Failed to submit application');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Helper methods for UI
  getStepTitle(step: number): string {
    const titles = [
      'Personal Information',
      'Service & Availability', 
      'Experience & Background',
      'Skills Assessment',
      'Personal Qualities',
      'Short Answer',
      'Video Introduction',
      'Additional Information',
      'Friends (Optional)'
    ];
    return titles[step - 1] || '';
  }

  formatClassSchedule(cohortClass: CohortClass): string {
    return cohortClass.weeklySchedule
      .map(schedule => `${schedule.day} ${schedule.startTime}-${schedule.endTime}`)
      .join(', ');
  }

  formatLabSchedule(lab: any): string {
    return lab.weeklySchedule
      .map((schedule: any) => `${schedule.day} ${schedule.startTime}-${schedule.endTime}`)
      .join(', ');
  }

  // File upload handling
  async onFileSelected(event: any, fieldPath: string) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('File size must be less than 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.error.set('Only PDF, JPG, JPEG, and PNG files are allowed');
      return;
    }

    try {
      this.isLoading.set(true);
      
      // Upload to Firebase Storage
      const timestamp = Date.now();
      const userId = this.authService.currentUser()?.uid;
      const fileName = `${timestamp}_${file.name}`;
      const filePath = `proofs-of-service/${userId}/${fileName}`;
      
      // Create storage reference and upload
      const storageRef = ref(this.firebaseService.storage, filePath);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      // Update the nested form path
      const pathParts = fieldPath.split('.');
      const formGroup = this.applicationForm.get(pathParts.slice(0, -1).join('.'));
      formGroup?.patchValue({
        fileUrl: downloadURL,
        fileName: file.name
      });

      this.success.set('File uploaded successfully!');
      setTimeout(() => this.success.set(null), 3000);

    } catch (error) {
      console.error('Error uploading file:', error);
      this.error.set('Failed to upload file. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  removeFile(fieldPath: string) {
    const pathParts = fieldPath.split('.');
    const formGroup = this.applicationForm.get(pathParts.slice(0, -1).join('.'));
    formGroup?.patchValue({
      fileUrl: '',
      fileName: ''
    });
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
}