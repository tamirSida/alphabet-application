import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { UserService, AuthService, CohortService } from '../../services';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {
  isLogin = signal(true);
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  generatedOperatorId = signal<string | null>(null);
  selectedRegion = signal<'US' | 'IL'>('US');

  loginForm: FormGroup;
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private cohortService: CohortService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      region: ['US', [Validators.required]],
      phone: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    // Check query parameters to set initial mode
    this.route.queryParams.subscribe(params => {
      if (params['mode'] === 'register') {
        this.isLogin.set(false);
      } else if (params['mode'] === 'login') {
        this.isLogin.set(true);
      }
    });
  }

  toggleMode() {
    this.isLogin.update(val => !val);
    this.error.set(null);
    this.success.set(null);
    this.generatedOperatorId.set(null);
  }

  async onLogin() {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { email, password } = this.loginForm.value;
      await this.userService.signIn(email, password);
      
      // Wait for auth state to update
      setTimeout(async () => {
        await this.authService.refreshUserData();
        
        const userData = this.authService.userData();
        
        // If user data is null, the user document doesn't exist in Firestore
        if (!userData) {
          this.error.set('User account not found. Please contact an administrator.');
          return;
        }
        
        if (userData.role === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      }, 1000);

    } catch (error: any) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) return;

    const { password, confirmPassword } = this.registerForm.value;
    if (password !== confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    // Validate phone format
    if (!this.isValidPhoneFormat(this.registerForm.value.phone, this.registerForm.value.region)) {
      this.error.set('Please enter a valid phone number for the selected region');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const { firstName, lastName, email, phone, password, region } = this.registerForm.value;
      const internationalPhone = this.convertToInternationalFormat(phone, region);
      const user = await this.userService.createUser({ firstName, lastName, email, phone: internationalPhone, password });
      
      this.generatedOperatorId.set(user.operatorId);
      this.success.set('Account created successfully! Please save your Operator ID.');
      
      // Auto redirect after showing operator ID
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 3000);

    } catch (error: any) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'Email address is already registered';
      case 'auth/weak-password':
        return 'Password is too weak';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later';
      default:
        return error.message || 'An error occurred. Please try again.';
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  onRegionChange(region: 'US' | 'IL') {
    this.selectedRegion.set(region);
    this.registerForm.get('region')?.setValue(region);
    
    // Clear phone field when region changes
    this.registerForm.get('phone')?.setValue('');
  }

  formatPhoneInput(event: any) {
    const input = event.target;
    const value = input.value.replace(/\D/g, ''); // Remove non-digits
    const region = this.registerForm.get('region')?.value;
    
    if (region === 'US') {
      // US format: (XXX) XXX-XXXX
      if (value.length >= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
      } else if (value.length >= 3) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else {
        input.value = value;
      }
    } else if (region === 'IL') {
      // IL format: XXX-XXX-XXXX or XX-XXX-XXXX
      if (value.length >= 7) {
        if (value.startsWith('05')) {
          // Mobile: 05X-XXX-XXXX
          input.value = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6, 10)}`;
        } else {
          // Landline: XX-XXX-XXXX
          input.value = `${value.slice(0, 2)}-${value.slice(2, 5)}-${value.slice(5, 9)}`;
        }
      } else if (value.length >= 3) {
        input.value = `${value.slice(0, 3)}-${value.slice(3)}`;
      } else {
        input.value = value;
      }
    }
    
    // Update form control with formatted value
    this.registerForm.get('phone')?.setValue(input.value);
  }

  isValidPhoneFormat(phone: string, region: string): boolean {
    if (!phone || !region) return false;
    
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (region === 'US') {
      // US: 10 digits
      return cleanPhone.length === 10;
    } else if (region === 'IL') {
      // IL: 9-10 digits (mobile 05X-XXX-XXXX = 10, landline XX-XXX-XXXX = 8-9)
      return cleanPhone.length >= 8 && cleanPhone.length <= 10;
    }
    
    return false;
  }

  getPhonePlaceholder(): string {
    const region = this.registerForm.get('region')?.value;
    
    if (region === 'US') {
      return '(555) 123-4567';
    } else if (region === 'IL') {
      return '050-123-4567';
    }
    
    return 'Enter your phone number';
  }

  convertToInternationalFormat(phone: string, region: string): string {
    const cleanPhone = phone.replace(/\D/g, ''); // Remove all non-digits
    
    if (region === 'US') {
      // US: +1-XXX-XXX-XXXX
      return `+1-${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6, 10)}`;
    } else if (region === 'IL') {
      // IL: +972-XX-XXX-XXXX
      let formattedPhone = cleanPhone;
      
      // Remove leading 0 if present (Israeli numbers often start with 0)
      if (formattedPhone.startsWith('0')) {
        formattedPhone = formattedPhone.slice(1);
      }
      
      // Format based on length
      if (formattedPhone.length === 9) {
        // Mobile: +972-5X-XXX-XXXX (052 becomes 52)
        return `+972-${formattedPhone.slice(0, 2)}-${formattedPhone.slice(2, 5)}-${formattedPhone.slice(5, 9)}`;
      } else if (formattedPhone.length === 8) {
        // Landline: +972-X-XXX-XXXX
        return `+972-${formattedPhone.slice(0, 1)}-${formattedPhone.slice(1, 4)}-${formattedPhone.slice(4, 8)}`;
      } else if (formattedPhone.length === 7) {
        // Short landline: +972-X-XXX-XXX
        return `+972-${formattedPhone.slice(0, 1)}-${formattedPhone.slice(1, 4)}-${formattedPhone.slice(4, 7)}`;
      }
    }
    
    return phone; // Fallback to original if no format matches
  }
}