import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Notification, NotificationType } from '../models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new Subject<Notification>();
  public notifications$ = this.notificationSubject.asObservable();

  // Simule la connexion WebSocket (à remplacer par une vraie connexion)
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isConnecting = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // WebSocket notifications disabled for now - will be enabled when backend is ready
    // To enable: uncomment the line below
    // if (typeof window !== 'undefined') {
    //   this.initializeWebSocket();
    // }
  }

  private initializeWebSocket(): void {
    // Éviter les tentatives multiples simultanées
    if (this.isConnecting || (this.wsConnection && this.wsConnection.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Arrêter les tentatives après plusieurs échecs
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Ne pas logger à chaque fois, seulement la première fois
      if (this.reconnectAttempts === this.maxReconnectAttempts) {
        console.info('WebSocket: Notification server unavailable. Running in offline mode.');
      }
      return;
    }

    // URL du backend Java WebSocket
    const wsUrl = 'ws://localhost:8080/notifications';
    
    try {
      this.isConnecting = true;
      this.wsConnection = new WebSocket(wsUrl);
      
      // Supprimer les listeners précédents pour éviter les fuites mémoire
      this.wsConnection.onerror = null;
      this.wsConnection.onclose = null;
      
      this.wsConnection.onopen = () => {
        console.info('WebSocket: Connected to notification server');
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset counter on successful connection
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const notification: Notification = JSON.parse(event.data);
          this.notificationSubject.next(notification);
        } catch (error) {
          console.warn('WebSocket: Failed to parse notification:', error);
        }
      };

      this.wsConnection.onerror = () => {
        this.isConnecting = false;
        // Supprimer complètement le logging d'erreur - c'est attendu si le serveur n'est pas disponible
        // L'erreur sera gérée silencieusement dans onclose
      };

      this.wsConnection.onclose = (event) => {
        this.isConnecting = false;
        
        // Ne pas reconnecter si c'était une fermeture normale ou si on a atteint le max
        if (event.wasClean || this.reconnectAttempts >= this.maxReconnectAttempts) {
          // Ne logger qu'une seule fois au début
          if (!event.wasClean && this.reconnectAttempts === 0) {
            // Logger seulement en mode développement ou si nécessaire
            // console.debug('WebSocket: Server unavailable. Running in offline mode.');
          }
          return;
        }

        // Reconnexion automatique avec backoff exponentiel
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30s
        
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
          this.initializeWebSocket();
        }, delay);
      };
    } catch (error) {
      this.isConnecting = false;
      // Ne pas logger - c'est attendu si WebSocket n'est pas supporté
    }
  }

  // Méthode pour créer une notification manuellement (pour tests)
  createNotification(notification: Notification): void {
    this.notificationSubject.next(notification);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  reconnect(): void {
    this.reconnectAttempts = 0;
    this.disconnect();
    this.initializeWebSocket();
  }
}

