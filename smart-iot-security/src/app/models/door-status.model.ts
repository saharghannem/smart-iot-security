export interface DoorStatus {
    id?: string;
    datetime: string;
    status: 'open' | 'closed' | string;
    timestamp?: number;
    command?: string;
    lastActionAt?: number;
    lastManualActionAt?: number;
}
