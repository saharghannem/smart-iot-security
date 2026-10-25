export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export interface User {
  id?: string;
  nom: string;
  prenom: string;
  email: string;
  imageURL?: string; // Alias pour photoUrl (compatibilité)
  photoUrl?: string; // Pour compatibilité avec code existant
  photoStoragePath?: string;
  RFIDTag?: string; // Alias pour rfidCardId (compatibilité)
  rfidCardId?: string; // Pour compatibilité avec code existant
  FaceEmbedding?: number[]; // Embedding vectoriel pour reconnaissance faciale
  role?: UserRole;
  createdAt: Date | any;
  updatedAt?: Date | any;
  lastSeen?: Date | any;
  isActive?: boolean;
  matricule?: string;
  accessStartDate?: Date | any;
  accessEndDate?: Date | any;
  accessStartTime?: string;
  accessEndTime?: string;
  poste?: string;
}

