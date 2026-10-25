import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { LayoutComponent } from './components/layout/layout.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { UsersComponent } from './components/users/users.component';
import { RFIDComponent } from './components/rfid/rfid.component';
import { EventsComponent } from './components/events/events.component';
import { ConfigComponent } from './components/config/config.component';
import { ImagesComponent } from './components/images/images.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: '/dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        component: DashboardComponent
      },
      {
        path: 'users',
        component: UsersComponent
      },
      {
        path: 'rfid',
        component: RFIDComponent
      },
      {
        path: 'events',
        component: EventsComponent
      },
      {
        path: 'config',
        component: ConfigComponent
      },
      {
        path: 'images',
        component: ImagesComponent
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
