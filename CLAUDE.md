# Alphabet Program CRM System

## Project Overview
A comprehensive CRM system for managing applications to the Alphabet Program, built with Angular 20, Firebase, and TypeScript. The system handles user registration, application submissions, admin management, and cohort creation with a dark theme design language and mobile-first approach.

## Architecture

### Tech Stack
- **Frontend**: Angular 20 (Standalone Components)
- **Backend**: Firebase (Firestore + Auth)
- **Email Service**: Resend (via Netlify Functions)
- **Styling**: CSS with dark theme design language and mobile-first responsive design
- **Icons**: FontAwesome 6.4.0
- **Forms**: Angular Reactive Forms with validation
- **State Management**: Angular Signals

### Database Schema (Firestore)

#### Collections:
1. **users**
   - uid, userId (document ID from Firebase Auth)
   - email, phone? (optional), operatorId (9-digit unique)
   - role: 'applicant' | 'admin' 
   - isOperator: boolean
   - status: 'not_submitted' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | null (null for admins)
   - applicationId: string | null (bijective relationship)
   - createdAt: Date (with proper Firestore Timestamp conversion)

2. **cohorts**
   - cohortId (document ID)
   - number: string (e.g., "Cohort 1", "Cohort 2")
   - applicationStartDate, applicationEndDate: Date
   - cohortStartDate, cohortEndDate: Date
   - status: 'upcoming' | 'accepting_applications' | 'closed' | 'in_progress' | 'completed' (auto-calculated)
   - classes: CohortClass[] (array of class definitions with names and schedules)
   - scheduleLink: string (URL field for cohort schedule display)

3. **applications**
   - applicationId (document ID)
   - userId, cohortId, operatorId: string
   - status: 'submitted' | 'under_review' | 'accepted' | 'rejected'
   - submittedAt, reviewedAt?: Date
   - assignedClass?: string (class assignment for accepted applications)
   - formData: ApplicationFormData (comprehensive 9-section structure with commitToBoth option)
   - flags: ApplicationFlags (auto-calculated red flags for admin screening)
   - notes?: AdminNote (admin review notes with attribution and timestamps)

## Firebase Configuration
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyCXzGLe70l-vua2WhsPYV8tozYnnC-5xJc",
  authDomain: "alphabet-application-3fc08.firebaseapp.com",
  projectId: "alphabet-application-3fc08",
  storageBucket: "alphabet-application-3fc08.firebasestorage.app",
  messagingSenderId: "171008014108",
  appId: "1:171008014108:web:3cc0530a0db04354b16cd9"
};
```

## Project Structure
```
src/
├── app/
│   ├── models/           # TypeScript interfaces
│   │   ├── user.model.ts
│   │   ├── cohort.model.ts
│   │   ├── application.model.ts
│   │   └── index.ts
│   ├── services/         # Business logic services
│   │   ├── firebase.service.ts
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── cohort.service.ts
│   │   ├── application.service.ts
│   │   ├── message-template.service.ts
│   │   ├── email.service.ts
│   │   └── index.ts
│   ├── pages/            # Route components
│   │   ├── landing/      # ✅ Dark theme homepage
│   │   ├── auth/         # ✅ Dark theme auth
│   │   ├── dashboard/    # ✅ User dashboard
│   │   ├── application-form/  # ✅ Application form
│   │   ├── admin/        # ✅ Complete admin panel with CRM
│   │   └── super-admin/  # ✅ Admin setup (temporary)
│   ├── app.routes.ts     # Routing configuration
│   └── app.html          # ✅ Clean root template
└── environments/
    ├── environment.ts
    └── environment.prod.ts
