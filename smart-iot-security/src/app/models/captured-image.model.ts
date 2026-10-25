export enum ImageType {
  ACCESS_LOG = 'access_log',
  INTRUSION = 'intrusion',
  FACE_RECOGNITION = 'face_recognition',
  ESP32_CAM = 'esp32_cam'
}

export interface CapturedImage {
  id?: string;
  type: ImageType;
  url: string;
  storagePath: string;
  timestamp: Date | any;
  date?: string; // Format YYYY-MM-DD pour filtrage
  relatedUserId?: string;
  relatedLogId?: string;
  relatedIntrusionId?: string;
  metadata?: {
    width?: number;
    height?: number;
    size?: number; // en bytes
    format?: string; // jpeg, png, etc.
  };
}

