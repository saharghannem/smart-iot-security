import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { AccessStatus } from '../../../models/access-log.model';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-event-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule, MatChipsModule],
  template: `
    <div class="event-detail-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>{{ getDialogTitle() }}</h2>
        <button mat-icon-button mat-dialog-close>
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <div class="event-content">
          @if (data.imageURL || data.image) {
            <div class="image-section">
              <img [src]="data.imageURL || data.image" alt="Capture d'événement" class="event-image">
              <p class="image-label">Capture à l'instant T</p>
            </div>
          }

          <div class="info-summary">
            <div class="status-box" [class]="getStatusClass(data)">
              <mat-icon>{{ getStatusIcon(data) }}</mat-icon>
              <span>{{ getStatusLabel(data) }}</span>
            </div>
            <div class="time-box">
              <mat-icon>schedule</mat-icon>
              <span>{{ formatDate(data.timestamp) }}</span>
            </div>
          </div>

          <mat-divider></mat-divider>

          <div class="info-grid bounce-in">
            @if (!data.detectedBy) {
              <!-- Access Log Specific -->
              <div class="info-item">
                <mat-icon>credit_card</mat-icon>
                <div class="info-texts">
                  <span class="label">Carte RFID</span>
                  <span class="value">{{ data.cardNumber }}</span>
                </div>
              </div>
              <div class="info-item">
                <mat-icon>sensor_door</mat-icon>
                <div class="info-texts">
                  <span class="label">État de la porte</span>
                  <span class="value">{{ data.doorState }}</span>
                </div>
              </div>
              <div class="info-item">
                <mat-icon>face</mat-icon>
                <div class="info-texts">
                  <span class="label">Reconnaissance Faciale</span>
                  <span class="value">{{ data.facialMatch ? 'Match Found' : 'No Match' }}</span>
                </div>
              </div>
            } @else {
              <!-- Intrusion Specific -->
              <div class="info-item">
                <mat-icon>visibility</mat-icon>
                <div class="info-texts">
                  <span class="label">Détecté par</span>
                  <span class="value">{{ data.detectedBy }}</span>
                </div>
              </div>
              <div class="info-item">
                <mat-icon>priority_high</mat-icon>
                <div class="info-texts">
                  <span class="label">Sévérité</span>
                  <mat-chip [color]="getSeverityColor(data.severity)" selected>
                    {{ data.severity }}
                  </mat-chip>
                </div>
              </div>
              <div class="info-item">
                <mat-icon>check_circle</mat-icon>
                <div class="info-texts">
                  <span class="label">Statut Résolution</span>
                  <span class="value">{{ data.resolved ? 'Résolu' : 'Non résolu' }}</span>
                </div>
              </div>
              @if (data.notes) {
                <div class="info-item" style="grid-column: span 2;">
                  <mat-icon>info</mat-icon>
                  <div class="info-texts">
                    <span class="label">Informations Complémentaires</span>
                    <span class="value">{{ data.notes }}</span>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-raised-button color="primary" mat-dialog-close>Fermer</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .event-detail-container {
      padding: 16px;
      min-width: 450px;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .dialog-header h2 { margin: 0; }
    .event-content { display: flex; flex-direction: column; gap: 20px; }
    .image-section {
      width: 100%;
      text-align: center;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
    }
    .event-image {
      max-width: 100%;
      max-height: 300px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .image-label { font-size: 0.8rem; color: #777; margin-top: 8px; font-style: italic; }
    .info-summary { display: flex; gap: 16px; justify-content: center; }
    .status-box, .time-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .status-box.granted { background: #e8f5e9; color: #388e3c; }
    .status-box.denied { background: #ffebee; color: #d32f2f; }
    .status-box.intrusion { background: #fff3e0; color: #f57c00; }
    .time-box { background: #f1f3f4; color: #5f6368; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .info-item { display: flex; gap: 12px; align-items: flex-start; }
    .info-item mat-icon { color: #5f6368; }
    .info-texts { display: flex; flex-direction: column; }
    .label { font-size: 0.7rem; color: #777; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .value { font-size: 1rem; color: #202124; font-weight: 500; }
  `]
})
export class EventDetailDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) { }

  getDialogTitle(): string {
    return this.data.detectedBy ? "Détails de l'Intrusion" : "Détails de l'Accès";
  }

  getStatusClass(data: any): string {
    if (data.detectedBy) return 'intrusion';
    return data.status === AccessStatus.GRANTED ? 'granted' : 'denied';
  }

  getStatusIcon(data: any): string {
    if (data.detectedBy) return 'warning';
    return data.status === AccessStatus.GRANTED ? 'check_circle' : 'cancel';
  }

  getStatusLabel(data: any): string {
    if (data.detectedBy) return 'Intrusion';
    return data.status === AccessStatus.GRANTED ? 'Accès Autorisé' : 'Accès Refusé';
  }

  getSeverityColor(severity: string): string {
    switch (severity) {
      case 'low': return 'primary';
      case 'medium': return 'accent';
      case 'high': return 'warn';
      default: return '';
    }
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toLocaleString('fr-FR');
  }
}
