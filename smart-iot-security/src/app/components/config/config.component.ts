import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FirebaseService } from '../../services/firebase.service';
import { SystemConfig } from '../../models/config.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './config.component.html',
  styleUrl: './config.component.css'
})
export class ConfigComponent implements OnInit, OnDestroy {
  configForm: FormGroup;
  isLoading = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private firebaseService: FirebaseService,
    private snackBar: MatSnackBar
  ) {
    this.configForm = this.fb.group({
      buzzerEnabled: [true],
      vibrationLevel: [50, [Validators.min(0), Validators.max(100)]],
      pirEnabled: [true],
      pirSensitivity: [50, [Validators.min(0), Validators.max(100)]],
      nightMode: [false],
      activationDelay: [1000, [Validators.min(0), Validators.max(10000)]],
      allowedHoursStart: ['08:00'],
      allowedHoursEnd: ['20:00']
    });
  }

  ngOnInit(): void {
    this.loadConfig();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadConfig(): void {
    this.isLoading = true;
    const sub = this.firebaseService.getConfig().subscribe({
      next: (config: SystemConfig | null) => {
        if (config) {
          this.configForm.patchValue({
            buzzerEnabled: config.buzzerEnabled ?? true,
            vibrationLevel: config.vibrationLevel ?? 50,
            pirEnabled: config.pirEnabled ?? true,
            pirSensitivity: config.pirSensitivity ?? 50,
            nightMode: config.nightMode ?? false,
            activationDelay: config.activationDelay ?? 1000,
            allowedHoursStart: config.allowedHours?.start ?? '08:00',
            allowedHoursEnd: config.allowedHours?.end ?? '20:00'
          });
        }
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading config:', error);
        this.snackBar.open('Erreur lors du chargement de la configuration', 'Fermer', { duration: 3000 });
        this.isLoading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  async saveConfig(): Promise<void> {
    if (this.configForm.invalid) {
      this.snackBar.open('Veuillez vérifier les valeurs saisies', 'Fermer', { duration: 3000 });
      return;
    }

    try {
      const formValue = this.configForm.value;
      const config: SystemConfig = {
        buzzerEnabled: formValue.buzzerEnabled,
        vibrationLevel: formValue.vibrationLevel,
        pirEnabled: formValue.pirEnabled,
        pirSensitivity: formValue.pirSensitivity,
        nightMode: formValue.nightMode,
        activationDelay: formValue.activationDelay,
        allowedHours: {
          start: formValue.allowedHoursStart,
          end: formValue.allowedHoursEnd
        }
      };

      await this.firebaseService.saveConfig(config);
      this.snackBar.open('Configuration sauvegardée avec succès', 'Fermer', { duration: 3000 });
    } catch (error) {
      console.error('Error saving config:', error);
      this.snackBar.open('Erreur lors de la sauvegarde', 'Fermer', { duration: 3000 });
    }
  }

  resetToDefaults(): void {
    if (confirm('Réinitialiser la configuration aux valeurs par défaut ?')) {
      this.configForm.patchValue({
        buzzerEnabled: true,
        vibrationLevel: 50,
        pirEnabled: true,
        pirSensitivity: 50,
        nightMode: false,
        activationDelay: 1000,
        allowedHoursStart: '08:00',
        allowedHoursEnd: '20:00'
      });
    }
  }

  formatLabel(value: number): string {
    return `${value}%`;
  }
}

