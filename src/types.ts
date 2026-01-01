export interface Node {
    id: string;
    building: string;
    floor: number;
    ip_address: string;  // IP address of the node for communication
    status: 'normal' | 'emergency' | 'offline';
    lastSeen: number;    // Unix timestamp of last communication
    x: number;           // Canvas position X
    y: number;           // Canvas position Y
    elevators?: ElevatorUnit[];  // Elevators linked to this node (optional for backward compatibility)
}

export interface ElevatorUnit {
    id: string;          // Unique identifier for the elevator
    label: string;       // Display label (e.g., "Elevator A", "Main Lift")
    unitIndex?: number;  // Order within node (1-based), used for GPIO mapping
    x: number;           // Canvas position X (relative to parent or absolute)
    y: number;           // Canvas position Y
    status: 'normal' | 'emergency' | 'offline';
    nodeId: string;      // Parent node ID
}

// Keep Elevator as alias for backward compatibility
export type Elevator = Node;

export interface EmergencyEvent {
    elevator_id: string;     // ID of the specific elevator unit
    node_id?: string;        // ID of the parent node
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

export interface PendingDevice {
    device_ip: string;
    mac_address: string | null;
    buttons: number;
    first_seen: number;
    last_seen: number;
}
