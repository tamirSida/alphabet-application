import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, CohortService, ApplicationService, UserService } from '../../services';
import { Cohort, ApplicationFormData, CreateApplicationRequest, CohortClass } from '../../models';

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
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  cohort = signal<Cohort | null>(null);
  applicationForm!: FormGroup;
  
  // Progress computation
  progress = computed(() => (this.currentStep() / this.totalSteps) * 100);
  
  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cohortService: CohortService,
    private applicationService: ApplicationService,
    private userService: UserService,
    public router: Router,
    private route: ActivatedRoute
  ) {
    this.initializeForm();
  }

  async ngOnInit() {
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
        selectedClasses: [[], Validators.required]
      }),
      
      // Section 3: Experience & Background
      experienceBackground: this.fb.group({
        combatService: ['', Validators.required],
        militaryServiceDescription: ['', [Validators.required, this.wordCountValidator(75)]],
        professionalExperience: ['', this.wordCountValidator(150)],
        hasProjectIdea: ['', Validators.required],
        projectIdea: this.fb.group({
          problemStatement: [''],
          ideaSummary: [''],
          solutionApproach: [''],
          marketClients: ['']
        })
      }),
      
      // Section 4: Skills (1-5 scale)
      skills: this.fb.group({
        aiDailyUse: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        programming: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        marketingSales: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        management: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        graphicDesign: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
        other: this.fb.group({
          skill: [''],
          rating: [null, [Validators.min(1), Validators.max(5)]]
        })
      }),
      
      // Section 5: Personal Qualities (0-10 scale)
      personalQualities: this.fb.group({
        proactivePersonality: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        persistenceHandleDifficulties: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        performUnderStress: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        independence: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        teamwork: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        mentalFlexibility: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        passionForProjects: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        }),
        creativeThinking: this.fb.group({
          rating: [null, [Validators.required, Validators.min(0), Validators.max(10)]],
          example: ['', Validators.required]
        })
      }),
      
      // Section 6: Short Answer
      shortAnswer: this.fb.group({
        failureDescription: ['', [Validators.required, this.wordCountValidator(200)]]
      }),
      
      // Section 7: Cover Letter
      coverLetter: this.fb.group({
        content: ['', [Validators.required, this.wordCountValidator(300)]]
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
        Object.keys(projectIdeaGroup?.controls || {}).forEach(key => {
          projectIdeaGroup?.get(key)?.setValidators(Validators.required);
        });
      } else {
        Object.keys(projectIdeaGroup?.controls || {}).forEach(key => {
          projectIdeaGroup?.get(key)?.clearValidators();
          projectIdeaGroup?.get(key)?.setValue('');
        });
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
            firstName: '', 
            lastName: '', 
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
        return this.applicationForm.get('serviceAvailability')?.valid || false;
      case 3:
        return this.applicationForm.get('experienceBackground')?.valid || false;
      case 4:
        return this.applicationForm.get('skills')?.valid || false;
      case 5:
        return this.applicationForm.get('personalQualities')?.valid || false;
      case 6:
        return this.applicationForm.get('shortAnswer')?.valid || false;
      case 7:
        return this.applicationForm.get('coverLetter')?.valid || false;
      case 8:
        return this.applicationForm.get('videoIntroduction')?.valid || false;
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

  // Toggle class selection
  toggleClassSelection(classId: string) {
    const selectedClasses = this.applicationForm.get('serviceAvailability.selectedClasses')?.value || [];
    const index = selectedClasses.indexOf(classId);
    
    if (index > -1) {
      selectedClasses.splice(index, 1);
    } else {
      selectedClasses.push(classId);
    }
    
    this.applicationForm.get('serviceAvailability.selectedClasses')?.setValue(selectedClasses);
  }

  // Check if class is selected
  isClassSelected(classId: string): boolean {
    const selectedClasses = this.applicationForm.get('serviceAvailability.selectedClasses')?.value || [];
    return selectedClasses.includes(classId);
  }

  // Submit application
  async submitApplication() {
    if (!this.applicationForm.valid) {
      this.error.set('Please fill in all required fields');
      return;
    }

    this.isLoading.set(true);
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
      this.isLoading.set(false);
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
      'Cover Letter',
      'Video Introduction',
      'Friends (Optional)'
    ];
    return titles[step - 1] || '';
  }

  formatClassSchedule(cohortClass: CohortClass): string {
    return cohortClass.weeklySchedule
      .map(schedule => `${schedule.day} ${schedule.startTime}-${schedule.endTime}`)
      .join(', ');
  }

  // File upload handling
  async onFileSelected(event: any, field: string) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('File size must be less than 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      this.error.set('Only PDF, DOC, and DOCX files are allowed');
      return;
    }

    try {
      this.isLoading.set(true);
      
      // TODO: Upload to Firebase Storage
      // For now, we'll simulate the upload and store the file name
      const fileUrl = `uploads/${field}_${Date.now()}_${file.name}`;
      
      this.applicationForm.patchValue({
        [field]: {
          fileUrl: fileUrl,
          fileName: file.name
        }
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

  removeFile(field: string) {
    this.applicationForm.patchValue({
      [field]: {
        fileUrl: '',
        fileName: ''
      }
    });
  }
}