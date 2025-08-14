import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'auth', loadComponent: () => import('./pages/auth/auth.component').then(m => m.AuthComponent) },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'application', loadComponent: () => import('./pages/application/application.component').then(m => m.ApplicationComponent) },
  { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent) },
  { path: 'super-admin', loadComponent: () => import('./pages/super-admin/super-admin.component').then(m => m.SuperAdminComponent) },
  { path: '**', redirectTo: '' }
];
