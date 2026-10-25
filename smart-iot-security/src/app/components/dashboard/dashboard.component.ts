import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { FirebaseService } from '../../services/firebase.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription, Observable, combineLatest, of, firstValueFrom } from 'rxjs';
import { map, startWith, catchError } from 'rxjs/operators';
import { DoorStatus } from '../../models/door-status.model';

// Register Chart.js only in browser
if (typeof window !== 'undefined') {
  Chart.register(...registerables);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatGridListModule,
    MatIconModule,
    MatButtonModule,
    BaseChartDirective,
    MatSnackBarModule,
    MatSlideToggleModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Metrics
  totalUsers$!: Observable<number>;
  totalCards$!: Observable<number>;
  accessToday$!: Observable<number>;
  intrusionsToday$!: Observable<number>;
  rejectionRate$!: Observable<number>;
  doorStatus$!: Observable<DoorStatus | null>;
  recentAlerts$!: Observable<any[]>;
  mostActiveUser$!: Observable<any>;
  doorAccessLogs$!: Observable<any[]>;

  // Charts
  accessChartData: ChartConfiguration['data'] = {
    labels: [],
    datasets: [{
      label: 'Accès',
      data: [],
      backgroundColor: 'rgba(59, 130, 246, 0.5)',
      borderColor: '#3b82f6',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    }]
  };

  alertTypeData: ChartConfiguration['data'] = {
    labels: ['Visage', 'PIR', 'Badge RFID'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['#ef4444', '#f59e0b', '#8b5cf6']
    }]
  };

  accessSuccessData: ChartConfiguration['data'] = {
    labels: ['Autorisé', 'Refusé'],
    datasets: [{
      data: [0, 0],
      backgroundColor: ['#22c55e', '#ef4444']
    }]
  };

  accessChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  commonPieOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } }
  };

  accessChartType: ChartType = 'line';
  pieChartType: ChartType = 'doughnut';
  pieAccessType: ChartType = 'pie';

  private subscriptions: Subscription[] = [];
  isBrowser: boolean;

  constructor(
    private firebaseService: FirebaseService,
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private snackBar: MatSnackBar
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.initDataStreams();
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.loadChartsData();
    }
  }

  private initDataStreams(): void {
    this.totalUsers$ = this.firebaseService.getUsers().pipe(map(u => u?.length || 0), startWith(0));
    this.totalCards$ = this.firebaseService.getRFIDCards().pipe(map(c => c?.length || 0), startWith(0));
    
    this.accessToday$ = combineLatest([
      this.firebaseService.getAccessLogs(200).pipe(startWith([])),
      this.firebaseService.getRTDBData('access_granted').pipe(startWith([])),
      this.firebaseService.getRTDBData('access_refused').pipe(startWith([]))
    ]).pipe(
      map(([logs, granted, refused]: [any[], any[], any[]]) => {
        const all = [...(logs || []), ...(granted || []), ...(refused || [])];
        const unique = Array.from(new Map(all.map(item => [item.id || item.timestamp, item])).values());
        const today = new Date();
        today.setHours(0,0,0,0);
        return unique.filter(l => {
          const ts = l.timestamp || l.datetime;
          const logDate = ts?.toDate ? ts.toDate() : new Date(ts);
          return logDate.getTime() >= today.getTime();
        }).length;
      }),
      startWith(0)
    );

    this.intrusionsToday$ = combineLatest([
      this.firebaseService.getIntrusions().pipe(startWith([])),
      this.firebaseService.getSecurityAlerts(50).pipe(startWith([])),
      this.firebaseService.getRTDBData('access_refused').pipe(startWith([]))
    ]).pipe(
      map(([int, al, ref]: [any[], any[], any[]]) => {
        const pendingRef = (ref || []).filter(r => !r.resolved).length;
        return (int?.filter(i => !i.resolved).length || 0) + (al?.filter(a => !a.resolved).length || 0) + pendingRef;
      }),
      startWith(0)
    );

    this.rejectionRate$ = combineLatest([
      this.firebaseService.getRTDBData('access_granted').pipe(startWith([])),
      this.firebaseService.getRTDBData('access_refused').pipe(startWith([]))
    ]).pipe(
      map(([granted, refused]: [any[], any[]]) => {
        const total = (granted?.length || 0) + (refused?.length || 0);
        if (total === 0) return 0;
        return Math.round(((refused?.length || 0) / total) * 100);
      }),
      startWith(0)
    );

    this.doorStatus$ = this.firebaseService.getDoorStatus().pipe(startWith(null));

    this.recentAlerts$ = combineLatest([
      this.firebaseService.getIntrusions().pipe(startWith([])),
      this.firebaseService.getSecurityAlerts(15).pipe(startWith([])),
      this.firebaseService.getRTDBData('access_refused', 10).pipe(startWith([]))
    ]).pipe(
      map(([int, al, ref]: [any[], any[], any[]]) => {
        const all = [
            ...(int || []).map(i => ({...i, source: 'intrusion'})), 
            ...(al || []).map(a => ({...a, source: 'security_alert'})),
            ...(ref || []).map(r => ({...r, source: 'security_alert', type: 'access_refused', severity: 'medium'}))
        ];
        return all.sort((a,b) => {
          const tA = (a.timestamp || a.datetime)?.toMillis ? (a.timestamp || a.datetime).toMillis() : new Date(a.timestamp || a.datetime).getTime();
          const tB = (b.timestamp || b.datetime)?.toMillis ? (b.timestamp || b.datetime).toMillis() : new Date(b.timestamp || b.datetime).getTime();
          return tB - tA;
        }).slice(0, 5);
      })
    );

    this.doorAccessLogs$ = combineLatest([
      this.firebaseService.getAccessLogs(30).pipe(startWith([])),
      this.firebaseService.getRTDBData('access_granted').pipe(startWith([])),
      this.firebaseService.getRTDBData('access_refused').pipe(startWith([])),
      this.firebaseService.getUsers().pipe(startWith([]))
    ]).pipe(
      map(([logs, granted, refused, users]: [any[], any[], any[], any[]]) => {
        const all = [...(logs || []), ...(granted || []), ...(refused || [])];
        const unique = Array.from(new Map(all.map(item => [item.id || item.timestamp, item])).values());
        
        return (unique || [])
          .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0))
          .map(log => {
            const user = (users || []).find(u => (u.RFIDTag || u.rfid || u.cardNumber) === log.uid);
            return {
              ...log,
              userName: user ? `${user.prenom} ${user.nom}` : (log.user_name || log.userName || 'Inconnu'),
              userPhoto: user ? (user.photoUrl || user.imageURL) : null
            };
          }).slice(0, 15);
      })
    );

    this.mostActiveUser$ = this.doorAccessLogs$.pipe(
      map(logs => {
        if (!logs?.length) return null;
        const counts: {[key: string]: number} = {};
        logs.forEach(l => { 
          const name = l.userName || l.user_name || l.uid;
          if (name && name !== 'Inconnu' && name !== '-' && name !== 'unknown') {
            counts[name] = (counts[name] || 0) + 1;
          }
        });
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        if (!sorted.length) return null;
        
        // Find user by name to get photo
        const topName = sorted[0][0];
        const logWithUser = logs.find(l => (l.userName || l.user_name) === topName);

        return { 
          name: topName, 
          count: sorted[0][1],
          photo: logWithUser ? logWithUser.userPhoto : null
        };
      })
    );
  }

  private loadChartsData(): void {
    const sub = this.firebaseService.getAccessLogs(1000).subscribe(logs => {
      // Activity per hour
      const hours = Array.from({length: 24}, (_, i) => i);
      const labels = hours.map(h => `${h}:00`);
      const now = new Date();
      now.setHours(0,0,0,0);
      const data = hours.map(h => {
        return logs?.filter(l => {
          const ts = l.timestamp || l.datetime;
          const logDate = ts?.toDate ? ts.toDate() : new Date(ts);
          return logDate.getTime() >= now.getTime() && logDate.getHours() === h;
        }).length || 0;
      });
      this.accessChartData = { labels, datasets: [{ ...this.accessChartData.datasets[0], data }] };

      // Success vs Denied
      const granted = logs?.filter(l => (l.status || '').toLowerCase().includes('success') || (l.status || '').toLowerCase().includes('granted')).length || 0;
      const denied = (logs?.length || 0) - granted;
      this.accessSuccessData = { labels: ['Autorisé', 'Refusé'], datasets: [{ data: [granted, denied], backgroundColor: ['#22c55e', '#ef4444'] }] };
    });
    this.subscriptions.push(sub);
  }

  exportLogs(): void {
    this.snackBar.open('Exportation des logs en cours...', 'OK', { duration: 3000 });
  }

  refreshData(): void {
    this.snackBar.open('Données actualisées', 'OK', { duration: 3000 });
  }

  async triggerDoorAction(action: 'OPEN' | 'CLOSE'): Promise<void> {
    try {
      await this.firebaseService.triggerManualDoorAction(action);
      const actionName = action === 'OPEN' ? 'Ouverture' : 'Fermeture';
      this.snackBar.open(`Commande envoyée : ${actionName} de la porte...`, 'Fermer', { duration: 4000 });
    } catch (e) {
      this.snackBar.open('Erreur lors de la commande', 'Fermer', { duration: 3000 });
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
