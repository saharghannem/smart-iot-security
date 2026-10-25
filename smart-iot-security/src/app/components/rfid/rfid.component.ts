import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { FirebaseService } from '../../services/firebase.service';
import { RFIDCard, RFIDCardStatus } from '../../models/rfid-card.model';
import { User } from '../../models/user.model';
import { Observable, combineLatest, firstValueFrom } from 'rxjs';
import { map, shareReplay, startWith } from 'rxjs/operators';
import { RFIDDetailDialogComponent } from './rfid-detail-dialog/rfid-detail-dialog.component';

@Component({
  selector: 'app-rfid',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatMenuModule
  ],
  templateUrl: './rfid.component.html',
  styleUrl: './rfid.component.css'
})
export class RFIDComponent implements OnInit {
  displayedColumns: string[] = ['cardNumber', 'status', 'user', 'createdAt', 'actions'];
  cards$: Observable<(RFIDCard & { userName?: string })[]>;
  cardForm: FormGroup;
  showForm: boolean = false;
  editingCardId: string | null = null;
  RFIDCardStatus = RFIDCardStatus;

  // Search
  searchControl = new FormControl('');

  constructor(
    private fb: FormBuilder,
    private firebaseService: FirebaseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.cardForm = this.fb.group({
      cardNumber: ['', [Validators.required, Validators.pattern(/^[0-9A-Fa-f]+$/)]],
      status: [RFIDCardStatus.AVAILABLE]
    });

    const cardsObs = this.firebaseService.getRFIDCards().pipe(startWith([]));
    const usersObs = this.firebaseService.getUsers().pipe(startWith([]));
    const searchTerm$ = this.searchControl.valueChanges.pipe(
      startWith(''),
      map(v => (v || '').toLowerCase())
    );

    this.cards$ = (combineLatest([cardsObs, usersObs, searchTerm$]) as any).pipe(
      map(([cards, users, term]: [any[], any[], string]) => {
        const mapped = cards.map(card => {
          const user = users.find(u => u.id === card.userId);
          return {
            ...card,
            userName: user ? `${user.nom} ${user.prenom}` : 'Non assignée'
          };
        });

        if (!term) return mapped;
        return mapped.filter(c => 
          c.cardNumber.toLowerCase().includes(term) || 
          (c.userName?.toLowerCase() || '').includes(term)
        );
      }),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
  }

  viewCard(card: RFIDCard): void {
    this.dialog.open(RFIDDetailDialogComponent, {
      data: card,
      width: '450px'
    });
  }

  async exportRFID(filter: 'all' | 'used' | 'available' = 'all'): Promise<void> {
    // Fetch directly — cards$ uses startWith([]) which resolves immediately as empty
    const [rawCards, users] = await Promise.all([
      firstValueFrom(this.firebaseService.getRFIDCards()),
      firstValueFrom(this.firebaseService.getUsers())
    ]);
    const allCards = (rawCards as any[]).map((card: any) => {
      const user = (users as any[]).find((u: any) => u.id === card.userId);
      return { ...card, userName: user ? `${user.nom} ${user.prenom}` : 'Non assignée' };
    });

    let filtered: any[] = allCards;
    if (filter === 'used') {
      filtered = allCards.filter((c: any) => c.status === RFIDCardStatus.ASSIGNED);
    } else if (filter === 'available') {
      filtered = allCards.filter((c: any) => c.status === RFIDCardStatus.AVAILABLE);
    }

    if (!filtered.length) {
      this.snackBar.open('Aucune carte à exporter pour ce filtre.', 'Fermer', { duration: 3000 });
      return;
    }

    const headers = ['Numéro de Carte', 'Statut', 'Utilisateur Assigné', 'Date Création'];
    const statusLabel = (s: string) =>
      s === RFIDCardStatus.ASSIGNED ? 'Assignée' :
      s === RFIDCardStatus.AVAILABLE ? 'Disponible' : 'Désactivée';

    const rows = filtered.map((c: any) => [
      c.cardNumber,
      statusLabel(c.status),
      c.userName || 'Non assignée',
      c.createdAt ? new Date(c.createdAt?.toDate ? c.createdAt.toDate() : c.createdAt).toLocaleDateString('fr-FR') : '-'
    ]);

    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((r: any[]) => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartes_rfid_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.snackBar.open(`Export CSV (${filter}) — ${filtered.length} cartes`, 'Fermer', { duration: 3000 });
  }

  async exportRFIDPDF(filter: 'all' | 'used' | 'available' = 'all'): Promise<void> {
    const [rawCards, users] = await Promise.all([
      firstValueFrom(this.firebaseService.getRFIDCards()),
      firstValueFrom(this.firebaseService.getUsers())
    ]);
    const allCards = (rawCards as any[]).map((card: any) => {
      const user = (users as any[]).find((u: any) => u.id === card.userId);
      return { ...card, userName: user ? `${user.nom} ${user.prenom}` : 'Non assignée' };
    });
    let filtered2: any[] = allCards;
    if (filter === 'used') filtered2 = allCards.filter((c: any) => c.status === RFIDCardStatus.ASSIGNED);
    else if (filter === 'available') filtered2 = allCards.filter((c: any) => c.status === RFIDCardStatus.AVAILABLE);
    this.firebaseService.exportRFIDToPDF(filtered2, filter);
  }

  async onSubmit(): Promise<void> {
    if (this.cardForm.valid) {
      try {
        const isEditing = !!this.editingCardId;

        if (isEditing) {
          await this.firebaseService.updateRFIDCard(this.editingCardId!, this.cardForm.value);
          this.snackBar.open('Carte RFID modifiée avec succès', 'Fermer', { duration: 3000 });
        } else {
          await this.firebaseService.createRFIDCard(this.cardForm.value);
          this.snackBar.open('Carte RFID créée avec succès', 'Fermer', { duration: 3000 });
        }

        this.resetForm();
      } catch (error) {
        this.snackBar.open('Erreur lors de l\'opération', 'Fermer', { duration: 3000 });
      }
    }
  }

  editCard(card: RFIDCard): void {
    this.editingCardId = card.id!;
    this.cardForm.patchValue({
      cardNumber: card.cardNumber,
      status: card.status
    });
    this.showForm = true;
  }

  async deleteCard(card: RFIDCard): Promise<void> {
    if (confirm(`Supprimer la carte ${card.cardNumber} ?`)) {
      try {
        await this.firebaseService.deleteRFIDCard(card.id!);
        this.snackBar.open('Carte supprimée', 'Fermer', { duration: 3000 });
      } catch (error) {
        this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
      }
    }
  }

  async toggleCardStatus(card: RFIDCard): Promise<void> {
    const newStatus = card.status === RFIDCardStatus.DISABLED
      ? RFIDCardStatus.AVAILABLE
      : RFIDCardStatus.DISABLED;

    try {
      await this.firebaseService.updateRFIDCard(card.id!, { status: newStatus });
      this.snackBar.open('Statut de la carte mis à jour', 'Fermer', { duration: 3000 });
    } catch (error) {
      this.snackBar.open('Erreur lors de la mise à jour', 'Fermer', { duration: 3000 });
    }
  }

  getStatusColor(status: RFIDCardStatus): string {
    switch (status) {
      case RFIDCardStatus.AVAILABLE:
        return 'primary';
      case RFIDCardStatus.ASSIGNED:
        return 'accent';
      case RFIDCardStatus.DISABLED:
        return 'warn';
      default:
        return '';
    }
  }

  getStatusLabel(status: RFIDCardStatus): string {
    switch (status) {
      case RFIDCardStatus.AVAILABLE:
        return 'Disponible';
      case RFIDCardStatus.ASSIGNED:
        return 'Attribuée';
      case RFIDCardStatus.DISABLED:
        return 'Désactivée';
      default:
        return '';
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('fr-FR');
  }

  resetForm(): void {
    this.cardForm.reset({ status: RFIDCardStatus.AVAILABLE });
    this.showForm = false;
    this.editingCardId = null;
  }
}
