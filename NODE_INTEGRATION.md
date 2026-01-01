# Node Integration Guide

This guide describes how to integrate elevator nodes (hardware clients) with the Emergency Monitoring System.

## Communication Protocol

The system uses **UDP** (User Datagram Protocol) for fast, low-latency communication.
- **Port**: `5000` (The monitoring system listens on this port)
- **Format**: JSON Payload

### 1. Register / Heartbeat Packet
Send this packet periodically (e.g., every 5-10 seconds) to let the system know the node is online. The system will automatically register new nodes it hasn't seen before.

```json
{
  "type": "heartbeat",
  "elevator_id": "ELEV-01",     // Unique Identifier
  "building": "North Wing",     // Optional: Building Name
  "floor": 5,                   // Optional: Current Floor
  "status": "normal",           // "normal" or "offline"
  "timestamp": "2023-12-31T12:00:00Z"
}
```

### 2. Emergency Packet
Send this immediately when the emergency button is pressed. It is recommended to send this packet multiple times (e.g., 3 times) to ensure delivery over UDP.

**IMPORTANT**: The `elevator_id` should now be the specific elevator unit ID (e.g., "ELEV-A", "ELEV-B"), and you should include the `node_id` to identify which node the elevator belongs to.

```json
{
  "type": "emergency",
  "node_id": "NODE-01",              // NEW: Node identifier
  "elevator_id": "ELEV-A",           // Specific elevator unit ID
  "building": "North Wing",
  "floor": 5,
  "status": "active",                // MUST be "active" to trigger alarm
  "timestamp": "2023-12-31T12:00:10Z"
}
```

### 3. Receiving Acknowledgment
When an operator acknowledges the alarm in the dashboard, the system sends a UDP packet back to the elevator's IP address on **Port 5001**. I recommend listening on this port to provide local feedback (e.g., turn off a siren or light an LED).

**Incoming Packet Format:**
```json
{
  "type": "acknowledgment",
  "node_id": "NODE-01",
  "elevator_id": "ELEV-A",
  "operator": "Station-1",
  "status": "acknowledged",
  "timestamp": "2023-12-31T12:00:25Z"
}
```

---

## Updated System Architecture

The system now supports:
- **Nodes**: Physical controller units with network addresses (e.g., NODE-01, NODE-02)
- **Elevator Units**: Individual elevators linked to nodes (e.g., ELEV-A, ELEV-B on NODE-01)

Each node can have multiple elevator units. When sending emergency packets, include both:
- `node_id`: The controller node identifier
- `elevator_id`: The specific elevator unit that triggered the emergency

---

## Code Examples

### Python Client Example
Use this script on your Raspberry Pi or Microcontroller (if it supports MicroPython).

```python
import socket
import json
import time

SERVER_IP = "192.168.1.100"  # IP of the Monitoring Dashboard PC
SERVER_PORT = 5000
MY_ID = "ELEV-01"

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def send_emergency():
    payload = {
        "type": "emergency",
        "node_id": "NODE-01",        # Node identifier
        "elevator_id": "ELEV-A",     # Specific elevator unit
        "building": "Building A",
        "floor": 1,
        "status": "active",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    message = json.dumps(payload).encode('utf-8')
    sock.sendto(message, (SERVER_IP, SERVER_PORT))
    print("Emergency sent!")

# Example usage
send_emergency()
```

### Node.js Client Example

```javascript
const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const message = JSON.stringify({
    type: "emergency",
    node_id: "NODE-01",
    elevator_id: "ELEV-A",
    building: "Building A",
    floor: 3,
    status: "active",
    timestamp: new Date().toISOString()
});

client.send(message, 5000, '192.168.1.100', (err) => {
    client.close();
});
```
