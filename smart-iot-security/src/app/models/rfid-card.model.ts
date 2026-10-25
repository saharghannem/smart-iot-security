export enum RFIDCardStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  DISABLED = 'disabled'
}

export interface RFIDCard {
  id?: string;
  cardNumber: string;
  status: RFIDCardStatus;
  userId?: string;
  userName?: string;
  createdAt: Date | any;
  updatedAt: Date | any;
}

