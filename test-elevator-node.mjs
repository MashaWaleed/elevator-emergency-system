#!/usr/bin/env node
/**
 * Elevator Node Simulator
 * 
 * This script simulates a real elevator node that can:
 * 1. Send emergency signals to the monitoring system
 * 2. Listen for acknowledgment packets from the system
 * 3. Send periodic heartbeat/status updates
 * 
 * Usage:
 *   node test-elevator-node.mjs --node NODE-01 --elevator ELEV-A --building "North Wing" --floor 5 --emergency
 *   node test-elevator-node.mjs --node NODE-01 --elevator ELEV-A --heartbeat
 *   node test-elevator-node.mjs --node NODE-01 --elevator ELEV-A --listen
 * 
 * Options:
 *   --node        Node ID (required, e.g., NODE-01)
 *   --elevator    Elevator unit ID (required, e.g., ELEV-A, ELEV-B)
 *   --building    Building name (default: "Test Building")
 *   --floor       Floor number (default: 1)
 *   --ip          IP address to report (default: auto-detect)
 *   --host        Host to send to (default: localhost)
 *   --port        Port to send to (default: 5000)
 *   --emergency   Send an emergency signal
 *   --clear       Send a clear/normal signal
 *   --heartbeat   Send periodic heartbeat signals
 *   --listen      Listen for acknowledgment packets
 *   --interval    Heartbeat interval in ms (default: 5000)
 */

import dgram from 'dgram';
import { networkInterfaces } from 'os';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    nodeId: 'NODE-TEST-01',
    elevatorId: 'ELEV-A',
    building: 'Test Building',
    floor: 1,
    ip: null,
    host: 'localhost',
    port: 5000,
    listenPort: 5001,
    emergency: false,
    clear: false,
    heartbeat: false,
    listen: false,
    interval: 5000
};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '--node':
            options.nodeId = args[++i];
            break;
        case '--elevator':
            options.elevatorId = args[++i];
            break;
        case '--id': // backward compatibility
            options.nodeId = args[++i];
            break;
        case '--building':
            options.building = args[++i];
            break;
        case '--floor':
            options.floor = parseInt(args[++i]) || 1;
            break;
        case '--ip':
            options.ip = args[++i];
            break;
        case '--host':
            options.host = args[++i];
            break;
        case '--port':
            options.port = parseInt(args[++i]) || 5000;
            break;
        case '--listen-port':
            options.listenPort = parseInt(args[++i]) || 5001;
            break;
        case '--emergency':
            options.emergency = true;
            break;
        case '--clear':
            options.clear = true;
            break;
        case '--heartbeat':
            options.heartbeat = true;
            break;
        case '--listen':
            options.listen = true;
            break;
        case '--interval':
            options.interval = parseInt(args[++i]) || 5000;
            break;
        case '--help':
            printHelp();
            process.exit(0);
    }
}

function printHelp() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              ELEVATOR NODE SIMULATOR                          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  This tool simulates an elevator node for testing the         ║
║  Emergency Monitoring System.                                  ║
║                                                                ║
║  USAGE:                                                        ║
║    node test-elevator-node.mjs [options]                       ║
║                                                                ║
║  OPTIONS:                                                      ║
║    --node <id>       Node ID (default: NODE-TEST-01)           ║
║    --elevator <id>   Elevator unit ID (default: ELEV-A)        ║
║    --building <name> Building name (default: Test Building)    ║
║    --floor <num>     Floor number (default: 1)                 ║
║    --ip <address>    IP to report (default: auto-detect)       ║
║    --host <host>     Target host (default: localhost)          ║
║    --port <port>     Target port (default: 5000)               ║
║                                                                ║
║  ACTIONS:                                                      ║
║    --emergency       Send emergency signal                     ║
║    --clear           Send clear/normal signal                  ║
║    --heartbeat       Send periodic heartbeat signals           ║
║    --listen          Listen for acknowledgments                ║
║    --interval <ms>   Heartbeat interval (default: 5000)        ║
║                                                                ║
║  EXAMPLES:                                                     ║
║    # Trigger emergency on elevator A of node 01                ║
║    node test-elevator-node.mjs --node NODE-01 \\                ║
║      --elevator ELEV-A --emergency                             ║
║                                                                ║
║    # Clear emergency                                           ║
║    node test-elevator-node.mjs --node NODE-01 \\                ║
║      --elevator ELEV-A --clear                                 ║
║                                                                ║
║    # Heartbeat mode with listener                              ║
║    node test-elevator-node.mjs --node NODE-01 \\                ║
║      --elevator ELEV-A --heartbeat --listen                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
}

