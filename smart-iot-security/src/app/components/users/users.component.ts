import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { RecaptchaModule } from 'ng-recaptcha';
import { recaptchaConfig } from '../../config/recaptcha.config';
import { FirebaseService } from '../../services/firebase.service';
import { User } from '../../models/user.model';
import { RFIDCard, RFIDCardStatus } from '../../models/rfid-card.model';
import { ImageCropperDialogComponent } from './image-cropper-dialog/image-cropper-dialog.component';

import { Subscription, Observable, combineLatest, firstValueFrom } from 'rxjs';
import { map, startWith, shareReplay } from 'rxjs/operators';
import { Timestamp } from '@angular/fire/firestore';
import { UserDetailDialogComponent } from './user-detail-dialog/user-detail-dialog.component';

interface UserData {
  nom: string;
  prenom: string;
  email: string;
  matricule?: string;
  rfidCardId: string | null;
  role: string;
  isActive: boolean;
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
  accessStartTime?: string;
  accessEndTime?: string;
  photoUrl?: string;
  imageURL?: string;
  photoStoragePath?: string;
  poste?: string;
}

interface UserWithName extends User {
  name?: string;
  cardNumber?: string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    FormsModule,
    RecaptchaModule
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css'
})
export class UsersComponent implements OnInit, OnDestroy {
  displayedColumns: string[] = ['matricule', 'name', 'email', 'card', 'photo', 'actions'];
  users$: Observable<UserWithName[]>;
  rfidCards$: Observable<RFIDCard[]>;        // filtered: for the add/edit form dropdown
  allRfidCards$: Observable<RFIDCard[]>;     // all cards: for resolving card numbers in table
  userForm: FormGroup;
  showForm: boolean = false;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  editingUserId: string | null = null;
  editingUserSnapshot: User | null = null;

  hours: string[] = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutes: string[] = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Email Verification & Recaptcha
  isOtpSent: boolean = false;
  isEmailVerified: boolean = false;
  sentOtpCode: string = '';
  enteredOtpCode: string = '';
  isRecaptchaResolved: boolean = false;
  recaptchaSiteKey: string = recaptchaConfig.siteKey;
  
  // Search
  searchControl!: any;

  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private firebaseService: FirebaseService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.searchControl = this.fb.control('');
    this.userForm = this.fb.group({
      matricule: ['', Validators.required],
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      rfidCardId: [''],
      role: ['user'],
      isActive: [true],
      accessStartDate: [null],
      accessEndDate: [null],
      startHour: [''],
      startMinute: [''],
      endHour: [''],
      endMinute: [''],
      poste: ['', Validators.required]
    });

    // ALL cards — used to resolve card numbers in the table
    this.allRfidCards$ = this.firebaseService.getRFIDCards().pipe(
      startWith([]),
      shareReplay(1)
    );

    // AVAILABLE cards only — for the form dropdown
    this.rfidCards$ = this.firebaseService.getRFIDCards().pipe(
      map(cards => cards.filter(c => c.status === RFIDCardStatus.AVAILABLE || (this.editingUserId && c.id === this.editingUserSnapshot?.rfidCardId))),
      startWith([]),
      shareReplay(1)
    );

    const searchTerm$ = this.searchControl.valueChanges.pipe(
      startWith(''),
      map(v => (v || '').toString().toLowerCase())
    );

