import { Injectable, NgZone } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  docData,
  collectionData,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  getDoc,
  query as firestoreQuery
} from '@angular/fire/firestore';
// Firebase Storage removed — using Cloudinary for all image uploads
import {
  Database,
  ref as rtdbRef,
  listVal,
  query as rtdbQuery,
  limitToLast,
  orderByChild,
  set as rtdbSet
} from '@angular/fire/database';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import { DoorStatus } from '../models/door-status.model';
import { cloudinaryConfig } from '../config/cloudinary.config';
import { emailjsConfig } from '../config/emailjs.config';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  constructor(
    private firestore: Firestore,
    private rtdb: Database,
    private ngZone: NgZone
  ) { }

  // ========== USERS ==========

  getUsers(): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'users'), orderBy('nom'));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  getUsersStream(): Observable<any[]> {
    return this.getUsers();
  }

  async createUser(userData: any): Promise<string> {
    const docRef = await addDoc(collection(this.firestore, 'users'), {
      ...userData,
      createdAt: serverTimestamp(),
      isActive: true
    });
    return docRef.id;
  }

  async updateUser(id: string, userData: any): Promise<void> {
    const ref = doc(this.firestore, 'users', id);
    await updateDoc(ref, {
      ...userData,
      updatedAt: serverTimestamp()
    });
  }

  async deleteUser(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', id);
    await deleteDoc(ref);
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const q = firestoreQuery(collection(this.firestore, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  }

  // ========== SYSTEM CONFIG ==========

  getSystemConfig(): Observable<any> {
    return docData(doc(this.firestore, 'system/config')).pipe(catchError(() => of({})));
  }

  getConfig(): Observable<any> {
    return this.getSystemConfig();
  }

  async updateSystemConfig(data: any): Promise<void> {
    const ref = doc(this.firestore, 'system/config');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
    } else {
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }
  }

  async saveConfig(config: any): Promise<void> {
    return this.updateSystemConfig(config);
  }

  // ========== DOOR STATUS ==========

  getDoorStatus(doorId: string = 'main_door'): Observable<DoorStatus | any> {
    return docData(doc(this.firestore, 'doors', doorId)).pipe(catchError(() => of(null)));
  }

  getDoorStatusHistory(doorId: string = 'main_door', count: number = 50): Observable<any[]> {
    const firestoreRef = collection(this.firestore, 'door_status');
    const q = firestoreQuery(firestoreRef, orderBy('timestamp', 'desc'), limit(count));
    
    return collectionData(q, { idField: 'id' }).pipe(
      catchError(() => {
        // Fallback if index is missing in Firestore
        const fallbackQ = firestoreQuery(firestoreRef, limit(count));
        return collectionData(fallbackQ, { idField: 'id' }).pipe(
          map(list => (list || []).sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)))
        );
      }),
      switchMap(fsData => {
        if (fsData && fsData.length > 0) {
          return of(fsData);
        }
        // If Firestore is empty, try RTDB
        return this.getRTDBData('door_status', count);
      }),
      catchError(() => of([]))
    );
  }

  // Envoie une commande matérielle ("Ouvrir / Fermer la porte depuis le web / Urgence")
  async triggerManualDoorAction(action: 'OPEN' | 'CLOSE' | 'EMERGENCY', doorId: string = 'main_door'): Promise<void> {
    // 1. Envoyer une commande temps-réel à l'ESP32 / RTDB
    try {
      const commandRef = rtdbRef(this.rtdb, `commands/${doorId}`);
      await rtdbSet(commandRef, {
        action: action,
        timestamp: Date.now(),
        source: 'web_admin'
      });
      // 2. Mettre à jour l'interface Firestore (le statut temporaire)
      const firestoreRef = doc(this.firestore, 'doors', doorId);
      if (action === 'OPEN') {
        await updateDoc(firestoreRef, { 
          status: "closed", 
          command: "OPEN",
          lastActionAt: 4122867,
          lastManualActionAt: Date.now(),
          datetime: "2026-03-28 16:13:20"
        }).catch(() => { /* Le doc n'existe pas encore */ });
      } else if (action === 'EMERGENCY') {
        await updateDoc(firestoreRef, { 
          status: "closed", 
          command: "EMERGENCY",
          lastActionAt: 4122867,
          lastManualActionAt: Date.now(),
          datetime: "2026-03-28 16:13:20"
        }).catch(() => { /* Le doc n'existe pas encore */ });
      } else {
        await updateDoc(firestoreRef, { 
          status: 'closed', 
          command: "CLOSE",
          lastManualActionAt: Date.now() 
        }).catch(() => { /* Le doc n'existe pas encore */ });
      }
    } catch (error) {
      console.error(`Erreur lors de l'envoi de la commande ${action} :`, error);
    }
  }

  // ========== RFID CARDS ==========

  getRFIDCards(): Observable<any[]> {
    const colRef = collection(this.firestore, 'rfid_cards');
    return collectionData(colRef, { idField: 'id' }).pipe(catchError(() => of([])));
  }

  async createRFIDCard(cardData: any): Promise<void> {
    await addDoc(collection(this.firestore, 'rfid_cards'), {
      ...cardData,
      createdAt: serverTimestamp(),
      isActive: true
    });
  }

  async updateRFIDCard(id: string, cardData: any): Promise<void> {
    const ref = doc(this.firestore, 'rfid_cards', id);
    await updateDoc(ref, cardData);
  }

  async deleteRFIDCard(id: string): Promise<void> {
    const ref = doc(this.firestore, 'rfid_cards', id);
    await deleteDoc(ref);
  }

  // ========== LOGS & EVENTS ==========

  getAccessLogs(limitCount: number = 50): Observable<any[]> {
    const logsRef = rtdbRef(this.rtdb, 'access_logs');
    // We'll fetch and sort on client-side to avoid "Index not defined" errors 
    // until rule ".indexOn": "timestamp" is applied in Firebase Console.
    return listVal(logsRef, { keyField: 'id' }).pipe(
      map(logs => {
        const arr = (logs || []) as any[];
        return arr.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limitCount);
      }),
      catchError(() => of([]))
    );
  }

  getRTDBData(path: string, limitCount: number = 50): Observable<any[]> {
    const logsRef = rtdbRef(this.rtdb, path);
    return listVal(logsRef, { keyField: 'id' }).pipe(
      map(data => {
        const arr = (data || []) as any[];
        return arr.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limitCount);
      }),
      catchError(() => of([]))
    );
  }

  getFirestoreAccessLogs(limitCount: number = 50): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'access_logs'), orderBy('timestamp', 'desc'), limit(limitCount));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  getCapturedImages(limitCount: number = 100): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'captured_images'), orderBy('timestamp', 'desc'), limit(limitCount));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  getIntrusions(): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'intrusions'), orderBy('timestamp', 'desc'), limit(100));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  async updateIntrusion(id: string, data: any): Promise<void> {
    const ref = doc(this.firestore, 'intrusions', id);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  getSecurityAlerts(limitCount: number = 100): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'security_alerts'), orderBy('timestamp', 'desc'), limit(limitCount));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  async updateSecurityAlert(id: string, data: any): Promise<void> {
    const ref = doc(this.firestore, 'security_alerts', id);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  // ========== NOTIFICATIONS ==========

  getNotifications(): Observable<any[]> {
    const q = firestoreQuery(collection(this.firestore, 'notifications'), orderBy('timestamp', 'desc'), limit(50));
    return collectionData(q, { idField: 'id' }).pipe(catchError((err: any) => {
      console.error('❌ Error in getUsers:', err);
      return of([]);
    }));
  }

  async markNotificationAsRead(id: string): Promise<void> {
    const ref = doc(this.firestore, 'notifications', id);
    await updateDoc(ref, { read: true });
  }

  // ========== DELETION ==========
  async deleteSecurityAlert(id: string, imageUrl?: string): Promise<void> {
    const ref = doc(this.firestore, 'security_alerts', id);
    await deleteDoc(ref);
    if (imageUrl) await this.deleteImage(imageUrl);
  }

  async deleteIntrusion(id: string, imageUrl?: string): Promise<void> {
    const ref = doc(this.firestore, 'intrusions', id);
    await deleteDoc(ref);
    if (imageUrl) await this.deleteImage(imageUrl);
  }

  async deleteAccessLog(id: string): Promise<void> {
    // 1. Delete from Firestore if it exists there
    try {
        const firestoreRef = doc(this.firestore, 'access_logs', id);
        await deleteDoc(firestoreRef);
    } catch (e) { /* ignore if not in firestore */ }

    // 2. Delete from RTDB main node
    try {
        const rtdbMainRef = rtdbRef(this.rtdb, `access_logs/${id}`);
        await rtdbSet(rtdbMainRef, null);
    } catch (e) { }

    // 3. Delete from granted/refused caches
    try {
        await rtdbSet(rtdbRef(this.rtdb, `access_granted/${id}`), null);
        await rtdbSet(rtdbRef(this.rtdb, `access_refused/${id}`), null);
    } catch (e) { }
  }

  // ========== PDF & BADGE ==========

  exportUsersToPDF(users: any[]): void {
    const doc = new jsPDF({ orientation: 'landscape' });
    const now = new Date().toLocaleDateString('fr-FR');
    doc.setFillColor(29, 78, 216); doc.rect(0, 0, 297, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('LISTE DES UTILISATEURS — SecureGate', 148, 13, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    doc.text(`Exporté le ${now}`, 280, 13);

    const cols = ['Matricule', 'Nom complet', 'Email', 'Poste', 'RFID', 'Actif', 'Début accès', 'Fin accès'];
    const colW = [22, 38, 60, 34, 26, 14, 28, 28];
    let y = 28;
    const drawRow = (data: string[], isHeader = false) => {
      if (isHeader) { doc.setFillColor(240, 246, 255); doc.rect(10, y - 5, 277, 9, 'F'); }
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(isHeader ? 8 : 7.5);
      let x = 12;
      data.forEach((cell, i) => {
        doc.text(String(cell ?? '').substring(0, 28), x, y);
        x += colW[i];
      });
      y += 9;
      if (y > 190) { doc.addPage(); y = 20; }
    };
    const fmt = (v: any) => { try { const d = v?.toDate ? v.toDate() : new Date(v); return d.toLocaleDateString('fr-FR'); } catch { return ''; } };
    drawRow(cols, true);
    users.forEach(u => drawRow([u.matricule, `${u.prenom||''} ${u.nom||''}`.trim(), u.email, u.poste||'', u.cardNumber||'Aucune', u.isActive?'Oui':'Non', fmt(u.accessStartDate), fmt(u.accessEndDate)]));
    doc.save(`utilisateurs_${Date.now()}.pdf`);
  }

  exportLogsToPDF(logs: any[]): void {
    const doc = new jsPDF({ orientation: 'landscape' });
    const now = new Date().toLocaleDateString('fr-FR');
    doc.setFillColor(29, 78, 216); doc.rect(0, 0, 297, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('HISTORIQUE DES ACCÈS — SecureGate', 148, 13, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    doc.text(`Exporté le ${now} — ${logs.length} enregistrement(s)`, 270, 13);

    const cols = ['Date/Heure', 'Utilisateur', 'Carte RFID', 'Statut', 'Porte'];
    const colW = [52, 60, 40, 34, 28];
    let y = 28;
    const drawRow = (data: string[], isHeader = false) => {
      if (isHeader) { doc.setFillColor(240, 246, 255); doc.rect(10, y - 5, 277, 9, 'F'); }
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal'); doc.setFontSize(isHeader ? 8 : 7.5);
      let x = 12;
      data.forEach((cell, i) => { doc.text(String(cell ?? '').substring(0, 32), x, y); x += colW[i]; });
      y += 9;
      if (y > 190) { doc.addPage(); y = 20; }
    };
    drawRow(cols, true);
    logs.forEach(l => {
      const ts = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp || l.createdAt || '');
      drawRow([
        ts.toLocaleString('fr-FR'),
        l.userName || '-',
        l.cardNumber || l.RFIDTag || l.uid || '-',
        l.status || '-',
        l.doorState === 'open' ? 'Ouverte' : 'Fermée'
      ]);
    });
    doc.save(`historique_acces_${Date.now()}.pdf`);
  }

  exportRFIDToPDF(cards: any[], filter: string = 'all'): void {
    const doc = new jsPDF();
    const filterLabel: Record<string, string> = { all: 'Toutes les cartes', used: 'Cartes assignées', available: 'Cartes disponibles' };
    const now = new Date().toLocaleDateString('fr-FR');
    doc.setFillColor(29, 78, 216); doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(`CARTES RFID — ${filterLabel[filter] || filter}`, 105, 13, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    doc.text(`${now} — ${cards.length} carte(s)`, 190, 13, { align: 'right' });

    const cols = ['N° Carte', 'Statut', 'Utilisateur assigné', 'Date création'];
    const colW = [40, 34, 70, 36];
    let y = 28;
    const statusLabel = (s: string) => s === 'assigned' ? 'Assignée' : s === 'available' ? 'Disponible' : 'Désactivée';
    const drawRow = (data: string[], hdr = false) => {
      if (hdr) { doc.setFillColor(240, 246, 255); doc.rect(10, y - 5, 190, 9, 'F'); }
      doc.setFont('helvetica', hdr ? 'bold' : 'normal'); doc.setFontSize(hdr ? 8.5 : 8);
      let x = 12;
      data.forEach((cell, i) => { doc.text(String(cell ?? ''), x, y); x += colW[i]; });
      y += 9;
      if (y > 270) { doc.addPage(); y = 20; }
    };
    const fmt = (v: any) => { try { const d = v?.toDate ? v.toDate() : new Date(v); return d.toLocaleDateString('fr-FR'); } catch { return '-'; } };
    drawRow(cols, true);
    cards.forEach(c => drawRow([c.cardNumber, statusLabel(c.status), c.userName || 'Non assignée', fmt(c.createdAt)]));
    doc.save(`rfid_${filter}_${Date.now()}.pdf`);
  }


  /**
   * Generate a badge as a PNG image using HTML Canvas.
   * Returns a PNG Blob — no PDF, no conversion issues, works in any email client.
   */
  async generateBadgePDF(user: any, photoDataUrl?: string): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        const W = 720, H = 420;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d')!;

        // Format date helper
        const fmt = (val: any) => {
          if (!val) return 'N/A';
          try { const d = val?.toDate ? val.toDate() : new Date(val); return d.toLocaleDateString('fr-FR'); }
          catch { return 'N/A'; }
        };

        // Draw a label + value block at exact (x, y)
        const drawField = (label: string, value: string, x: number, y: number, vColor = '#e2e8f0', vFont = '16px Arial') => {
          ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left';
          ctx.fillText(label, x, y);
          ctx.fillStyle = vColor; ctx.font = vFont;
          ctx.fillText(value, x, y + 19);
        };

        // === BACKGROUND ===
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#0c1a35'); grad.addColorStop(1, '#1a3560');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

        // === HEADER ===
        ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, W, 62);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
        ctx.fillText('SecureGate — BADGE ACCÈS', W / 2, 40);

        // === PHOTO (left column, centered vertically) ===
        const PX = 95, PY = 235, PR = 75;
        ctx.beginPath(); ctx.arc(PX, PY, PR + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#1d4ed8'; ctx.fill();
        if (photoDataUrl || user.photoUrl || user.imageURL) {
          try {
            const img = new Image(); img.crossOrigin = 'anonymous';
            await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(); img.src = photoDataUrl || user.photoUrl || user.imageURL; });
            ctx.save(); ctx.beginPath(); ctx.arc(PX, PY, PR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, PX - PR, PY - PR, PR * 2, PR * 2);
            ctx.restore();
          } catch {
            ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(PX, PY, PR, 0, Math.PI * 2); ctx.fill();
          }
        }

        // Vertical divider
        ctx.strokeStyle = 'rgba(59,130,246,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(192, 74); ctx.lineTo(192, H - 42); ctx.stroke();

        // === RIGHT COLUMN ===
        const RX = 210;

        // Row 1 — Full name
        drawField('NOM COMPLET', `${user.prenom || ''} ${user.nom || ''}`.trim(), RX, 88, '#ffffff', 'bold 21px Arial');

        // Row 2 — Matricule (left) + Poste (right)
        drawField('MATRICULE', user.matricule || 'N/A', RX, 136);
        drawField('POSTE', user.poste || 'N/A', RX + 230, 136);

        // Row 3 — RFID card
        drawField('CARTE RFID', user.cardNumber || 'Non assignée', RX, 184, '#60a5fa', 'bold 15px monospace');

        // Thin separator
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(RX, 216); ctx.lineTo(W - 18, 216); ctx.stroke();

        // Row 4 — Access period
        ctx.fillStyle = '#1d4ed8'; ctx.fillRect(RX - 6, 224, 3, 55);
        drawField('PÉRIODE D\'ACCÈS',
          `Du ${fmt(user.accessStartDate)}   Au ${fmt(user.accessEndDate)}`,
          RX + 2, 227, '#ffffff', '15px Arial');

        // Row 5 — Horaires (same line level as period but shifted right)
        const hor = (user.accessStartTime && user.accessEndTime)
          ? `${user.accessStartTime}  →  ${user.accessEndTime}`
          : 'Accès illimité 24h/24';
        drawField('HORAIRES', hor, RX + 2, 276, '#93c5fd', 'bold 14px Arial');

        // === QR CODE (bottom-right) ===
        try {
          const qrData = JSON.stringify({ matricule: user.matricule || '', cardNumber: user.cardNumber || '', name: `${user.prenom || ''} ${user.nom || ''}`.trim() });
          const qrUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1, color: { dark: '#ffffff', light: '#0c1a35' } });
          const qrImg = new Image();
          await new Promise<void>((ok, fail) => { qrImg.onload = () => ok(); qrImg.onerror = () => fail(); qrImg.src = qrUrl; });
          ctx.drawImage(qrImg, W - 138, H - 158, 118, 118);
          ctx.fillStyle = '#475569'; ctx.font = '9px Arial'; ctx.textAlign = 'center';
          ctx.fillText('Scanner pour vérifier', W - 79, H - 28);
        } catch { }

        // === FOOTER ===
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, H - 36, W, 36);
        ctx.fillStyle = '#475569'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`Émis le ${new Date().toLocaleDateString('fr-FR')} • SecureGate System`, W / 2, H - 12);

        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas failed')), 'image/png', 0.95);
      } catch (e) { reject(e); }
    });
  }




  async uploadBadge(blob: Blob, publicId: string): Promise<string> {
    const pngFile = new File([blob], 'badge.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', pngFile);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    // Add timestamp to bust Cloudinary cache — always stores a fresh image
    const ts = Date.now();
    formData.append('public_id', `${publicId}_badge_${ts}`);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('❌ Badge upload error:', err);
      throw new Error(`Badge upload failed: ${err}`);
    }
    const data = await res.json();
    console.log('✅ Badge PNG URL (fresh):', data.secure_url);
    return data.secure_url;
  }

  async uploadImage(file: File, path: string): Promise<string> {
    // path example: 'users/photos/FkW947ri9ReeKYuy8aFd.jpg'
    let publicId = path.replace(/\.[^/.]+$/, ''); // strip .jpg extension
    
    // Append timestamp to publicId to bust cache on updates
    const ts = Date.now();
    publicId = `${publicId}_${ts}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('public_id', publicId);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('❌ Cloudinary upload error:', err);
      throw new Error(`Cloudinary upload failed: ${err}`);
    }

    const data = await res.json();
    console.log('✅ Cloudinary image upload success:', data.secure_url);
    return data.secure_url;
  }

  /**
   * Extract Cloudinary public_id from a secure_url.
   * e.g. https://res.cloudinary.com/xxx/image/upload/v123/users/photos/ABC.jpg -> users/photos/ABC
   */
  extractCloudinaryPublicId(url: string): string | null {
    if (!url || !url.includes('cloudinary.com')) return null;
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    return match ? match[1] : null;
  }

  /**
   * Delete a Cloudinary resource via backend endpoint (secure server-side deletion).
   * resourceType: 'image' | 'raw'
   */
  async deleteCloudinaryResource(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    try {
      const response = await fetch('http://localhost:5000/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: publicId, resource_type: resourceType })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Cloudinary deleted via backend [${publicId}]:`, data.result);
      } else {
        console.warn('⚠️ Backend delete-image responded with status:', response.status);
      }
    } catch (e) {
      console.warn('⚠️ Cloudinary delete request failed for:', publicId, e);
    }
  }

  async deleteImage(urlOrPublicId: string): Promise<void> {
    // Accept both full Cloudinary URL or raw public_id
    const publicId = urlOrPublicId.startsWith('http')
      ? this.extractCloudinaryPublicId(urlOrPublicId)
      : urlOrPublicId;
    if (publicId) await this.deleteCloudinaryResource(publicId, 'image');
  }

  async deleteResource(urlOrPublicId: string, type: string): Promise<void> {
    const resourceType = type === 'raw' ? 'raw' : 'image';
    const publicId = urlOrPublicId.startsWith('http')
      ? this.extractCloudinaryPublicId(urlOrPublicId)
      : urlOrPublicId;
    if (publicId) await this.deleteCloudinaryResource(publicId, resourceType);
  }

  async sendEmail(userData: any, type: string, badgeUrl?: string, otp?: string): Promise<any> {
    // SECURITY: Ensure email is never empty before sending to EmailJS
    if (!userData.email) {
      console.error('❌ SEND_EMAIL_BLOCKED: Recipient email is missing in userData object.');
      throw new Error('Email destination empty');
    }

    const params = {
      to_name: `${userData.prenom || ''} ${userData.nom || ''}`.trim() || 'Utilisateur',
      user_email: userData.email,           // Primary Key
      to_email: userData.email,             // Alternative Key
      email: userData.email,                // Legacy Key
      badge_link: badgeUrl || '',
      otp_code: otp || ''
    };

    const payload = {
      service_id: emailjsConfig.serviceId,
      template_id: type === 'welcome' ? emailjsConfig.welcomeTemplateId : emailjsConfig.otpTemplateId,
      user_id: emailjsConfig.publicKey,
      template_params: params
    };

    console.log('📬 Attempting to send EmailJS payload...', JSON.stringify(payload, null, 2));

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ EmailJS 422/Error Detail:', errorText);
      throw new Error(`Email failed: ${errorText}`);
    }
    return res;
  }
}
