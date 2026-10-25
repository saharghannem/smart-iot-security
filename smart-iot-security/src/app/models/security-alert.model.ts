export interface SecurityAlert {
    id?: string;
    datetime: string;
    device_id: string;
    image_timestamp: string;
    image_url: string;
    location: string;
    timestamp: number | string;
    type: string;
    uid: string;
    // Optional client-side fields for UI processing
    resolved?: boolean;
}