    this.users$ = (combineLatest([
      this.firebaseService.getUsers().pipe(startWith([])),
      this.allRfidCards$,   // ← use ALL cards for lookup
      searchTerm$
    ]) as any).pipe(
      map(([users, cards, term]: [User[], RFIDCard[], string]) => {
        const mapped = users.map(user => {
          const card = cards.find(c => c.id === user.rfidCardId);
          const end = user.accessEndDate instanceof Timestamp ? user.accessEndDate.toDate() : new Date(user.accessEndDate);
          const isExpired = user.accessEndDate && end < new Date();

          return {
            ...user,
            name: `${user.prenom || ''} ${user.nom || ''}`.trim(),
            cardNumber: card ? card.cardNumber : 'Aucune',
            isExpired: isExpired
          } as UserWithName;
        });

        if (!term) return mapped;
        return mapped.filter(u => 
          (u.nom?.toLowerCase() || '').includes(term) || 
          (u.prenom?.toLowerCase() || '').includes(term) || 
          (u.email?.toLowerCase() || '').includes(term) || 
          (u.matricule?.toLowerCase() || '').includes(term)
        );
      })
    );
  }

  async exportToPDF(): Promise<void> {
    this.snackBar.open('Génération du PDF...', '', { duration: 1500 });
    // Fetch directly — don't use users$ (has startWith([]) that resolves immediately)
    const [users, allCards] = await Promise.all([
      firstValueFrom(this.firebaseService.getUsers()),
      firstValueFrom(this.firebaseService.getRFIDCards())
    ]);
    const mapped = users.map((u: any) => {
      const card = allCards.find((c: any) => c.id === u.rfidCardId);
      return { ...u, cardNumber: card ? card.cardNumber : 'Aucune' };
    });
    if (!mapped.length) { this.snackBar.open('Aucun utilisateur à exporter.', 'Fermer', { duration: 3000 }); return; }
    this.firebaseService.exportUsersToPDF(mapped);
  }

  exportToCSV(): void {
    this.snackBar.open('Génération du CSV...', '', { duration: 1500 });
    Promise.all([
      firstValueFrom(this.firebaseService.getUsers()),
      firstValueFrom(this.firebaseService.getRFIDCards())
    ]).then(([users, allCards]) => {
      if (!users.length) { this.snackBar.open('Aucun utilisateur à exporter.', 'Fermer', { duration: 3000 }); return; }
      const headers = ['Matricule', 'Nom', 'Prenom', 'Email', 'Poste', 'Carte RFID', 'Role', 'Actif', 'Debut Acces', 'Fin Acces', 'Horaire Debut', 'Horaire Fin'];
      const rows = (users as any[]).map((u: any) => {
        const card = (allCards as any[]).find((c: any) => c.id === u.rfidCardId);
        return [
          u.matricule || '',
          u.nom || '',
          u.prenom || '',
          u.email || '',
          u.poste || '',
          card ? card.cardNumber : 'Aucune',
          u.role || 'user',
          u.isActive ? 'Oui' : 'Non',
          this.fmtDate(u.accessStartDate),
          this.fmtDate(u.accessEndDate),
          u.accessStartTime || '',
          u.accessEndTime || ''
        ];
      });
      this.downloadCSV('utilisateurs.csv', headers, rows);
    });
  }

  private fmtDate(val: any): string {
    if (!val) return '';
    try {
      const d = val?.toDate ? val.toDate() : new Date(val);
      return d.toLocaleDateString('fr-FR');
    } catch { return ''; }
  }

  private downloadCSV(filename: string, headers: string[], rows: any[][]): void {
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  viewUser(user: UserWithName): void {
    this.dialog.open(UserDetailDialogComponent, {
      data: user,
      width: '500px'
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Veuillez sélectionner un fichier image', 'Fermer', { duration: 3000 });
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        this.snackBar.open('L\'image est trop grande. Taille maximale: 5MB', 'Fermer', { duration: 3000 });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const imageUrl = e.target?.result as string;
        
        // Open Cropper Dialog
        const dialogRef = this.dialog.open(ImageCropperDialogComponent, {
          data: { imageUrl },
          width: '450px',
          disableClose: true
        });

        dialogRef.afterClosed().subscribe((croppedBlob: Blob | null) => {
          if (croppedBlob) {
            // Convert cropped Blob to File
            const croppedFile = new File([croppedBlob], file.name, { type: 'image/jpeg' });
            this.selectedFile = croppedFile;
            
            // Clean up old object URL if it exists
            if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(this.previewUrl);
            }
            this.previewUrl = URL.createObjectURL(croppedBlob);
          } else {
            // User cancelled cropping
            // If they didn't already have an image, clear it
            if (!this.previewUrl) {
               this.removePhoto();
            }
          }
          // Reset file input so same file can be selected again
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        });
      };
      reader.onerror = () => {
        this.snackBar.open('Erreur lors de la lecture de l\'image', 'Fermer', { duration: 3000 });
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto(): void {
    this.selectedFile = null;
    this.previewUrl = null;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.userForm.valid) {
      this.snackBar.open('Veuillez remplir tous les champs requis', 'Fermer', { duration: 3000 });
      return;
    }

    try {
      const formValue = this.userForm.value;
      const selectedFile = this.selectedFile;
      const rfidCardId = formValue.rfidCardId;
      const isEditing = !!this.editingUserId;
      let userId = this.editingUserId;

      // Construct time strings
      const accessStartTime = (formValue.startHour && formValue.startMinute)
        ? `${formValue.startHour}:${formValue.startMinute}`
        : null;
      const accessEndTime = (formValue.endHour && formValue.endMinute)
        ? `${formValue.endHour}:${formValue.endMinute}`
        : null;

      const userData: UserData = {
        nom: formValue.nom,
        prenom: formValue.prenom,
        email: formValue.email,
        matricule: formValue.matricule,
        rfidCardId: rfidCardId || null,
        role: formValue.role || 'user',
        isActive: formValue.isActive !== false,
        accessStartDate: formValue.accessStartDate,
        accessEndDate: formValue.accessEndDate,
        accessStartTime: accessStartTime || undefined,
        accessEndTime: accessEndTime || undefined,
        poste: formValue.poste
      };

      // Email unique check ONLY on new user creation
      if (!isEditing) {
        const emailExists = await this.firebaseService.checkEmailExists(userData.email);
        if (emailExists) {
          this.snackBar.open('Cet email est déjà utilisé par un autre utilisateur.', 'Fermer', { duration: 5000 });
          return;
        }
      }

      if (isEditing && userId) {
        // === MODE EDITION ===
        const oldUser = this.editingUserSnapshot;

        if (!oldUser) {
          this.snackBar.open('Erreur: Impossible de retrouver les données de l\'utilisateur', 'Fermer');
          return;
        }

        if (selectedFile) {
          // Resolve card number for naming BEFORE upload
          const cardList2 = await firstValueFrom(this.allRfidCards$);
          const editCard = cardList2.find(c => c.id === (rfidCardId || oldUser.rfidCardId));
          const editCardNum = editCard ? editCard.cardNumber.replace(/[^a-zA-Z0-9]/g, '_') : userId;

          const photoPath = `users/photos/${editCardNum}.jpg`;
          console.log('Target Photo Path:', photoPath);

          // 2. Delete old image from Cloudinary
          const oldPhotoInfo = oldUser.photoUrl || oldUser.imageURL || oldUser.photoStoragePath;
          if (oldPhotoInfo && oldPhotoInfo.includes('cloudinary.com')) {
            try { await this.firebaseService.deleteImage(oldPhotoInfo); } catch (e) { console.warn("Impossible de supprimer l'ancienne image", e); }
          }

          // 3. Upload new image as cardNumber.jpg
          try {
            console.log('Uploading file...');
            const photoUrl = await this.firebaseService.uploadImage(selectedFile, photoPath);
            userData.photoUrl = photoUrl;
            userData.imageURL = photoUrl;
            userData.photoStoragePath = photoPath;
            console.log('Upload successful:', photoUrl);
            this.snackBar.open(`Photo uploadée: ${editCardNum}.jpg`, 'Fermer', { duration: 3000 });
          } catch (error: unknown) {
            const uploadError = error as Error & { code?: string };
            if (uploadError.code === 'CORS_ERROR' || uploadError.message?.includes('CORS')) {
              this.handleCorsError(error);
            } else {
              this.snackBar.open('Erreur upload photo. Photo non mise à jour.', 'Fermer', { duration: 5000 });
            }
          }
        } else {
          // Pas de changement d'image - conserver les données existantes
          if (oldUser.photoUrl) userData.photoUrl = oldUser.photoUrl;
          if (oldUser.imageURL) userData.imageURL = oldUser.imageURL;
          if (oldUser.photoStoragePath) userData.photoStoragePath = oldUser.photoStoragePath;
        }

        // 4. Update userData
        await this.firebaseService.updateUser(userId, userData);

        // 5. Regenerate Badge & Send Email (on Modification)
        try {
          const cardList = await firstValueFrom(this.allRfidCards$);
          const selectedCard = cardList.find(c => c.id === rfidCardId);
          const cardNumber = selectedCard ? selectedCard.cardNumber : (userId || 'badge');
          const safeCardId = cardNumber.replace(/[^a-zA-Z0-9]/g, '_');

          // Delete OLD badge from Cloudinary before generating new one
          const snapOldUser = await firstValueFrom(this.firebaseService.getUsers());
          const oldUserData = snapOldUser.find((u: any) => u.id === userId) as any;
          if (oldUserData?.badgeUrl && oldUserData.badgeUrl.includes('cloudinary.com')) {
            await this.firebaseService.deleteImage(oldUserData.badgeUrl);
          }

          const badgeBlob = await this.firebaseService.generateBadgePDF(
            { ...userData, id: userId, cardNumber },
            this.previewUrl || undefined
          );
          const badgeUrl = await this.firebaseService.uploadBadge(badgeBlob, `users/badges/${safeCardId}`);

          // Save badge URL to Firestore for future deletion
          await this.firebaseService.updateUser(userId, { badgeUrl });

          await this.firebaseService.sendEmail(userData, 'welcome', badgeUrl);
          this.snackBar.open('Utilisateur mis à jour et nouveau badge envoyé.', 'Fermer', { duration: 4000 });
        } catch(e) {
          console.error("Erreur badge/email update:", e);
          this.snackBar.open('Utilisateur mis a jour (Erreur envoi badge)', 'Fermer', { duration: 3000 });
        }

        // 6. Update RFID Card
        if (oldUser.rfidCardId && oldUser.rfidCardId !== userData.rfidCardId) {
          await this.firebaseService.updateRFIDCard(oldUser.rfidCardId, {
            status: RFIDCardStatus.AVAILABLE,
            userId: null
          });
        }
        if (userData.rfidCardId) {
          await this.firebaseService.updateRFIDCard(userData.rfidCardId, {
            status: RFIDCardStatus.ASSIGNED,
            userId: userId
          });
        }

      } else {
        // === MODE CREATION ===

        if (!this.isEmailVerified) {
          this.snackBar.open("Veuillez vérifier l'adresse email d'abord.", "Fermer", { duration: 3000 });
          return;
        }

        if (!this.selectedFile) {
          this.snackBar.open("La photo de profil est obligatoire pour la création.", "Fermer", { duration: 3000 });
          return;
        }

        if (!this.isRecaptchaResolved) {
          this.snackBar.open("Veuillez valider le reCAPTCHA.", "Fermer", { duration: 3000 });
          return;
        }

        // 1. Créer l'utilisateur D'ABORD pour avoir un UID !!
        userId = await this.firebaseService.createUser(userData);

        // 2. Préparer et uploader l'image si sélectionnée
        let photoPath: string | null = null;
        let photoUrl: string | null = null;

        if (selectedFile) {
          // Use cardNumber as filename, fallback to userId
          const cardList0 = await firstValueFrom(this.allRfidCards$);
          const card0 = cardList0.find(c => c.id === rfidCardId);
          const safePhoto = card0 ? card0.cardNumber.replace(/[^a-zA-Z0-9]/g, '_') : userId;
          photoPath = `users/photos/${safePhoto}.jpg`;

          try {
            photoUrl = await this.firebaseService.uploadImage(selectedFile, photoPath);
            await this.firebaseService.updateUser(userId, {
              photoUrl,
              imageURL: photoUrl,
              photoStoragePath: photoPath
            });
            userData.photoUrl = photoUrl;
            userData.imageURL = photoUrl;
            console.log(`✅ Photo Cloudinary: ${safePhoto}.jpg`);
          } catch (error: unknown) {
            const uploadError = error as Error & { code?: string };
            if (uploadError.code === 'CORS_ERROR' || uploadError.message?.includes('CORS')) {
              this.handleCorsError(error);
            } else {
              this.snackBar.open('Erreur upload photo. Utilisateur créé sans photo.', 'Fermer', { duration: 5000 });
            }
          }
        }

        // 3. Assign RFID Card
        if (userData.rfidCardId) {
          await this.firebaseService.updateRFIDCard(userData.rfidCardId, {
            status: RFIDCardStatus.ASSIGNED,
            userId: userId
          });
        }

        // 4. Send Email & Badge (create flow)
        try {
          this.snackBar.open('Génération du badge...', 'Patientez', { duration: 2500 });
          const cardList = await firstValueFrom(this.allRfidCards$);
          const selectedCard = cardList.find(c => c.id === rfidCardId);
          const cardNumber = selectedCard ? selectedCard.cardNumber : 'N/A';
          const safeCardId = cardNumber.replace(/[^a-zA-Z0-9]/g, '_');

          const badgeBlob = await this.firebaseService.generateBadgePDF(
            { ...userData, id: userId, cardNumber },
            this.previewUrl || undefined
          );
          // Badge saved as: users/badges/A1B2C3D4_badge.jpg
          const badgeUrl = await this.firebaseService.uploadBadge(badgeBlob, `users/badges/${safeCardId}`);
          console.log('Badge URL for email:', badgeUrl);

          // Save badge URL to Firestore for future deletion
          await this.firebaseService.updateUser(userId, { badgeUrl });

          await this.firebaseService.sendEmail(userData, 'welcome', badgeUrl);
          this.snackBar.open('Utilisateur créé et badge envoyé!', 'Fermer', { duration: 4000 });
        } catch(e) {
          console.error('Erreur email/badge PDF:', e);
          this.snackBar.open('Utilisateur cree, mais erreur lors de la generation du badge ou de l\'envoi de l\'email.', 'Fermer', { duration: 6000 });
        }
      }

      this.resetForm();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      this.snackBar.open(`Erreur lors de l'operation: ${errorMessage}`, 'Fermer', { duration: 3000 });
    }
  }

  editUser(user: User): void {
    this.editingUserId = user.id!;
    this.editingUserSnapshot = user;

    const userWithName = user as UserWithName;
    const nom = user.nom || userWithName.name?.split(' ')[0] || '';
    const prenom = user.prenom || userWithName.name?.split(' ').slice(1).join(' ') || '';

    // Helper to convert Timestamp to Date if needed
    const toDate = (val: any) => val instanceof Timestamp ? val.toDate() : val;

    // Parse time strings
    let startHour = '', startMinute = '';
    if (user.accessStartTime) {
      [startHour, startMinute] = user.accessStartTime.split(':');
    }

    let endHour = '', endMinute = '';
    if (user.accessEndTime) {
      [endHour, endMinute] = user.accessEndTime.split(':');
    }

    this.userForm.patchValue({
      matricule: user.matricule || '',
      nom: nom,
      prenom: prenom,
      email: user.email,
      rfidCardId: user.rfidCardId || user.id || '',
      role: user.role || 'user',
      isActive: user.isActive !== false,
      accessStartDate: toDate(user.accessStartDate),
      accessEndDate: toDate(user.accessEndDate),
      startHour: startHour || '',
      startMinute: startMinute || '',
      endHour: endHour || '',
      endMinute: endMinute || '',
      poste: user.poste || ''
    });
    this.previewUrl = user.photoUrl || user.imageURL || null;
    this.selectedFile = null;
    this.showForm = true;
  }

  async deleteUser(user: any): Promise<void> {
    const userName = this.getUserFullName(user);

    if (!confirm(`Supprimer l'utilisateur ${userName} ?`)) return;

    try {
      // 1. Delete photo from Cloudinary
      const photoUrl = user.photoUrl || user.imageURL || user.photoStoragePath;
      if (photoUrl && photoUrl.includes('cloudinary.com')) {
        await this.firebaseService.deleteImage(photoUrl);
      }

      // 2. Delete badge from Cloudinary (stored as badgeUrl in Firestore)
      if (user.badgeUrl && user.badgeUrl.includes('cloudinary.com')) {
        await this.firebaseService.deleteImage(user.badgeUrl);
      }

      // 3. Free RFID card
      if (user.rfidCardId) {
        try {
          await this.firebaseService.updateRFIDCard(user.rfidCardId, {
            status: RFIDCardStatus.AVAILABLE,
            userId: null
          });
        } catch (e) { }
      }

      // 4. Delete from Firestore
      if (!user.id) {
        this.snackBar.open('ID utilisateur manquant', 'Fermer', { duration: 3000 });
        return;
      }
      await this.firebaseService.deleteUser(user.id);
      this.snackBar.open('Utilisateur supprimé avec succès', 'Fermer', { duration: 3000 });
    } catch (error: unknown) {
      this.snackBar.open('Erreur lors de la suppression', 'Fermer');
    }
  }

  getUserFullName(user: User): string {
    if (user.nom && user.prenom) {
      return `${user.nom} ${user.prenom}`;
    }
    const userWithName = user as UserWithName;
    if (userWithName.name) {
      return userWithName.name;
    }
    return user.email;
  }

  resetForm(): void {
    this.showForm = false;
    this.editingUserId = null;
    this.editingUserSnapshot = null;
    this.selectedFile = null;
    this.previewUrl = null;
    this.userForm.reset({
      role: 'user',
      isActive: true
    });
    this.isOtpSent = false;
    this.isEmailVerified = false;
    this.sentOtpCode = '';
    this.enteredOtpCode = '';
    this.isRecaptchaResolved = false;
  }

  async sendVerificationCode(): Promise<void> {
    const email = this.userForm.get('email')?.value;
    const nom = this.userForm.get('nom')?.value || 'Utilisateur';

    if (!email || this.userForm.get('email')?.invalid) {
      this.snackBar.open('Veuillez entrer un email valide d\'abord.', 'Fermer', { duration: 3000 });
      return;
    }

    this.sentOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.isOtpSent = true;
    this.isEmailVerified = false;
    this.enteredOtpCode = '';

    try {
      this.snackBar.open("Envoi du code de vérification...", 'Patientez', { duration: 2000 });
      await this.firebaseService.sendEmail({ email, nom, prenom: '' }, 'otp', undefined, this.sentOtpCode);
      this.snackBar.open('Code envoyé! Vérifiez votre boîte mail.', 'Fermer', { duration: 4000 });
    } catch(e) {
      console.error('❌ OTP Send Error:', e);
      // Ensure we reset state safely to avoid NG0100
      setTimeout(() => { 
        this.snackBar.open("Échec de l'envoi du code. Vérifiez EmailJS.", "Fermer", { duration: 4000 }); 
        this.isOtpSent = false; 
      }, 0);
    }
  }

  checkOtpCode(): void {
    if (this.enteredOtpCode === this.sentOtpCode) {
      this.isEmailVerified = true;
      this.snackBar.open("Email vérifié avec succès !", "Fermer", { duration: 3000 });
    } else {
      this.isEmailVerified = false;
    }
  }

  onRecaptchaResolved(captchaResponse: string | null): void {
    if (captchaResponse) {
      this.isRecaptchaResolved = true;
    } else {
      this.isRecaptchaResolved = false;
    }
  }

  private handleCorsError(error: unknown): void {
    const uploadError = error as Error & { code?: string };
    const corsMessage = '❌ CORS NOT CONFIGURED: Photo upload blocked.';
    this.snackBar.open(corsMessage, 'Fermer', { duration: 15000, panelClass: ['error-snackbar'] });
  }
}
