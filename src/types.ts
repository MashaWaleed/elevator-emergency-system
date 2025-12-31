export interface Elevator {
    id: string;
    building: string;
    floor: number;
    ip_address: string;  // IP address of the elevator node for communication
    status: 'normal' | 'emergency' | 'offline';
    lastSeen: number;    // Unix timestamp of last communication
    x: number;           // Canvas position X
    y: number;           // Canvas position Y
}

export interface EmergencyEvent {
    elevator_id: string;
    building: string;
    floor: number;
    status: string;
    timestamp: string;
    ip_address?: string;
}

export interface EventRecord {
    id: number;
    type: 'emergency' | 'acknowledgment';
    elevator_id: string;
    building: string;
    floor: number;
    status: string;
    operator: string | null;
    timestamp: string;
    ip_address?: string;
}
