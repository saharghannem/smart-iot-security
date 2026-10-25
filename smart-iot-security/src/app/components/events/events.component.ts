import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FirebaseService } from '../../services/firebase.service';
import { AccessLog, AccessStatus } from '../../models/access-log.model';
import { Intrusion } from '../../models/intrusion.model';
import { DoorStatus } from '../../models/door-status.model';
import { Subscription, combineLatest, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { EventDetailDialogComponent } from './event-detail-dialog/event-detail-dialog.component';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule
  ],
  templateUrl: './events.component.html',
  styleUrl: './events.component.css'
})
export class EventsComponent implements OnInit, OnDestroy {
  accessLogs: AccessLog[] = [];
  intrusions: Intrusion[] = [];
  doorStatuses: DoorStatus[] = [];
  selectedTab: number = 0;

  accessLogsColumns: string[] = ['timestamp', 'username', 'cardNumber', 'status', 'doorState', 'facialMatch', 'actions'];
  intrusionsColumns: string[] = ['timestamp', 'photos', 'user', 'detectedBy', 'severity', 'resolved', 'actions'];
  doorStatusColumns: string[] = ['timestamp', 'status', 'datetime'];

  private subscriptions: Subscription[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadAccessLogs();
    this.loadIntrusions();
    this.loadDoorStatuses();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  applyFilter(event: Event, type: 'access' | 'intrusion'): void {
    const filterValue = (event.target as HTMLInputElement).value.toLowerCase();
    // Implementation for local filtering
  }

  exportToCSV(): void {
    if (this.selectedTab === 0) {
      // Access Logs CSV
      if (!this.accessLogs.length) { alert('Aucun log à exporter.'); return; }
      const headers = ['Date/Heure', 'Utilisateur', 'Carte RFID', 'Statut', 'Porte', 'Reconnaissance Faciale'];
      const rows = this.accessLogs.map(log => [
        this.formatLogDate(log),
        log.userName || '-',
        (log as any).cardNumber || (log as any).RFIDTag || (log as any).uid || '-',
        this.getStatusLabel(log.status),
        (log as any).doorState === 'open' ? 'Ouverte' : 'Fermée',
        (log as any).facialMatch === true ? 'Oui' : (log as any).facialMatch === false ? 'Non' : '-'
      ]);
      this.downloadCSV('historique_acces.csv', headers, rows);
    } else {
      // Intrusions CSV
      if (!this.intrusions.length) { alert('Aucune alerte à exporter.'); return; }
      const headers = ['Date/Heure', 'Détecté Par', 'Sévérité', 'Résolu', 'Note'];
      const rows = this.intrusions.map(i => [
        this.formatLogDate(i as any),
        (i as any).detectedBy || '-',
        (i as any).severity || '-',
        (i as any).resolved ? 'Oui' : 'Non',
        (i as any).notes || ''
      ]);
      this.downloadCSV('alertes_securite.csv', headers, rows);
    }
  }

  exportToPDF(): void {
    const { jsPDF } = (window as any).jspdf || {};
    // Fallback: use firebaseService export
    if (this.selectedTab === 0) {
      this.firebaseService.exportLogsToPDF(this.accessLogs);
    }
  }

  private downloadCSV(filename: string, headers: string[], rows: any[][]): void {
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }


  viewDetail(event: any): void {
    this.dialog.open(EventDetailDialogComponent, {
      data: event,
      width: '500px'
    });
  }

  private loadAccessLogs(): void {
    const rtdbLogs$ = this.firebaseService.getAccessLogs(200).pipe(startWith([]));
    const grantedLogs$ = this.firebaseService.getRTDBData('access_granted', 200).pipe(startWith([]));
    const refusedLogs$ = this.firebaseService.getRTDBData('access_refused', 200).pipe(startWith([]));
    const firestoreLogs$ = this.firebaseService.getFirestoreAccessLogs(200).pipe(startWith([]));
    const users$ = this.firebaseService.getUsers().pipe(startWith([]));
    const cards$ = this.firebaseService.getRFIDCards().pipe(startWith([]));

    const sub = (combineLatest([grantedLogs$, firestoreLogs$, users$, cards$]) as any).subscribe({
      next: ([granted, fsLogs, users, cards]: [any[], any[], any[], any[]]) => {
        // Only include those from firestore if they are granted AND have finished face check
        const allLogs = [
            ...(granted || []), 
            ...(fsLogs || []).filter(l => (l.status || '').toLowerCase().includes('granted') && (l.method === 'facial_recognition' || l.method === 'face'))
        ];

        // Strict deduplication by unique ID or timestamp+UID combination
        const uniqueMap = new Map();
        allLogs.forEach(log => {
           // Create a unique key using timestamp and user ID
           const ts = log.timestamp || log.datetime;
           const logId = log.id || `${ts}_${log.uid}`;
           if (!uniqueMap.has(logId)) {
               uniqueMap.set(logId, log);
           }
        });
        
        const rawLogs = Array.from(uniqueMap.values());

        if (rawLogs.length === 0) {
          this.accessLogs = [];
          return;
        }

        // Create a map of Card Doc ID -> Card Number
        const cardMap = new Map<string, string>();
        cards.forEach(c => {
          if (c.id && c.cardNumber) {
            cardMap.set(c.id, c.cardNumber.trim().toUpperCase());
          }
        });

        const mapped = rawLogs.map(log => {
          // Normalize Log UID
          const logId = (log.uid || log.cardNumber || log.rfidCardId || '').trim().toUpperCase();

          const user = users.find(u => {
            const directTag = (u.RFIDTag || u.rfidCardId || u.rfid || u.tag || u.card_number || u.cardNumber || '').trim().toUpperCase();
            const resolvedTag = cardMap.get(u.rfidCardId) || cardMap.get(u.RFIDTag);
            return (directTag && logId && directTag === logId) || (resolvedTag && logId && resolvedTag === logId);
          });

          // Determine status
          let status = AccessStatus.DENIED;
          const evt = (log.event || log.status || '').toLowerCase();

          if (evt.includes('rfid_rejected')) {
            status = AccessStatus.RFID_REJECTED;
          } else if (evt.includes('access_denied_face') || (evt.includes('face') && evt.includes('denied'))) {
            status = AccessStatus.FACE_MISMATCH;
          } else if (evt.includes('granted') || evt.includes('authorized')) {
            status = AccessStatus.GRANTED;
          } else if (evt.includes('intrusion') || evt.includes('alert')) {
            status = AccessStatus.INTRUSION;
          }

          return {
            ...log,
            status: status,
            userName: user ? `${user.prenom} ${user.nom}` : (log.userName || '-')
          };
        });

        // Unique by ID/Timestamp to avoid duplicates from dual sources
        const unique = Array.from(new Map(mapped.map(item => [item.id || item.timestamp || Math.random(), item])).values());

        // Sort by timestamp
        this.accessLogs = unique.sort((a, b) => {
          const getMillis = (dateObj: any) => {
            if (!dateObj) return 0;
            if (dateObj.toMillis) return dateObj.toMillis();
            const d = new Date(dateObj);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          const timeA = a.datetime ? new Date(a.datetime).getTime() : getMillis(a.timestamp);
          const timeB = b.datetime ? new Date(b.datetime).getTime() : getMillis(b.timestamp);
          return (timeB || 0) - (timeA || 0);
        });
      },
      error: (err: any) => console.error('❌ Error in access logs stream:', err)
    });

    this.subscriptions.push(sub);
  }

  private loadIntrusions(): void {
    const intrusions$ = this.firebaseService.getIntrusions().pipe(startWith([]));
    const securityAlerts$ = this.firebaseService.getSecurityAlerts(100).pipe(startWith([]));
    const users$ = this.firebaseService.getUsers().pipe(startWith([]));
    const cards$ = this.firebaseService.getRFIDCards().pipe(startWith([]));
    const refused$ = this.firebaseService.getRTDBData('access_refused', 100).pipe(startWith([]));

    const sub = (combineLatest([intrusions$, securityAlerts$, refused$, users$, cards$]) as any).subscribe({
      next: ([intrusions, alerts, refused, users, cards]: [any[], any[], any[], any[], any[]]) => {
        // ... previous mapping logic for cardMap ...
        const cardMap = new Map<string, string>();
        cards.forEach(c => {
          if (c.id && c.cardNumber) {
            cardMap.set(c.id, c.cardNumber.trim().toUpperCase());
          }
        });

        // Map standard intrusions
        const mappedIntrusions: Intrusion[] = intrusions.map(i => ({
          ...i,
          sourceCollection: 'intrusions'
        }));

        // Map access_refused (NEW)
        const mappedRefused: Intrusion[] = (refused || []).map(r => {
            return {
                id: r.id,
                timestamp: r.timestamp,
                detectedBy: 'FACIAL_RECOGNITION',
                severity: 'high',
                resolved: false,
                imageUrl: r.image_url,
                userName: r.user_name || 'Inconnu',
                notes: `RFID: ${r.uid || 'None'} - Refusé par le backend`,
                sourceCollection: 'access_refused'
            } as Intrusion;
        });

        // Map SecurityAlerts
        const mappedAlerts: Intrusion[] = alerts.map(alert => {
          const logId = (alert.uid || '').trim().toUpperCase();
          const user = users.find(u => {
            const directTag = (u.RFIDTag || u.rfidCardId || u.rfid || u.tag || u.card_number || u.cardNumber || '').trim().toUpperCase();
            const resolvedTag = cardMap.get(u.rfidCardId) || cardMap.get(u.RFIDTag);
            return (directTag && logId && directTag === logId) || (resolvedTag && logId && resolvedTag === logId);
          });

          return {
            id: alert.id,
            timestamp: alert.datetime || alert.timestamp,
            detectedBy: this.mapAlertType(alert.type),
            severity: 'high',
            resolved: alert.resolved || false,
            imageURL: alert.image_url,
            imageUrl: alert.image_url, // For compatibility
            userName: user ? `${user.prenom} ${user.nom}` : undefined,
            ownerImageUrl: user ? (user.imageURL || user.photoUrl) : undefined,
            notes: `Device: ${alert.device_id}${alert.uid ? ', UID: ' + alert.uid : ''}`,
            sourceCollection: 'security_alerts'
          } as Intrusion;
        });

        // Combine and sort
        const combined = [...mappedIntrusions, ...mappedAlerts, ...mappedRefused];
        combined.sort((a, b) => {
          const getMillis = (date: any) => {
            if (!date) return 0;
            if (date.toMillis) return date.toMillis();
            const d = new Date(date);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          const timeA = getMillis(a.timestamp || a.datetime);
          const timeB = getMillis(b.timestamp || b.datetime);
          return timeB - timeA;
        });

        this.intrusions = combined;
      },
      error: (err: any) => console.error('Error loading alerts:', err)
    });

    this.subscriptions.push(sub);
  }

  private mapAlertType(type: string): 'PIR' | 'DOOR_SENSOR' | 'FACIAL_RECOGNITION' {
    const t = (type || '').toLowerCase();
    
    // Exact mapping from Backend and Arduino
    if (t.includes('visage') || t.includes('faciale') || t.includes('recognition')) {
      return 'FACIAL_RECOGNITION';
    }
    
    if (t.includes('force') || t.includes('vibration') || t.includes('rfid_rejected')) {
      return 'DOOR_SENSOR';
    }
    
    if (t.includes('pir') || t.includes('mouvement') || t.includes('movement') || t.includes('suspicious')) {
      return 'PIR';
    }
    
    return 'PIR'; // Default
  }

  private loadDoorStatuses(): void {
    const sub = this.firebaseService.getDoorStatusHistory().subscribe(statuses => {
      this.doorStatuses = statuses;
    });
    this.subscriptions.push(sub);
  }

  getStatusColor(status: AccessStatus): string {
    switch (status) {
      case AccessStatus.GRANTED:
        return 'primary';
      case AccessStatus.DENIED:
        return 'warn';
      case AccessStatus.INTRUSION:
        return 'warn';
      case AccessStatus.RFID_REJECTED:
        return 'warn';
      case AccessStatus.FACE_MISMATCH:
        return 'warn';
      default:
        return '';
    }
  }

  getStatusLabel(status: AccessStatus): string {
    switch (status) {
      case AccessStatus.GRANTED:
        return 'Autorisé';
      case AccessStatus.DENIED:
        return 'Refusé';
      case AccessStatus.INTRUSION:
        return 'Intrusion';
      case AccessStatus.RFID_REJECTED:
        return 'Carte Refusée';
      case AccessStatus.FACE_MISMATCH:
        return 'Propriétaire Incorrect';
      default:
        return '';
    }
  }

  getSeverityColor(severity: string): string {
    switch (severity) {
      case 'low':
        return 'primary';
      case 'medium':
        return 'accent';
      case 'high':
        return 'warn';
      default:
        return '';
    }
  }

  formatDate(date: any): string {
    // If a log object is passed (or something with datetime prop), prioritize datetime string
    if (date && typeof date === 'object' && 'datetime' in date && date.datetime) {
      return date.datetime;
    }
    // If we have just a date/number
    if (!date) return 'N/A';

    // Check if it's the log object passed directly (common mistake in template calling)
    // But here we usually pass log.timestamp. 
    // Let's modify the template to pass the whole log to be safe, or handle it here if possible?
    // Actually, simple way: modify the method to accept log object OR date.

    const d = date.toDate ? date.toDate() : new Date(date);
    // If date is invalid or too small (e.g. Arduino uptime < 2020), handle gracefully
    // Current year is 2026, so anything < 2024 is suspicious for this project, but let's say < 2000 is definitely wrong.
    // The timestamp in screenshot is 19735, which is 1970-01-01.
    // We check if the input number is small (e.g. < 1000000000000 for millis)
    if (typeof date === 'number' && date < 1600000000000) {
      return `Seq: ${date}`; // Display as Sequence/Uptime
    }

    if (d.getFullYear() < 2020) return `Inv: ${date}`;

    return d.toLocaleString('fr-FR');
  }

  // Helper to format Log object directly
  formatLogDate(log: any): string {
    if (log.datetime) return log.datetime;
    return this.formatDate(log.timestamp);
  }

  async resolveIntrusion(intrusion: Intrusion): Promise<void> {
    if (confirm('Marquer cette intrusion comme résolue ?')) {
      try {
        const updateData = {
          resolved: true,
          resolvedAt: new Date()
        };

        if (intrusion.sourceCollection === 'security_alerts') {
          await this.firebaseService.updateSecurityAlert(intrusion.id!, updateData);
        } else {
          await this.firebaseService.updateIntrusion(intrusion.id!, updateData);
        }
      } catch (error) {
        console.error('Erreur lors de la résolution:', error);
      }
    }
  }

  viewImage(url: string): void {
    window.open(url, '_blank');
  }

  async deleteLog(log: any): Promise<void> {
    if (!confirm('Supprimer définitivement ce log ?')) return;
    try {
        await this.firebaseService.deleteAccessLog(log.id || log.timestamp);
    } catch (e) {
        console.error('Erreur suppression log:', e);
    }
  }

  async deleteIntrusionLog(intrusion: any): Promise<void> {
    if (!confirm('Supprimer définitivement cette alerte ?')) return;
    try {
      if (intrusion.sourceCollection === 'security_alerts') {
        await this.firebaseService.deleteSecurityAlert(intrusion.id, intrusion.imageUrl || intrusion.imageURL);
      } else {
        await this.firebaseService.deleteIntrusion(intrusion.id, intrusion.imageUrl || intrusion.imageURL);
      }
    } catch (e) {
      console.error('Erreur suppression alerte:', e);
    }
  }
}
