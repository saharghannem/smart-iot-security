import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { User } from '../../../models/user.model';
import { Timestamp } from '@angular/fire/firestore';
import { FirebaseService } from '../../../services/firebase.service';
import { Observable, map } from 'rxjs';

@Component({
  selector: 'app-user-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule, 
    MatDividerModule,
    MatListModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="user-detail-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>Détails de l'utilisateur</h2>
        <button mat-icon-button mat-dialog-close>
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <div class="user-content">
          <div class="photo-section">
            <img [src]="user.photoUrl || user.imageURL || 'assets/default-avatar.png'" alt="Photo de profil" class="detail-photo">
            <div class="user-main-info">
              <h3>{{ user.nom }} {{ user.prenom }}</h3>
              <p class="poste-text" *ngIf="user.poste">{{ user.poste }}</p>
              <div class="badges">
                <p class="role-badge" [class.admin]="user.role === 'admin'">{{ user.role === 'admin' ? 'Administrateur' : 'Utilisateur' }}</p>
                <p class="status-badge" [class.inactive]="!user.isActive">{{ user.isActive ? 'Actif' : 'Inactif' }}</p>
              </div>
            </div>
          </div>

          <mat-divider></mat-divider>

          <div class="info-grid" *ngIf="!showHistory">
            <div class="info-item">
              <mat-icon>badge</mat-icon>
              <div class="info-texts">
                <span class="label">Matricule</span>
                <span class="value">{{ user.matricule || 'N/A' }}</span>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>work</mat-icon>
              <div class="info-texts">
                <span class="label">Poste</span>
                <span class="value">{{ user.poste || 'Non spécifié' }}</span>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>email</mat-icon>
              <div class="info-texts">
                <span class="label">Email</span>
                <span class="value">{{ user.email }}</span>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>credit_card</mat-icon>
              <div class="info-texts">
                <span class="label">Carte RFID</span>
                <span class="value">{{ user.cardNumber || 'Aucune carte assignée' }}</span>
              </div>
            </div>

            @if (user.rfidCardId) {
              <div class="info-item">
                <mat-icon>event_available</mat-icon>
                <div class="info-texts">
                  <span class="label">Période d'accès</span>
                  <span class="value">
                    {{ formatDate(user.accessStartDate) }} au {{ formatDate(user.accessEndDate) }}
                  </span>
                </div>
              </div>

              <div class="info-item">
                <mat-icon>schedule</mat-icon>
                <div class="info-texts">
                  <span class="label">Horaires autorisés</span>
                  <span class="value">
                    @if (user.accessStartTime && user.accessEndTime) {
                      {{ user.accessStartTime }} - {{ user.accessEndTime }}
                    } @else {
                      Accès illimité (24/7)
                    }
                  </span>
                </div>
              </div>
            }

            <div class="info-item">
              <mat-icon>history</mat-icon>
              <div class="info-texts">
                <span class="label">Dernière activité</span>
                <span class="value">{{ formatDate(user.lastSeen) || 'Aucune activité enregistrée' }}</span>
              </div>
            </div>
          </div>

          <!-- History Section -->
          <div class="history-section" *ngIf="showHistory">
            <div class="history-header">
              <h3>Historique des accès</h3>
              <button mat-button (click)="showHistory = false">
                <mat-icon>arrow_back</mat-icon> Retour
              </button>
            </div>
            
            <div *ngIf="userLogs$ | async as logs; else loadingLogs">
              <mat-list *ngIf="logs.length > 0; else noLogs">
                <mat-list-item *ngFor="let log of logs">
                  <mat-icon matListItemIcon [color]="(log.status === 'success' || log.status === 'granted' || log.status === 'authorized') ? 'primary' : 'warn'">
                    {{ (log.status === 'success' || log.status === 'granted' || log.status === 'authorized') ? 'check_circle' : 'error' }}
                  </mat-icon>
                  <div matListItemTitle>{{ (log.timestamp?.toDate ? log.timestamp.toDate() : (log.timestamp || log.datetime)) | date:'dd/MM/yyyy HH:mm:ss' }}</div>
                  <div matListItemLine>
                    {{ log.doorName || 'Porte Principale' }} - 
                    <span [style.color]="(log.status === 'success' || log.status === 'granted' || log.status === 'authorized') ? '#2e7d32' : '#d32f2f'">
                        {{ (log.status === 'success' || log.status === 'granted' || log.status === 'authorized') ? 'Accès Autorisé' : 'Accès Refusé' }}
                    </span>
                  </div>
                </mat-list-item>
              </mat-list>
              <ng-template #noLogs>
                <div class="empty-state">
                  <mat-icon>history_toggle_off</mat-icon>
                  <p>Aucun log trouvé pour cet utilisateur.</p>
                </div>
              </ng-template>
            </div>
            <ng-template #loadingLogs>
              <div class="loading-logs">
                <mat-spinner diameter="30"></mat-spinner>
                <p>Chargement de l'historique...</p>
              </div>
            </ng-template>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button *ngIf="!showHistory" (click)="toggleHistory()" color="accent">
          <mat-icon>history</mat-icon> VOIR HISTORIQUE
        </button>
        <button mat-raised-button color="primary" mat-dialog-close>Fermer</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .user-detail-container {
      padding: 16px;
      min-width: 450px;
      max-height: 80vh;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .dialog-header h2 { margin: 0; }
    .user-content {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .photo-section {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .detail-photo {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #1976d2;
    }
    .user-main-info h3 { margin: 0; font-size: 1.3rem; }
    .poste-text { margin: 0; color: #666; font-style: italic; font-size: 0.9rem; }
    .badges { display: flex; gap: 8px; margin-top: 4px; }
    .role-badge, .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      margin: 0;
    }
    .role-badge { background: #e3f2fd; color: #1976d2; }
    .status-badge { background: #e8f5e9; color: #388e3c; }
    .status-badge.inactive { background: #ffebee; color: #d32f2f; }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .info-item { display: flex; gap: 10px; }
    .info-item mat-icon { color: #757575; }
    .info-texts { display: flex; flex-direction: column; }
    .label { font-size: 0.7rem; color: #757575; text-transform: uppercase; font-weight: 600; }
    .value { font-size: 0.9rem; color: #333; font-weight: 500; }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .history-header h3 { margin: 0; color: #1976d2; }
    .empty-state, .loading-logs {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      color: #999;
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 10px; }
  `]
})
export class UserDetailDialogComponent implements OnInit {
  showHistory = false;
  userLogs$?: Observable<any[]>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public user: any,
    private firebaseService: FirebaseService
  ) { }

  ngOnInit(): void {
    // We'll initialize history logs when requested to save bandwidth
  }

  toggleHistory(): void {
    this.showHistory = true;
    if (!this.userLogs$) {
      const userTag = (this.user.RFIDTag || this.user.rfid || this.user.cardNumber || '').trim().toUpperCase();
      
      this.userLogs$ = this.firebaseService.getAccessLogs(300).pipe(
        map(logs => logs.filter(log => {
            const logUid = (log.uid || log.cardNumber || log.rfidCardId || '').trim().toUpperCase();
            // Match by UID or by the fact that the log already has the user's name
            return (logUid && userTag && logUid === userTag) || 
                   (log.userName === `${this.user.prenom} ${this.user.nom}`) ||
                   (log.user_name === `${this.user.prenom} ${this.user.nom}`);
        }))
      );
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
