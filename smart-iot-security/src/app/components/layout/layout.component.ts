import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { FirebaseService } from '../../services/firebase.service';
import { Notification, NotificationType } from '../../models/notification.model';
import { Subscription, combineLatest, Observable, of } from 'rxjs';
import { map, startWith, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { UserDetailDialogComponent } from '../users/user-detail-dialog/user-detail-dialog.component';
import { MatDialog } from '@angular/material/dialog';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatBadgeModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    ReactiveFormsModule
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit, OnDestroy {
  sidenavOpened = true;
  unreadNotifications = 0;
  notifications: Notification[] = [];
  
  // System State
  isDarkMode = false;
  isEmergencyMode = false;

  // Global Search
  globalSearchControl = new FormControl('');
  searchResults$: Observable<any[]> = of([]);

  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Utilisateurs', icon: 'people', route: '/users' },
    { label: 'Cartes RFID', icon: 'credit_card', route: '/rfid' },
    { label: 'Événements', icon: 'event', route: '/events' },
    { label: 'Images', icon: 'image', route: '/images' },
    { label: 'Configuration', icon: 'settings', route: '/config' }
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private firebaseService: FirebaseService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    // 1. Dark Mode initialization
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme === 'dark';
    this.updateTheme();

    // 2. Emergency Mode subscription
    const configSub = this.firebaseService.getSystemConfig().subscribe(config => {
      if (config) {
        this.isEmergencyMode = config.emergencyMode || false;
      }
    });
    this.subscriptions.push(configSub);

    // 3. Global Search Logic
    this.searchResults$ = this.globalSearchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (!term || term.length < 2) return of([]);
        const lowerTerm = term.toLowerCase();
        return this.firebaseService.getUsersStream().pipe(
          map(users => users.filter(u => 
            (u.nom?.toLowerCase() || '').includes(lowerTerm) || 
            (u.prenom?.toLowerCase() || '').includes(lowerTerm) || 
            (u.email?.toLowerCase() || '').includes(lowerTerm) ||
            (u.matricule?.toLowerCase() || '').includes(lowerTerm)
          ).slice(0, 5))
        );
      })
    );

    // 4. Notifications logic
    const notifSub = this.notificationService.notifications$.subscribe(notification => {
      this.addNotification(notification);
    });
    this.subscriptions.push(notifSub);

    const alertSub = combineLatest([
      this.firebaseService.getIntrusions(),
      this.firebaseService.getSecurityAlerts(15),
      this.firebaseService.getUsersStream(),
      this.firebaseService.getRFIDCards()
    ]).subscribe(([intrusions, alerts, users, cards]: [any[], any[], any[], any[]]) => {

      const cardMap = new Map<string, string>();
      cards.forEach(c => {
        if (c.id && c.cardNumber) {
          cardMap.set(c.id, c.cardNumber.trim().toUpperCase());
        }
      });

      const mappedIntrusions: Notification[] = intrusions.map(i => ({
        id: i.id,
        title: 'Intrusion Détectée',
        message: `Détecté par ${i.detectedBy} à ${this.formatTime(i.timestamp)}`,
        type: NotificationType.INTRUSION_DETECTED,
        timestamp: i.timestamp,
        read: i.resolved || false,
        imageUrl: i.imageUrl || i.imageURL
      }));

      const mappedSecurityAlerts: Notification[] = alerts.map(a => {
        const logId = (a.uid || '').trim().toUpperCase();
        const user = users.find(u => {
          const directTag = (u.RFIDTag || u.rfidCardId || u.rfid || u.tag || u.card_number || u.cardNumber || '').trim().toUpperCase();
          const resolvedTag = cardMap.get(u.rfidCardId) || cardMap.get(u.RFIDTag);
          return (directTag && logId && directTag === logId) || (resolvedTag && logId && resolvedTag === logId);
        });

        return {
          id: a.id,
          title: a.type === 'visage_non_reconnu' ? 'Alerte Visage' : 'Alerte Sécurité',
          message: `${a.type.replace('_', ' ')} détecté à ${a.datetime || this.formatTime(a.timestamp)}`,
          type: NotificationType.INTRUSION_DETECTED,
          timestamp: a.datetime || a.timestamp,
          read: a.resolved || false,
          imageUrl: a.image_url,
          ownerName: user ? `${user.prenom} ${user.nom}` : undefined,
          ownerImageUrl: user ? (user.imageURL || user.photoUrl) : undefined
        };
      });

      this.notifications = [...mappedIntrusions, ...mappedSecurityAlerts].sort((a, b) => {
        const getT = (t: any) => {
          if (!t) return 0;
          if (t.toMillis) return t.toMillis();
          return new Date(t).getTime();
        };
        return getT(b.timestamp) - getT(a.timestamp);
      });
      this.updateUnreadCount();
    });
    this.subscriptions.push(alertSub);
  }

  // ========== ACTIONS ==========

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.updateTheme();
  }

  private updateTheme(): void {
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  async toggleEmergencyMode(): Promise<void> {
    const newState = !this.isEmergencyMode;
    const confirmMsg = newState 
      ? "ATTENTION : Voulez-vous activer le MODE URGENCE ? Tous les points d'accès seront bloqués immédiatement."
      : "Voulez-vous désactiver le mode urgence et rétablir les accès normaux ?";
    
    if (confirm(confirmMsg)) {
      try {
        await this.firebaseService.updateSystemConfig({ emergencyMode: newState });
        if (newState) {
          await this.firebaseService.triggerManualDoorAction('EMERGENCY');
        }
        this.snackBar.open(newState ? '🚨 MODE URGENCE ACTIVÉ' : 'Mode normal rétabli', 'Fermer', {
          duration: 5000,
          panelClass: newState ? ['emergency-snackbar'] : []
        });
      } catch (e) {
        this.snackBar.open('Erreur mise à jour système', 'Fermer');
      }
    }
  }

  onUserSelected(event: any): void {
    const user = event.option.value;
    this.globalSearchControl.setValue('');
    this.dialog.open(UserDetailDialogComponent, {
      data: user,
      width: '500px'
    });
  }

  addNotification(notification: Notification) {
    this.notifications.unshift(notification);
    this.updateUnreadCount();
  }

  updateUnreadCount() {
    this.unreadNotifications = this.notifications.filter(n => !n.read).length;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }

  markNotificationAsRead(notification: Notification): void {
    if (!notification.read) {
      notification.read = true;
      this.unreadNotifications--;
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'access_granted': return 'check_circle';
      case 'access_denied': return 'cancel';
      case 'intrusion_detected': return 'warning';
      case 'door_opened': return 'lock_open';
      case 'door_closed': return 'lock';
      default: return 'info';
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('fr-FR');
  }
}
