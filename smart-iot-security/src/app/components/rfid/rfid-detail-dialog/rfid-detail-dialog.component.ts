import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { RFIDCard, RFIDCardStatus } from '../../../models/rfid-card.model';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-rfid-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule, MatChipsModule],
  template: `
    <div class="rfid-detail-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>Détails de la Carte RFID</h2>
        <button mat-icon-button mat-dialog-close>
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <div class="rfid-content">
          <div class="main-info">
            <mat-icon class="card-icon" [color]="getStatusColor(card.status)">credit_card</mat-icon>
            <div class="card-title">
              <h3>{{ card.cardNumber }}</h3>
              <mat-chip-listbox>
                <mat-chip [color]="getStatusColor(card.status)" selected>
                  {{ getStatusLabel(card.status) }}
                </mat-chip>
              </mat-chip-listbox>
            </div>
          </div>

          <mat-divider></mat-divider>

          <div class="info-grid">
            <div class="info-item">
              <mat-icon>event</mat-icon>
              <div class="info-texts">
                <span class="label">Créée le</span>
                <span class="value">{{ formatDate(card.createdAt) }}</span>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>update</mat-icon>
              <div class="info-texts">
                <span class="label">Dernière mise à jour</span>
                <span class="value">{{ formatDate(card.updatedAt) || 'N/A' }}</span>
              </div>
            </div>

            <div class="info-item full-width">
              <mat-icon>person</mat-icon>
              <div class="info-texts">
                <span class="label">Utilisateur assigné</span>
                <span class="value">{{ card.userName || 'Aucun utilisateur' }}</span>
                @if (card.userId) {
                  <p class="hint">Cet utilisateur est lié à cette carte RFID.</p>
                }
              </div>
            </div>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-raised-button color="primary" mat-dialog-close>Fermer</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .rfid-detail-container {
      padding: 16px;
      min-width: 400px;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .dialog-header h2 {
      margin: 0;
    }
    .rfid-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .main-info {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .card-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
    }
    .card-title h3 {
      margin: 0 0 8px 0;
      font-size: 1.8rem;
      letter-spacing: 2px;
      font-family: monospace;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .info-item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .full-width {
      grid-column: span 2;
    }
    .info-item mat-icon {
      color: #757575;
    }
    .info-texts {
      display: flex;
      flex-direction: column;
    }
    .label {
      font-size: 0.75rem;
      color: #757575;
      text-transform: uppercase;
      font-weight: 600;
    }
    .value {
      font-size: 1rem;
      color: #333;
      font-weight: 500;
    }
    .hint {
      margin: 4px 0 0 0;
      font-size: 0.8rem;
      color: #999;
      font-style: italic;
    }
  `]
})
export class RFIDDetailDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public card: RFIDCard) { }

  getStatusColor(status: RFIDCardStatus): string {
    switch (status) {
      case RFIDCardStatus.AVAILABLE: return 'primary';
      case RFIDCardStatus.ASSIGNED: return 'accent';
      case RFIDCardStatus.DISABLED: return 'warn';
      default: return '';
    }
  }

  getStatusLabel(status: RFIDCardStatus): string {
    switch (status) {
      case RFIDCardStatus.AVAILABLE: return 'Disponible';
      case RFIDCardStatus.ASSIGNED: return 'Attribuée';
      case RFIDCardStatus.DISABLED: return 'Désactivée';
      default: return '';
    }
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toLocaleString('fr-FR');
  }
}