```

## Key Features Implemented

### User Management
- Firebase Authentication integration with rollback protection
- 9-digit random operator ID generation
- Role-based access (applicant/admin)
- Status tracking throughout application lifecycle
- Admin creation with proper error handling
- Firestore Timestamp conversion for date fields

### Application System
- Cohort-based application periods
- Application period overlap prevention
- Status tracking: not_submitted → submitted → accepted/rejected
- Bijective user-application relationship

### Enhanced Admin Panel (Professional CRM)
- **Three-tab navigation**: Applications, Cohorts, Admin Management
- **Professional CRM Table Interface**: Replaced card view with comprehensive table layout
- **Advanced Search & Filtering**: Search by name/email/ID + filters for status/country/class
- **Class Assignment System**: Modal-based class selection with visual cards
- **Red Flag Detection**: Automatic flagging with inline indicators and visual highlighting
- **Smart Status Display**: Shows assigned class instead of generic "Accepted" status
- **Quick Actions**: Accept/reject toggles with class assignment workflow
- **Intelligent Scoring**: Automatic calculation of skills and personal qualities scores
- **Real-time Updates**: Live data refresh and comprehensive error handling

### UI/UX & Design System
- **Dark theme design language**: Consistent alpha-bet inspired color scheme
- **Mobile-first responsive design**: Works seamlessly on all devices
- **Clean, professional interface**: White content areas on dark backgrounds
- **Consistent button styling**: Semi-transparent nav buttons, white action buttons
- **FontAwesome icons** (no emojis)
- **Loading states and comprehensive error handling**
- **Form validation** with real-time feedback

## User Journey

### Public Users
1. **Landing Page**: Shows next cohort info or current application status
2. **Authentication**: Sign up/in with operator ID generation
3. **Dashboard**: View application status and available actions
4. **Application Form**: Submit application when periods are open

### Admin Users
1. **Admin Panel**: Full CRM interface with three-tab navigation
2. **Application Management**: View all applications, accept/reject with status updates
3. **Cohort Management**: Create new cohorts with comprehensive date management
4. **Admin Management**: Create additional admin users for system management

## Development Commands
```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Install dependencies
npm install
```

## Current Status
✅ **Complete Production-Ready System**:
- Core infrastructure and services with OOP architecture
- User authentication and registration with rollback protection
- Landing page with cohort information and dark theme
- User dashboard with dynamic status message templates
- Complete application form (9 comprehensive sections) with enhanced loading UI
- Professional admin CRM with advanced features and Gmail-style notes system
- Cohort management system with creation and tracking
- Admin management with user creation capabilities
- Auto-refresh system for real-time updates
- Results publication workflow with automated email notifications
- Professional email system with custom domain (application@alphabet.versionbravo.com)
- Application deletion functionality
- Mobile-responsive dark theme design
- Firestore security rules implementation
- Comprehensive error handling and validation
- Enhanced UX with vertical text layout and readable class names
- Advanced form validation with mobile-responsive popup interface

## CRM Features (Applications Management)

### Table Interface
- **Professional Layout**: Name, Email, ID, Country, Preferred Class, Assigned Class, Status, Date, Flags, Actions
- **Smart Status Display**: Shows assigned class (e.g., "Class A") instead of generic "Accepted"
- **Visual Red Flags**: Reddish background highlighting for applications with issues
- **Responsive Design**: Mobile-friendly table with proper overflow handling

### Search & Filtering System
- **Global Search**: Find by applicant name, email, or operator ID
- **Status Filter**: All, Submitted, Under Review, Accepted, Rejected
- **Country Filter**: All, US, IL
- **Class Filter**: Dynamically populated with available classes (A, B, C, etc.)
- **Real-time Results**: Instant filtering without page refresh

### Class Assignment Workflow
- **Modal Interface**: Beautiful card-based class selection (replaces primitive prompts)
- **Smart Class Detection**: Filters out auto-generated Firebase IDs, shows only clean names
- **Visual Feedback**: Current assignment highlighted, hover effects, animations
- **Mandatory Assignment**: Cannot accept applications without class selection
- **Easy Reassignment**: Click class button for quick reassignment

### Red Flag System
- **Automatic Detection**: English proficiency (IL + "No") and Combat service ("No")
- **Visual Indicators**: Red flag icons in table + inline with problematic fields
- **Row Highlighting**: Subtle red background for flagged applications
- **Detailed View**: Dedicated flags section with explanations

### Quick Actions
- **Toggle Workflow**: Accept ↔ Reject with visual state indicators
- **Smart Buttons**: "Accepted - Reassign Class" vs "Accept Application"
- **Unreject Capability**: Return rejected applications to submitted status
- **Class Management**: Quick reassignment from both table and detail views
- **Top Positioning**: Actions moved to top of detail view for immediate access

### Scoring System
- **Skills Assessment**: Automatic calculation (n/m format + percentage)
- **Personal Qualities**: Automatic calculation with examples display
- **Dynamic Calculation**: Includes custom skills if present
- **Visual Badges**: Score displays with professional styling

### Application Detail View
- **Comprehensive Display**: All 9 form sections with proper formatting
- **Quick Actions Section**: Prominently positioned at top with Notes functionality
- **Smart Status Info**: Shows current assignment and review dates
- **Professional Layout**: Organized sections with consistent styling
- **Vertical Text Layout**: Long-form text responses (military description, cover letter, personal qualities) displayed in full-width vertical cards for better readability
- **Mobile Optimized**: Responsive design for all screen sizes

### Results Publication & Email System
- **Private Review Mode**: Admins can accept/reject applications without applicants seeing changes
- **Bulk Publication**: Single "Publish Results & Send Emails" button updates dashboards and sends emails
- **Automated Email Notifications**: Professional HTML emails sent via Postmark with custom domain
- **Email Templates**: Acceptance and rejection emails with personalized content and class information
- **Progress Tracking**: Real-time email sending progress with visual indicators
- **Error Handling**: Comprehensive email delivery error reporting and retry logic
- **Custom Domain**: Emails sent from `application@alphabet.versionbravo.com` for professional branding
- **Prerequisite Validation**: Publishing only allowed when all applications are reviewed (accepted/rejected)
- **UX Feedback**: Loading states, animated success messages, and progress indicators

### Application Management
- **Delete Functionality**: Complete application removal with user status reset
- **Confirmation Dialogs**: Safety prompts showing applicant names before deletion
- **Status Reset**: Deleted applications reset user status to 'not_submitted'
- **Clean Cleanup**: Removes application document and unlinks from user account

### Auto-Refresh System
- **Real-time Updates**: Admin CRM polls for new applications every 30 seconds
- **Smart Notifications**: Success alerts when new applications are detected
- **Dashboard Refresh**: User dashboard auto-refreshes after application submission
- **Background Processing**: Silent polling with error handling for network issues
- **Resource Efficient**: Only runs when admin is viewing applications tab

### Message Template System
- **Dynamic Templates**: Personalized acceptance/rejection messages using text file templates
- **Variable Replacement**: Auto-fills applicant names, class details, schedules, and IDs
- **Professional Formatting**: Formatted message display with proper styling
- **Class Schedule Integration**: Pulls real class days/times from cohort data

### Admin Notes System (Gmail-style)
- **Floating Popup Window**: Gmail-inspired notes interface that floats above application view
- **Drag & Drop**: Moveable popup that can be repositioned anywhere on screen
- **Resizable Interface**: Window can be resized with minimum dimensions maintained
- **Admin Attribution**: Notes stamped with admin email address for accountability  
- **Timestamp Tracking**: Creation and update times displayed for audit trail
- **Collaborative Access**: All admins can view notes from any reviewer
- **Professional Styling**: Purple theme with window controls (minimize/close)
- **Non-blocking Workflow**: Take notes while browsing application without losing context

### UI/UX Enhancements
- **Enhanced Loading States**: Application submission now shows professional loading overlay with animations
- **Improved Form Layout**: Long text fields displayed vertically with proper spacing and background styling
- **Readable Class Names**: Preferred classes show "Class A, Class B" instead of Firebase document IDs
- **Publication Status**: Admin interface shows persistent indicator when results have been published to applicants
- **Professional Polish**: Consistent styling, hover effects, and visual feedback throughout
- **Advanced Form Validation**: Mobile-responsive validation popup with clickable issue navigation
- **Timezone Support**: Multi-timezone display (IL, Pacific, Eastern) for cohort schedules and deadlines

## Email System (Resend Integration)

### Configuration
- **Service**: Resend transactional email service via Netlify Functions
- **Domain**: `application.versionbravo.com` with DNS verification (SPF, DKIM, DMARC)
- **From Address**: `application@application.versionbravo.com`
- **Architecture**: Secure server-side API calls through Netlify Functions
- **Security**: API token stored securely in Netlify environment variables (not exposed in client code)

### Email Templates
- **Template Files**: External accepted.txt and rejected.txt files with variable replacement
- **Acceptance Email**: Plain HTML with class assignments, schedules, and next steps
- **Rejection Email**: Supportive messaging with constructive feedback and reapplication encouragement
- **Dynamic Content**: Personalized with user names, operator IDs, class details, and schedules
- **Simple Styling**: Plain HTML without complex CSS for maximum email client compatibility

### Delivery Features
- **Secure Architecture**: API key protected via Netlify Functions
- **Error Handling**: Comprehensive retry logic and detailed error reporting
- **Progress Tracking**: Real-time progress indicators during bulk email sending
- **Rate Limiting**: 300ms delay between emails to prevent API throttling
- **Professional Branding**: Custom verified domain for legitimate email delivery

### Integration Points
- **Publish Results**: Automatically triggers email sending when results are published
- **Admin Interface**: Shows email progress and delivery status
- **Error Management**: Failed emails are tracked and reported with specific error messages

🚧 **Future Enhancements**:
- Route guards for enhanced security
- Data export functionality (CSV/Excel)
- Advanced analytics and reporting
- Bulk operations for admin actions
- Class capacity management and waitlists
- Email delivery analytics and tracking

## Firebase Security Rules (Production)
Current rules located in `/rules.txt`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Admins can read/write all user documents (including creating new ones)
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      // Allow user creation during registration (when no auth user exists yet)
      allow create: if request.auth != null;
    }
    
    // Applications - users can only access their own
    match /applications/{applicationId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      // Admins can read/write all applications
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Cohorts - readable by all authenticated users, writable by admins only
    match /cohorts/{cohortId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## Best Practices Followed
- **Security**: Comprehensive Firestore rules, auth rollback protection, no secrets in code
- **Code Quality**: TypeScript strict mode, proper error handling, OOP architecture
- **UX**: Dark theme design system, loading states, comprehensive form validation, responsive design
- **Architecture**: Separation of concerns, reusable services, signal-based state management
- **Data Integrity**: Firestore Timestamp conversion, undefined value prevention, bijective relationships
- **Accessibility**: Semantic HTML, proper form labels, keyboard navigation support

## System Architecture Summary
This is a production-ready CRM system with comprehensive user management, application processing, admin capabilities, and professional email communications. The system integrates Angular 20 frontend with Firebase backend and Postmark email service to provide a complete solution. Key features include:

- **Complete Application Lifecycle**: From user registration to results notification via email
- **Professional Email System**: Resend integration with Netlify Functions and custom domain
- **Advanced Admin Interface**: CRM-style management with real-time updates and comprehensive filtering
- **Mobile-First Design**: Responsive dark theme interface optimized for all devices
- **Enterprise Security**: Comprehensive Firestore rules and authentication protection
- **Advanced UX Features**: Form validation, timezone support, progress tracking, and error handling

The system successfully handles the complete lifecycle from user registration through application submission, admin review, cohort management, and automated email notifications to applicants.

## Recent Updates
- **Schedule Links**: Added schedule link field to cohorts for external schedule references
- **Operator ID Terminology**: Updated client-facing language from "Student ID" to "Operator ID" 
- **Class Commitment Options**: Added "commit to both classes" option with mutual exclusivity logic
- **Admin Display Logic**: Changed from showing "preferred classes" to "can't commit to" classes
- **Email Template System**: Migrated from hardcoded templates to external accepted.txt/rejected.txt files in /public directory
- **Email Service Migration**: Moved from Postmark to Resend with secure Netlify Functions architecture  
- **Plain Email Styling**: Emails sent as plain text, dashboard renders with HTML formatting
- **UI Improvements**: Changed "Not Selected" to "Rejected", removed "Apply Again" functionality
- **Email Templates**: Updated with proper markdown formatting, PayPal links, and removed Application IDs