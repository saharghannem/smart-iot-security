import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FirebaseService } from '../../services/firebase.service';
import { CapturedImage, ImageType } from '../../models/captured-image.model';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-images',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule
  ],
  templateUrl: './images.component.html',
  styleUrl: './images.component.css'
})
export class ImagesComponent implements OnInit, OnDestroy {
  images: CapturedImage[] = [];
  filteredImages: CapturedImage[] = [];

  dateFilter = new FormControl('');
  typeFilter = new FormControl<ImageType | ''>('');

  ImageType = ImageType;

  private subscriptions: Subscription[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadImages();

    // Écouter les changements de filtres
    this.dateFilter.valueChanges.subscribe(() => this.applyFilters());
    this.typeFilter.valueChanges.subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadImages(): void {
    const images$ = this.firebaseService.getCapturedImages(200);
    const securityAlerts$ = this.firebaseService.getSecurityAlerts(100);

    const sub = (combineLatest([images$, securityAlerts$]) as any).subscribe({
      next: ([images, alerts]: [any[], any[]]) => {
        const mappedAlerts: CapturedImage[] = alerts
          .filter(a => a.image_url)
          .map(a => {
            let type = ImageType.FACE_RECOGNITION;
            const t = (a.type || '').toLowerCase();
            if (t.includes('pir') || t.includes('mouvement') || t.includes('movement') || t.includes('suspicious')) {
                type = ImageType.INTRUSION;
            }
            
            return {
              id: a.id,
              url: a.image_url,
              storagePath: '', 
              timestamp: a.datetime || a.timestamp,
              type: type,
              location: a.location || 'Porte Principale'
            } as any;
          }); 

        const allImages = [...(images || []), ...mappedAlerts];

        // Sort by timestamp
        allImages.sort((a, b) => {
          const getT = (t: any) => {
            if (!t) return 0;
            if (t.toMillis) return t.toMillis();
            return new Date(t).getTime();
          };
          return getT(b.timestamp) - getT(a.timestamp);
        });

        this.images = allImages;
        this.applyFilters();
      },
      error: (error: any) => {
        console.error('Error loading images:', error);
        this.images = [];
        this.filteredImages = [];
      }
    });
    this.subscriptions.push(sub);
  }

  private applyFilters(): void {
    let filtered = [...this.images];

    // Filtre par date
    if (this.dateFilter.value) {
      const filterDate = new Date(this.dateFilter.value);
      filtered = filtered.filter(img => {
        const imgDate = img.timestamp?.toDate ? img.timestamp.toDate() : new Date(img.timestamp);
        return imgDate.toDateString() === filterDate.toDateString();
      });
    }

    // Filtre par type
    if (this.typeFilter.value) {
      filtered = filtered.filter(img => img.type === this.typeFilter.value);
    }

    this.filteredImages = filtered;
  }

  getTypeLabel(type: ImageType): string {
    switch (type) {
      case ImageType.ACCESS_LOG:
        return 'Log d\'accès';
      case ImageType.INTRUSION:
        return 'Intrusion';
      case ImageType.FACE_RECOGNITION:
        return 'Reconnaissance faciale';
      case ImageType.ESP32_CAM:
        return 'ESP32-CAM';
      default:
        return type;
    }
  }

  getTypeColor(type: ImageType): string {
    switch (type) {
      case ImageType.ACCESS_LOG:
        return 'primary';
      case ImageType.INTRUSION:
        return 'warn';
      case ImageType.FACE_RECOGNITION:
        return 'accent';
      case ImageType.ESP32_CAM:
        return '';
      default:
        return '';
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('fr-FR');
  }

  viewImage(url: string): void {
    window.open(url, '_blank');
  }

  async deleteImage(image: CapturedImage): Promise<void> {
    if (!confirm('Supprimer cette image définitivement ?')) return;
    try {
        await this.firebaseService.deleteSecurityAlert(image.id!, image.url);
        // Also remove from local lists for immediate UI feedback
        this.images = this.images.filter(img => img.id !== image.id);
        this.applyFilters();
    } catch (e) {
        console.error('Erreur suppression image:', e);
    }
  }

  clearFilters(): void {
    this.dateFilter.setValue('');
    this.typeFilter.setValue('');
  }
}

