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
  
  // Friend validation
  friend1ValidationState = signal<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  friend2ValidationState = signal<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  friend1Name = signal<string>('');
  friend2Name = signal<string>('');
  
  // Drag and drop state
  isDragOver = signal(false);
  
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
        proofOfService: this.fb.array([], [Validators.required, Validators.minLength(1), Validators.maxLength(2)]),
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
      const validationErrors = this.getValidationErrors();
      this.error.set(validationErrors);
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);
    
    try {
      const formData: ApplicationFormData = this.applicationForm.value;
      
      // Validate friend IDs if provided
      const friendIds = [
        formData.friends?.friend1StudentId,
        formData.friends?.friend2StudentId
      ].filter(id => id && id.trim() !== '');

      if (friendIds.length > 0) {
        // Simple format validation - actual user existence will be checked by admin
        for (const friendId of friendIds) {
          if (friendId) {
            const formattedId = friendId.replace(/\D/g, '');
            if (formattedId.length !== 9) {
              this.error.set(`Invalid friend ID format: ${friendId}. Please use ####-###-### format.`);
              return;
            }
          }
        }
      }
      
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
      .map(schedule => this.formatScheduleWithTimezones(schedule.day, schedule.startTime, schedule.endTime))
      .join('\n\n');
  }

  formatLabSchedule(lab: any): string {
    return lab.weeklySchedule
      .map((schedule: any) => this.formatScheduleWithTimezones(schedule.day, schedule.startTime, schedule.endTime))
      .join('\n\n');
  }

  // Format a single schedule entry with all timezones
  formatScheduleWithTimezones(day: string, startTime: string, endTime: string): string {
    // Create dates for today with the given times (using IL timezone as base)
    const today = new Date().toISOString().split('T')[0];
    const startDate = this.createDateInILTimezone(today, startTime);
    const endDate = this.createDateInILTimezone(today, endTime);

    const ilStart = new Intl.DateTimeFormat('en-IL', {
      timeZone: 'Asia/Jerusalem',
      timeStyle: 'short'
    }).format(startDate);
    
    const ilEnd = new Intl.DateTimeFormat('en-IL', {
      timeZone: 'Asia/Jerusalem', 
      timeStyle: 'short'
    }).format(endDate);

    const ptStart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      timeStyle: 'short'
    }).format(startDate);
    
    const ptEnd = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      timeStyle: 'short'
    }).format(endDate);

    const etStart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeStyle: 'short'
    }).format(startDate);
    
    const etEnd = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeStyle: 'short'
    }).format(endDate);

    return `${day}\nIL: ${ilStart}-${ilEnd}\nPT: ${ptStart}-${ptEnd}\nET: ${etStart}-${etEnd}`;
  }

  // Create date in IL timezone
  private createDateInILTimezone(dateStr: string, timeStr: string): Date {
    // Create date assuming IL timezone
    const isoString = `${dateStr}T${timeStr}:00`;
    
    // Use a more accurate approach - create the date and interpret it as IL time
    const date = new Date(isoString);
    
    // Get what this time would be in IL timezone
    const ilFormatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Format the date as if it were in UTC, then parse as IL time
    const utcDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return new Date(utcDate.toISOString().replace('Z', '+02:00'));
  }

  // File upload handling
  async onFileSelected(event: any, fieldPath: string) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Check if we're at the limit for this field
    const proofArray = this.getProofOfServiceArray();
    if (proofArray.length >= 2) {
      this.error.set('Maximum 2 files allowed');
      return;
    }

    for (let i = 0; i < Math.min(files.length, 2 - proofArray.length); i++) {
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
        
        // Upload to Firebase Storage
        const timestamp = Date.now();
        const userId = this.authService.currentUser()?.uid;
        const fileName = `${timestamp}_${file.name}`;
        const filePath = `proofs-of-service/${userId}/${fileName}`;
        
        // Create storage reference and upload
        const storageRef = ref(this.firebaseService.storage, filePath);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Add to form array
        proofArray.push(this.fb.group({
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

  // Get proof of service FormArray
  getProofOfServiceArray(): FormArray {
    return this.applicationForm.get('experienceBackground.proofOfService') as FormArray;
  }

  // Remove file from array
  removeFile(index: number) {
    const proofArray = this.getProofOfServiceArray();
    proofArray.removeAt(index);
  }

  // Check if we can add more files
  canAddMoreFiles(): boolean {
    return this.getProofOfServiceArray().length < 2;
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
      
      // Check unavailable classes reasons
      const unavailableClasses = serviceAvail.get('unavailableClasses')?.value || [];
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
      if (experience.get('proofOfService')?.hasError('required')) {
        errors.push('• Proof of Military Service documents are required (1-2 files)');
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

    const skills = this.applicationForm.get('skills');
    if (skills?.invalid) {
      const skillNames = {
        aiDailyUse: 'AI Daily Use',
        programming: 'Programming',
        marketingSales: 'Product Marketing & Sales Experience',
        management: 'Leadership Experience',
        publicSpeaking: 'Public Speaking & Presentation Skills'
      };
      
      Object.entries(skillNames).forEach(([key, name]) => {
        const control = skills.get(key);
        if (control?.hasError('required')) {
          errors.push(`• ${name} rating is required`);
        }
        if (control?.hasError('min') || control?.hasError('max')) {
          errors.push(`• ${name} rating must be between 1 and 5`);
        }
      });

      // Check custom skill
      const otherSkill = skills.get('other');
      if (otherSkill?.get('skill')?.value && otherSkill?.get('rating')?.hasError('required')) {
        errors.push('• Please rate your custom skill');
      }
      if (otherSkill?.get('rating')?.hasError('min') || otherSkill?.get('rating')?.hasError('max')) {
        errors.push('• Custom skill rating must be between 1 and 5');
      }
    }

    const qualities = this.applicationForm.get('personalQualities');
    if (qualities?.invalid) {
      const qualityNames = {
        proactivePersonality: 'Proactive Personality',
        persistenceHandleDifficulties: 'Persistence & Handle Difficulties',
        performUnderStress: 'Perform Under Stress',
        independence: 'Independence',
        teamwork: 'Teamwork',
        mentalFlexibility: 'Mental Flexibility',
        passionForProjects: 'Passion for Projects',
        creativeThinking: 'Creative Thinking'
      };
      
      Object.entries(qualityNames).forEach(([key, name]) => {
        const qualityGroup = qualities.get(key);
        if (qualityGroup?.get('rating')?.hasError('required')) {
          errors.push(`• ${name} rating is required`);
        }
        if (qualityGroup?.get('rating')?.hasError('min') || qualityGroup?.get('rating')?.hasError('max')) {
          errors.push(`• ${name} rating must be between 0 and 10`);
        }
        if (qualityGroup?.get('example')?.hasError('required')) {
          errors.push(`• ${name} example is required`);
        }
        if (qualityGroup?.get('example')?.hasError('wordCount')) {
          const error = qualityGroup?.get('example')?.errors?.['wordCount'];
          errors.push(`• ${name} example must be ${error.max} words or less (currently ${error.actual} words)`);
        }
      });
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

  // Validate friend student ID and fetch name
  async validateFriendId(studentId: string, friendNumber: 1 | 2) {
    if (!studentId || studentId.length < 9) {
      this.resetFriendValidation(friendNumber);
      return;
    }

    // Extract digits only for database lookup
    const digitsOnly = studentId.replace(/\D/g, '');
    if (digitsOnly.length !== 9) {
      this.setFriendValidation(friendNumber, 'invalid', '');
      return;
    }

    // Set loading state
    this.setFriendValidation(friendNumber, 'loading', '');

    try {
      // Search for user by operator ID (using digits only)
      const user = await this.userService.getUserByOperatorId(digitsOnly);
      
      if (user) {
        // Show name if available, otherwise show email
        const displayName = (user.firstName && user.lastName) 
          ? `${user.firstName} ${user.lastName}`
          : user.email;
        this.setFriendValidation(friendNumber, 'valid', displayName);
      } else {
        this.setFriendValidation(friendNumber, 'invalid', '');
      }
    } catch (error) {
      console.error('Error validating friend ID:', error);
      this.setFriendValidation(friendNumber, 'invalid', '');
    }
  }

  private setFriendValidation(friendNumber: 1 | 2, state: 'idle' | 'loading' | 'valid' | 'invalid', name: string) {
    if (friendNumber === 1) {
      this.friend1ValidationState.set(state);
      this.friend1Name.set(name);
    } else {
      this.friend2ValidationState.set(state);
      this.friend2Name.set(name);
    }
  }

  private resetFriendValidation(friendNumber: 1 | 2) {
    this.setFriendValidation(friendNumber, 'idle', '');
  }

  // Format student ID as user types
  formatStudentId(event: any, friendNumber: 1 | 2) {
    const input = event.target;
    let value = input.value.replace(/\D/g, ''); // Remove non-digits
    
    // Add dashes: ####-###-###
    if (value.length >= 4) {
      value = value.substring(0, 4) + '-' + value.substring(4);
    }
    if (value.length >= 8) {
      value = value.substring(0, 8) + '-' + value.substring(8, 11);
    }
    
    input.value = value;
    
    // Update form control
    const controlName = friendNumber === 1 ? 'friend1StudentId' : 'friend2StudentId';
    this.applicationForm.get(`friends.${controlName}`)?.setValue(value);
    
    // Validate if complete
    if (value.length === 11) {
      this.validateFriendId(value, friendNumber);
    } else {
      this.resetFriendValidation(friendNumber);
    }
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
}