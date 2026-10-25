export enum AlertType {
  PIR = 'pir',
  VIBRATION = 'vibration',
  FORCE_OPEN = 'force_open',
  UNAUTHORIZED_RFID = 'unauthorized_rfid',
  FACE_MISMATCH = 'face_mismatch'
}

export interface Alert {
  id?: string;
  type: AlertType;
  date: string; // Format YYYY-MM-DD
  heure: string; // Format HH:mm
  timestamp: Date | any;
  imageCapturedURL?: string;
  imageStoragePath?: string;
  message: string;
  read?: boolean;
  resolved?: boolean;
  resolvedAt?: Date | any;
}

