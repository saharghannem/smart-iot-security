export interface Intrusion {
  id?: string;
  timestamp: Date | any;
  imageUrl?: string;
  imageStoragePath?: string;
  detectedBy: 'PIR' | 'DOOR_SENSOR' | 'FACIAL_RECOGNITION';
  severity: 'low' | 'medium' | 'high';
  resolved: boolean;
  resolvedAt?: Date | any;
  notes?: string;
  userName?: string;
  ownerImageUrl?: string;
  imageURL?: string;
  sourceCollection?: 'intrusions' | 'security_alerts' | 'access_refused';
  datetime?: string;
}

