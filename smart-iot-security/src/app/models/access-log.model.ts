export enum AccessStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  INTRUSION = 'intrusion',
  RFID_REJECTED = 'rfid_rejected',
  FACE_MISMATCH = 'face_mismatch'
}

export enum AccessType {
  AUTHORIZED = 'authorized',
  UNAUTHORIZED = 'unauthorized',
  NO_CARD = 'no_card',
  FACE_MISMATCH = 'face_mismatch'
}

export interface AccessLog {
  id?: string;
  uid?: string; // RFID Tag ID from hardware
  userId?: string;
  userName?: string; // Nom de l'utilisateur (pour affichage rapide)
  rfidCardId?: string;
  cardNumber?: string;
  RFIDTag?: string; // Alias pour cardNumber
  status: AccessStatus;
  event?: string; // Raw event string from Firestore (e.g., 'access_granted', 'access_denied_face')
  accessType?: AccessType; // authorized, unauthorized, no_card, face_mismatch
  timestamp: Date | any;
  datetime?: string; // String formatted date from Firestore
  date?: string; // Format YYYY-MM-DD pour filtrage
  heure?: string; // Format HH:mm pour filtrage
  doorState?: 'open' | 'closed';
  facialRecognitionMatch?: boolean;
  faceMatch?: boolean; // Alias pour facialRecognitionMatch
  imageUrl?: string;
  imageCapturedURL?: string; // Alias pour imageUrl
  imageStoragePath?: string;
  notes?: string;
}