// Get local IP address
function getLocalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIP = options.ip || getLocalIP();

// Create UDP client for sending
const client = dgram.createSocket('udp4');

// Create message payload
function createMessage(type, status) {
    return JSON.stringify({
        type: type,
        node_id: options.nodeId,
        elevator_id: options.elevatorId,
        building: options.building,
        floor: options.floor,
        timestamp: new Date().toISOString(),
        status: status,
        ip_address: localIP
    });
}

// Send a single message
function sendMessage(type, status) {
    const message = createMessage(type, status);
    client.send(message, options.port, options.host, (err) => {
        if (err) {
            console.error(`❌ Failed to send ${type} (${status}):`, err.message);
        } else {
            console.log(`✅ Sent ${type} signal (${status}) to ${options.host}:${options.port}`);
            console.log(`   Payload: ${message}`);
        }
    });
}

// Print startup info
console.log(`
╔════════════════════════════════════════════════════════════════╗
║              ELEVATOR NODE SIMULATOR ACTIVE                    ║
╠════════════════════════════════════════════════════════════════╣
║  Node ID:     ${options.nodeId.padEnd(45)}║
║  Elevator ID: ${options.elevatorId.padEnd(45)}║
║  Building:    ${options.building.padEnd(45)}║
║  Floor:       ${options.floor.toString().padEnd(45)}║
║  Local IP:    ${localIP.padEnd(45)}║
║  Target:      ${(options.host + ':' + options.port).padEnd(45)}║
╚════════════════════════════════════════════════════════════════╝
`);

// Handle emergency signal
if (options.emergency) {
    console.log('🚨 SENDING EMERGENCY SIGNAL...\n');
    sendMessage('emergency', 'active');

    if (!options.listen && !options.heartbeat) {
        setTimeout(() => {
            client.close();
            console.log('\n✓ Done. Exiting.');
            process.exit(0);
        }, 500);
    }
}

// Handle clear signal
if (options.clear) {
    console.log('✅ SENDING CLEAR SIGNAL...\n');
    sendMessage('emergency', 'cleared');

    if (!options.listen && !options.heartbeat) {
        setTimeout(() => {
            client.close();
            console.log('\n✓ Done. Exiting.');
            process.exit(0);
        }, 500);
    }
}

// Handle heartbeat mode
if (options.heartbeat) {
    console.log(`💓 HEARTBEAT MODE - Sending every ${options.interval}ms\n`);

    // Send initial heartbeat
    sendMessage('heartbeat', 'online');

    // Send periodic heartbeats
    const heartbeatInterval = setInterval(() => {
        sendMessage('heartbeat', 'online');
    }, options.interval);

    // Handle cleanup
    process.on('SIGINT', () => {
        clearInterval(heartbeatInterval);
        client.close();
        console.log('\n\n🛑 Heartbeat stopped. Exiting.');
        process.exit(0);
    });
}

// Handle listen mode
if (options.listen) {
    const server = dgram.createSocket('udp4');

    server.on('error', (err) => {
        console.error(`❌ Listener error: ${err.message}`);
        server.close();
    });

    server.on('message', (msg, rinfo) => {
        try {
            const data = JSON.parse(msg.toString());
            console.log(`\n📩 RECEIVED MESSAGE from ${rinfo.address}:${rinfo.port}`);
            console.log(`   Type: ${data.type}`);
            console.log(`   Status: ${data.status}`);
            console.log(`   Timestamp: ${data.timestamp}`);
            if (data.operator) {
                console.log(`   Operator: ${data.operator}`);
            }

            if (data.type === 'acknowledgment') {
                console.log('\n🔔 ACKNOWLEDGMENT RECEIVED - Emergency was handled by operator!');
            }
        } catch (e) {
            console.log(`\n📩 Raw message from ${rinfo.address}:${rinfo.port}: ${msg.toString()}`);
        }
    });

    server.on('listening', () => {
        const address = server.address();
        console.log(`👂 LISTENING for acknowledgments on ${address.address}:${address.port}\n`);
    });

    server.bind(options.listenPort, '0.0.0.0');

    // Handle cleanup
    process.on('SIGINT', () => {
        server.close();
        if (!options.heartbeat) {
            client.close();
        }
        console.log('\n\n🛑 Listener stopped. Exiting.');
        process.exit(0);
    });
}

// If no action specified, show help
if (!options.emergency && !options.clear && !options.heartbeat && !options.listen) {
    console.log('No action specified. Use --help for usage information.\n');
    printHelp();
    process.exit(1);
}
