export enum NotificationType {
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  INTRUSION_DETECTED = 'intrusion_detected',
  DOOR_OPENED = 'door_opened',
  DOOR_CLOSED = 'door_closed',
  SYSTEM_ALERT = 'system_alert'
}

export interface Notification {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date | any;
  read: boolean;
  userId?: string;
  accessLogId?: string;
  intrusionId?: string;
  imageUrl?: string;
  ownerName?: string;
  ownerImageUrl?: string;
}

