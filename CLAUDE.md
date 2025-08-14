# Alphabet Program CRM System

## Project Overview
A comprehensive CRM system for managing applications to the Alphabet Program, built with Angular 20, Firebase, and TypeScript. The system handles user registration, application submissions, and admin management with a mobile-first approach.

## Architecture

### Tech Stack
- **Frontend**: Angular 20 (Standalone Components)
- **Backend**: Firebase (Firestore + Auth)
- **Styling**: CSS with mobile-first responsive design
- **Icons**: FontAwesome 6.4.0
- **Forms**: Angular Reactive Forms

### Database Schema (Firestore)

#### Collections:
1. **users**
   - uid (document ID from Firebase Auth)
   - email, phone?, operatorId (9-digit unique)
   - role: 'applicant' | 'admin' 
   - isOperator: boolean
   - status: 'not_submitted' | 'submitted' | 'accepted' | 'rejected' | null (null for admins)
   - applicationId: string | null (bijective relationship)
   - createdAt: Date

2. **cohorts**
   - cohortId (document ID)
   - number: string (#001, #002, etc.)
   - applicationStartDate, applicationEndDate: Date
   - cohortStartDate, cohortEndDate: Date
   - status: 'upcoming' | 'accepting_applications' | 'closed' | 'in_progress' | 'completed'

3. **applications**
   - applicationId (document ID)
   - userId, cohortId, operatorId: string
   - status: 'submitted' | 'under_review' | 'accepted' | 'rejected'
   - submittedAt, reviewedAt?: Date
   - formData: ApplicationFormData (placeholder structure)

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
│   │   └── index.ts
│   ├── pages/            # Route components
│   │   ├── landing/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── application-form/
│   │   ├── admin/ (pending)
│   │   └── super-admin/ (pending)
│   ├── app.routes.ts     # Routing configuration
│   └── ...
└── environments/
    ├── environment.ts
    └── environment.prod.ts
```

## Key Features Implemented

### User Management
- Firebase Authentication integration
- 9-digit random operator ID generation
- Role-based access (applicant/admin)
- Status tracking throughout application lifecycle

### Application System
- Cohort-based application periods
- Application period overlap prevention
- Status tracking: not_submitted → submitted → accepted/rejected
- Bijective user-application relationship

### UI/UX
- Mobile-first responsive design
- Clean, professional interface
- FontAwesome icons (no emojis)
- Gradient backgrounds and modern styling
- Loading states and error handling

## User Journey

### Public Users
1. **Landing Page**: Shows next cohort info or current application status
2. **Authentication**: Sign up/in with operator ID generation
3. **Dashboard**: View application status and available actions
4. **Application Form**: Submit application when periods are open

### Admin Users (To be implemented)
1. **Admin Panel**: CRM-like view of all applications
2. **Application Management**: Accept/reject applications
3. **Cohort Management**: Create and manage cohorts

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
✅ Core infrastructure and services
✅ User authentication and registration
✅ Landing page with cohort information
✅ User dashboard and application form
✅ Mobile-responsive design

🚧 Pending Implementation:
- Admin panel with CRM interface
- Cohort management system
- Super admin setup page
- Route guards
- Application form field specification

## Firebase Security Rules (Recommended)
```javascript
// Firestore Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Admin users can read all user data
    match /users/{document=**} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Applications - users can only access their own
    match /applications/{applicationId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    // Admins can read all applications
    match /applications/{document=**} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Cohorts are readable by all authenticated users
    match /cohorts/{cohortId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## Best Practices Followed
- **Security**: No secrets in code, Firebase rules recommended
- **Code Quality**: TypeScript strict mode, proper error handling
- **UX**: Loading states, error messages, responsive design
- **Architecture**: Separation of concerns, reusable services
- **Accessibility**: Semantic HTML, proper form labels