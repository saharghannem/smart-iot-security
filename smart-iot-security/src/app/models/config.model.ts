export interface SystemConfig {
  id?: string;
  buzzerEnabled: boolean;
  vibrationLevel: number; // 0-100
  pirEnabled: boolean;
  pirSensitivity: number; // 0-100
  nightMode: boolean;
  activationDelay: number; // en millisecondes
  allowedHours?: {
    start: string; // Format HH:mm
    end: string; // Format HH:mm
  };
  updatedAt?: Date | any;
  updatedBy?: string; // userId de l'admin qui a modifié
}

