import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<FirebaseUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private auth: Auth,
    private router: Router,
    private zone: NgZone
  ) {
    // Écouter les changements d'état d'authentification
    onAuthStateChanged(this.auth, (user) => {
      this.zone.run(() => {
        this.currentUserSubject.next(user);
      });
    });
  }

  async login(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      throw new Error(this.getErrorMessage(firebaseError.code || 'unknown'));
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.zone.run(() => {
      this.router.navigate(['/login']);
    });
  }

  getCurrentUser(): FirebaseUser | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  private getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'Utilisateur non trouvé';
      case 'auth/wrong-password':
        return 'Mot de passe incorrect';
      case 'auth/invalid-email':
        return 'Email invalide';
      case 'auth/user-disabled':
        return 'Compte désactivé';
      case 'unknown':
        return 'Erreur de connexion';
      default:
        return 'Erreur de connexion';
    }
  }
}

