import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import dgram from 'dgram'
import Database from 'better-sqlite3'

// Database setup - use absolute path to ensure consistency
const dbPath = join(app.getPath('userData'), 'elevators.db')
console.log('Database path:', dbPath)

const db = new Database(dbPath, { verbose: console.log })

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    elevator_id TEXT NOT NULL,
    node_id TEXT,
    building TEXT,
    floor INTEGER,
    status TEXT NOT NULL,
    operator TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS elevators (
    id TEXT PRIMARY KEY,
    building TEXT NOT NULL,
    floor INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    status TEXT DEFAULT 'normal',
    last_seen INTEGER DEFAULT 0,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS elevator_units (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    label TEXT NOT NULL,
        unit_index INTEGER DEFAULT 0,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    status TEXT DEFAULT 'normal',
    FOREIGN KEY (node_id) REFERENCES elevators(id) ON DELETE CASCADE
  );

    CREATE TABLE IF NOT EXISTS pending_devices (
        device_ip TEXT PRIMARY KEY,
        mac_address TEXT,
        buttons INTEGER DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    );
  
  CREATE TABLE IF NOT EXISTS config (
    id TEXT PRIMARY KEY,
    data TEXT
  );
`)

// Best-effort migrations for older DBs
try {
    db.exec('ALTER TABLE elevator_units ADD COLUMN unit_index INTEGER DEFAULT 0');
} catch {
    // ignore if already exists
}

// Helpers
function getNodeByIp(deviceIp: string) {
    return db
        .prepare('SELECT id, building, floor, ip_address, status, last_seen, x, y FROM elevators WHERE ip_address = ? LIMIT 1')
        .get(deviceIp)
}

function upsertPendingDevice(deviceIp: string, macAddress?: string, buttons?: number) {
    const now = Date.now()
    const existing = db.prepare('SELECT device_ip FROM pending_devices WHERE device_ip = ?').get(deviceIp)
    if (existing) {
        db.prepare(
            'UPDATE pending_devices SET last_seen = ?, mac_address = COALESCE(?, mac_address), buttons = COALESCE(?, buttons) WHERE device_ip = ?'
        ).run(now, macAddress || null, typeof buttons === 'number' ? buttons : null, deviceIp)
    } else {
        db.prepare(
            'INSERT INTO pending_devices (device_ip, mac_address, buttons, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)'
        ).run(deviceIp, macAddress || null, buttons || 0, now, now)
    }

    mainWindow?.webContents.send('pending-device', {
        device_ip: deviceIp,
        mac_address: macAddress || null,
        buttons: buttons || 0,
        last_seen: now,
    })
}

function sendNodeConfigResponse(opts: {
    deviceIp: string
    replyAddress: string
    replyPort: number
}) {
    const node = getNodeByIp(opts.deviceIp)
    if (!node) {
        const payload = {
            type: 'config',
            registered: false,
            server_time: new Date().toISOString(),
        }
        server.send(JSON.stringify(payload), opts.replyPort, opts.replyAddress)
        return
    }

    const units = db
        .prepare(
            'SELECT id, node_id, label, unit_index FROM elevator_units WHERE node_id = ? ORDER BY unit_index ASC, id ASC'
        )
        .all(node.id)

    const payload = {
        type: 'config',
        registered: true,
        node: {
            id: node.id,
            building: node.building,
            floor: node.floor,
            ip_address: node.ip_address,
        },
        units: units.map((u: any) => ({
            id: u.id,
            label: u.label,
            index: u.unit_index,
        })),
        server_time: new Date().toISOString(),
    }

    server.send(JSON.stringify(payload), opts.replyPort, opts.replyAddress)
}

function recomputeNodeStatus(nodeId: string) {
    const anyEmergency = db
        .prepare('SELECT 1 FROM elevator_units WHERE node_id = ? AND status = ? LIMIT 1')
        .get(nodeId, 'emergency')
    db.prepare('UPDATE elevators SET status = ? WHERE id = ?').run(anyEmergency ? 'emergency' : 'normal', nodeId)
}

function pushNodeConfigToDevice(deviceIp: string) {
    // Use a dedicated UDP client for push (more reliable than using server socket)
    const node = getNodeByIp(deviceIp)
    
    let payload: any
    if (!node) {
        payload = {
            type: 'config',
            registered: false,
            server_time: new Date().toISOString(),
        }
    } else {
        const units = db
            .prepare(
                'SELECT id, node_id, label, unit_index FROM elevator_units WHERE node_id = ? ORDER BY unit_index ASC, id ASC'
            )
            .all(node.id)

        payload = {
            type: 'config',
            registered: true,
            node: {
                id: node.id,
                building: node.building,
                floor: node.floor,
                ip_address: node.ip_address,
            },
            units: units.map((u: any) => ({
                id: u.id,
                label: u.label,
                index: u.unit_index,
            })),
            server_time: new Date().toISOString(),
        }
    }

    const client = dgram.createSocket('udp4')
    const message = JSON.stringify(payload)
    
    client.send(message, 5002, deviceIp, (err) => {
        if (err) {
            console.error(`Failed to push config to ${deviceIp}:5002:`, err)
        } else {
            console.log(`Pushed config to ${deviceIp}:5002 (registered: ${!!node})`)
        }
        client.close()
    })
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
    mainWindow = new BrowserWindow({
        fullscreen: true,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
        },
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// UDP Server for receiving emergency signals
const server = dgram.createSocket('udp4')

server.on('error', (err) => {
    console.error(`UDP Server error:\n${err.stack}`)
    server.close()
})

server.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString())
        console.log(`Received UDP message from ${rinfo.address}:${rinfo.port}:`, data)

        const deviceIp = data.ip_address || rinfo.address
        const macAddress = data.mac_address || data.mac
        const buttons = typeof data.buttons === 'number' ? data.buttons : undefined

        // Server-authoritative registration/config
        if (data.type === 'registration_request') {
            upsertPendingDevice(deviceIp, macAddress, buttons)
            sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
            return
        }

        if (data.type === 'config_request') {
            // Client polling for config
            const node = getNodeByIp(deviceIp)
            if (!node) {
                upsertPendingDevice(deviceIp, macAddress, buttons)
            } else {
                // Update last_seen based on config polls too
                db.prepare('UPDATE elevators SET last_seen = ?, ip_address = ? WHERE id = ?').run(Date.now(), deviceIp, node.id)
                mainWindow?.webContents.send('elevator-event', {
                    type: 'heartbeat',
                    node_id: node.id,
                    elevator_id: node.id,
                    building: node.building,
                    floor: node.floor,
                    status: 'online',
                    ip_address: deviceIp,
                    timestamp: new Date().toISOString(),
                })
            }

            sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
            return
        }

        // Determine the node ID (can be sent as node_id or elevator_id for backwards compat)
        const nodeId = data.node_id || data.elevator_id

        // Handle different message types
        if (data.type === 'heartbeat') {
            // If the client doesn't know its node_id yet, treat heartbeat as config polling
            if (!nodeId) {
                const node = getNodeByIp(deviceIp)
                if (!node) {
                    upsertPendingDevice(deviceIp, macAddress, buttons)
                } else {
                    db.prepare('UPDATE elevators SET last_seen = ?, ip_address = ? WHERE id = ?').run(Date.now(), deviceIp, node.id)
                    mainWindow?.webContents.send('elevator-event', {
                        type: 'heartbeat',
                        node_id: node.id,
                        elevator_id: node.id,
                        building: node.building,
                        floor: node.floor,
                        status: 'online',
                        ip_address: deviceIp,
                        timestamp: new Date().toISOString(),
                    })
                }
                sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
                return
            }

            // Heartbeat - update last_seen timestamp, don't log to events
            const updateHeartbeat = db.prepare(`
                UPDATE elevators 
                SET last_seen = ?, ip_address = COALESCE(?, ip_address)
                WHERE id = ?
            `)
            const result = updateHeartbeat.run(
                Date.now(),
                deviceIp,
                nodeId
            )
            console.log(`Heartbeat processed for ${nodeId}, updated: ${result.changes}`)

            // If node_id is unknown in DB (deleted), treat as pending
            if (result.changes === 0) {
                upsertPendingDevice(deviceIp, macAddress, buttons)
                sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
                return
            }
            
            // Notify renderer process for real-time update
            mainWindow?.webContents.send('elevator-event', {
                ...data,
                node_id: nodeId,
                ip_address: deviceIp,
                timestamp: new Date().toISOString()
            })
            return // Don't log heartbeats to events table
        }

        // Log non-heartbeat events to database
        const insertEvent = db.prepare(`
            INSERT INTO events (type, elevator_id, node_id, building, floor, status, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        // If we don't know the node, don't accept stateful events; queue as pending
        if (!nodeId) {
            upsertPendingDevice(deviceIp, macAddress, buttons)
            sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
            return
        }

        insertEvent.run(
            data.type || 'emergency',
            data.elevator_id || nodeId,
            nodeId,
            data.building,
            data.floor,
            data.status,
            deviceIp
        )

        // Emergency or other status update
        // Update parent node last_seen
        const updateElevator = db.prepare(`
            UPDATE elevators 
            SET last_seen = ?, ip_address = COALESCE(?, ip_address)
            WHERE id = ?
        `)
        const result = updateElevator.run(Date.now(), deviceIp, nodeId)

        // If node doesn't exist, treat as pending (server is authoritative)
        if (result.changes === 0) {
            upsertPendingDevice(deviceIp, macAddress, buttons)
            sendNodeConfigResponse({ deviceIp, replyAddress: rinfo.address, replyPort: rinfo.port })
            return
        }

        // Update statuses
        if (data.type === 'emergency') {
            const unitId = data.elevator_id || nodeId
            const unitExists = db.prepare('SELECT id FROM elevator_units WHERE id = ? LIMIT 1').get(unitId)

            if (unitExists) {
                db.prepare('UPDATE elevator_units SET status = ? WHERE id = ?').run(
                    data.status === 'active' ? 'emergency' : 'normal',
                    unitId
                )
                recomputeNodeStatus(nodeId)
            } else {
                db.prepare('UPDATE elevators SET status = ? WHERE id = ?').run(
                    data.status === 'active' ? 'emergency' : 'normal',
                    nodeId
                )
            }
        }

        // Notify renderer process
        mainWindow?.webContents.send('elevator-event', {
            ...data,
            node_id: nodeId,
            ip_address: deviceIp,
            timestamp: new Date().toISOString()
        })

    } catch (e) {
        console.error('Failed to parse UDP message:', e)
    }
})

server.on('listening', () => {
    const address = server.address()
    console.log(`UDP Server listening on ${address.address}:${address.port}`)
})

server.bind(5000, '0.0.0.0')

// Helper function to send UDP acknowledgment back to elevator
function sendAcknowledgment(ipAddress: string, nodeId: string, elevatorId: string, port: number = 5001) {
    const client = dgram.createSocket('udp4')
    const message = JSON.stringify({
        type: 'acknowledgment',
        node_id: nodeId,
        elevator_id: elevatorId,
        timestamp: new Date().toISOString(),
        operator: 'Station-1',
        status: 'acknowledged'
    })

    client.send(message, port, ipAddress, (err) => {
        if (err) {
            console.error(`Failed to send acknowledgment to ${ipAddress}:${port}:`, err)
        } else {
            console.log(`Acknowledgment sent to ${ipAddress}:${port}`)
        }
        client.close()
    })
}

// ============== IPC Handlers ==============

// Get all events from database
ipcMain.handle('get-events', () => {
    // Clean up old events (keep last 1000)
    db.prepare(`
        DELETE FROM events 
        WHERE id NOT IN (
            SELECT id FROM events 
            ORDER BY timestamp DESC 
            LIMIT 1000
        )
    `).run()
    
    const events = db.prepare(`
        SELECT * FROM events 
        ORDER BY timestamp DESC 
        LIMIT 100
    `).all()
    return events
})

// Get all elevators from database
ipcMain.handle('get-elevators', () => {
    const elevators = db.prepare('SELECT * FROM elevators ORDER BY id').all()
    const elevatorUnits = db.prepare('SELECT * FROM elevator_units ORDER BY unit_index ASC, id ASC').all()
    
    return elevators.map((el: any) => ({
        id: el.id,
        building: el.building,
        floor: el.floor,
        ip_address: el.ip_address,
        status: el.status,
        lastSeen: el.last_seen,
        x: el.x,
        y: el.y,
        elevators: elevatorUnits
            .filter((unit: any) => unit.node_id === el.id)
            .map((unit: any) => ({
                id: unit.id,
                nodeId: unit.node_id,
                label: unit.label,
                unitIndex: unit.unit_index,
                x: unit.x,
                y: unit.y,
                status: unit.status
            }))
    }))
})

// Add a new elevator
ipcMain.handle('add-elevator', (_, elevator: any) => {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO elevators (id, building, floor, ip_address, status, last_seen, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
        elevator.id,
        elevator.building,
        elevator.floor,
        elevator.ip_address,
        elevator.status || 'normal',
        elevator.lastSeen || 0,
        elevator.x || 0,
        elevator.y || 0
    )

    if (elevator.ip_address) {
        pushNodeConfigToDevice(elevator.ip_address)
    }
    return { success: true }
})

// Remove an elevator (node)
ipcMain.handle('remove-elevator', (_, elevatorId: string) => {
    const node = db.prepare('SELECT ip_address FROM elevators WHERE id = ?').get(elevatorId) as any
    const ipAddress = node?.ip_address
    
    // Delete node (cascade deletes units due to FK)
    db.prepare('DELETE FROM elevator_units WHERE node_id = ?').run(elevatorId)
    db.prepare('DELETE FROM elevators WHERE id = ?').run(elevatorId)

    if (ipAddress) {
        // Push unregistered config to device using reliable client socket
        pushNodeConfigToDevice(ipAddress)
    }
    return { success: true }
})

// Update elevator position (for canvas drag)
ipcMain.handle('update-elevator-position', (_, elevatorId: string, x: number, y: number) => {
    const stmt = db.prepare('UPDATE elevators SET x = ?, y = ? WHERE id = ?')
    stmt.run(x, y, elevatorId)
    return { success: true }
})

// Add elevator unit to a node
ipcMain.handle('add-elevator-unit', (_, elevatorUnit: any) => {
    const nextIndex = db
        .prepare('SELECT COALESCE(MAX(unit_index), 0) as maxIndex FROM elevator_units WHERE node_id = ?')
        .get(elevatorUnit.nodeId)?.maxIndex
    const unitIndex = typeof elevatorUnit.unitIndex === 'number' ? elevatorUnit.unitIndex : (nextIndex + 1)

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO elevator_units (id, node_id, label, unit_index, x, y, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
        elevatorUnit.id,
        elevatorUnit.nodeId,
        elevatorUnit.label,
        unitIndex,
        elevatorUnit.x || 0,
        elevatorUnit.y || 0,
        elevatorUnit.status || 'normal'
    )

    const node = db.prepare('SELECT ip_address FROM elevators WHERE id = ?').get(elevatorUnit.nodeId) as any
    if (node?.ip_address) {
        pushNodeConfigToDevice(node.ip_address)
    }
    return { success: true }
})

// Remove elevator unit
ipcMain.handle('remove-elevator-unit', (_, elevatorUnitId: string) => {
    const unit = db.prepare('SELECT node_id FROM elevator_units WHERE id = ?').get(elevatorUnitId) as any
    const stmt = db.prepare('DELETE FROM elevator_units WHERE id = ?')
    stmt.run(elevatorUnitId)

    if (unit?.node_id) {
        recomputeNodeStatus(unit.node_id)
        const node = db.prepare('SELECT ip_address FROM elevators WHERE id = ?').get(unit.node_id) as any
        if (node?.ip_address) pushNodeConfigToDevice(node.ip_address)
    }
    return { success: true }
})

// Update elevator unit position
ipcMain.handle('update-elevator-unit-position', (_, elevatorUnitId: string, x: number, y: number) => {
    const stmt = db.prepare('UPDATE elevator_units SET x = ?, y = ? WHERE id = ?')
    stmt.run(x, y, elevatorUnitId)
    return { success: true }
})

// Update elevator unit status
ipcMain.handle('update-elevator-unit-status', (_, elevatorUnitId: string, status: string) => {
    const stmt = db.prepare('UPDATE elevator_units SET status = ? WHERE id = ?')
    stmt.run(status, elevatorUnitId)

    const unit = db.prepare('SELECT node_id FROM elevator_units WHERE id = ?').get(elevatorUnitId) as any
    if (unit?.node_id) {
        recomputeNodeStatus(unit.node_id)
    }
    return { success: true }
})

// Update node details (ID, building, floor)
ipcMain.handle('update-node', (_, payload: { oldId: string, newId: string, building: string, floor: number }) => {
    const { oldId, newId, building, floor } = payload
    
    // Validate new ID
    if (!newId.trim()) {
        return { success: false, error: 'Node ID is required' }
    }
    if (newId.length > 64) {
        return { success: false, error: 'Node ID is too long' }
    }
    
    // Check if new ID already exists (if changing)
    if (oldId !== newId) {
        const existing = db.prepare('SELECT id FROM elevators WHERE id = ?').get(newId)
        if (existing) {
            return { success: false, error: 'Node ID already exists' }
        }
    }
    
    const node = db.prepare('SELECT ip_address FROM elevators WHERE id = ?').get(oldId) as any
    if (!node) {
        return { success: false, error: 'Node not found' }
    }
    
    // Update node (use transaction to also update unit references)
    const tx = db.transaction(() => {
        if (oldId !== newId) {
            // Update elevator_units foreign key first
            db.prepare('UPDATE elevator_units SET node_id = ? WHERE node_id = ?').run(newId, oldId)
            // Then update the node
            db.prepare('UPDATE elevators SET id = ?, building = ?, floor = ? WHERE id = ?').run(newId, building, floor, oldId)
        } else {
            db.prepare('UPDATE elevators SET building = ?, floor = ? WHERE id = ?').run(building, floor, oldId)
        }
    })
    tx()
    
    // Push updated config to device
    if (node.ip_address) {
        pushNodeConfigToDevice(node.ip_address)
    }
    
    return { success: true, nodeId: newId }
})

// Update elevator unit details (ID, label)
ipcMain.handle('update-elevator-unit', (_, payload: { oldId: string, newId: string, label: string }) => {
    const { oldId, newId, label } = payload
    
    // Validate new ID
    if (!newId.trim()) {
        return { success: false, error: 'Elevator ID is required' }
    }
    if (newId.length > 64) {
        return { success: false, error: 'Elevator ID is too long' }
    }
    
    // Check if new ID already exists (if changing)
    if (oldId !== newId) {
        const existing = db.prepare('SELECT id FROM elevator_units WHERE id = ?').get(newId)
        if (existing) {
            return { success: false, error: 'Elevator ID already exists' }
        }
    }
    
    const unit = db.prepare('SELECT node_id FROM elevator_units WHERE id = ?').get(oldId) as any
    if (!unit) {
        return { success: false, error: 'Elevator unit not found' }
    }
    
    // Update the unit
    if (oldId !== newId) {
        // Need to delete and re-insert since id is primary key
        const oldUnit = db.prepare('SELECT * FROM elevator_units WHERE id = ?').get(oldId) as any
        db.prepare('DELETE FROM elevator_units WHERE id = ?').run(oldId)
        db.prepare(`INSERT INTO elevator_units (id, node_id, label, unit_index, x, y, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            newId, oldUnit.node_id, label, oldUnit.unit_index, oldUnit.x, oldUnit.y, oldUnit.status
        )
    } else {
        db.prepare('UPDATE elevator_units SET label = ? WHERE id = ?').run(label, oldId)
    }
    
    // Push updated config to device
    const node = db.prepare('SELECT ip_address FROM elevators WHERE id = ?').get(unit.node_id) as any
    if (node?.ip_address) {
        pushNodeConfigToDevice(node.ip_address)
    }
    
    return { success: true, unitId: newId }
})

// Acknowledge an emergency
ipcMain.handle('acknowledge-emergency', (_, data: any) => {
    // Log acknowledgment to events table
    const insertEvent = db.prepare(`
        INSERT INTO events (type, elevator_id, building, floor, status, operator, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insertEvent.run(
        'acknowledgment',
        data.elevator_id,
        data.building,
        data.floor,
        'acknowledged',
        'Station-1',
        data.ip_address
    )

    // Update elevator unit status if present
    db.prepare('UPDATE elevator_units SET status = ? WHERE id = ?').run('normal', data.elevator_id)

    // Update parent node last_seen
    if (data.node_id) {
        db.prepare('UPDATE elevators SET last_seen = ? WHERE id = ?').run(Date.now(), data.node_id)
        recomputeNodeStatus(data.node_id)
    }

    // Send UDP acknowledgment back to the elevator's IP if available
    if (data.ip_address) {
        sendAcknowledgment(data.ip_address, data.node_id || data.elevator_id, data.elevator_id)
    }

    if (data.ip_address) {
        pushNodeConfigToDevice(data.ip_address)
    }

    // Notify renderer that the emergency was acknowledged
    mainWindow?.webContents.send('elevator-event', {
        ...data,
        status: 'acknowledged',
        timestamp: new Date().toISOString()
    })

    return { success: true }
})

ipcMain.handle('get-pending-devices', () => {
    return db
        .prepare('SELECT device_ip, mac_address, buttons, first_seen, last_seen FROM pending_devices ORDER BY first_seen DESC')
        .all()
})

ipcMain.handle('reject-pending-device', (_, deviceIp: string) => {
    db.prepare('DELETE FROM pending_devices WHERE device_ip = ?').run(deviceIp)
    return { success: true }
})

ipcMain.handle(
    'approve-pending-device',
    (
        _,
        payload: {
            deviceIp: string
            building: string
            floor: number
            unitCount: number
            nodeId?: string
            unitIds?: string[]
        }
    ) => {
    const device = db.prepare('SELECT * FROM pending_devices WHERE device_ip = ?').get(payload.deviceIp)
    if (!device) return { success: false, error: 'Device not found' }

    const mac = (device.mac_address || '') as string
    const suggestedBaseId = mac
        ? `NODE-${mac.replace(/:/g, '').toUpperCase()}`
        : `NODE-${payload.deviceIp.replace(/\./g, '_')}`

    const requestedNodeId = (payload.nodeId || '').trim()
    if (!requestedNodeId) {
        return { success: false, error: 'Node ID is required' }
    }
    if (requestedNodeId.length > 64) {
        return { success: false, error: 'Node ID is too long' }
    }
    if (db.prepare('SELECT id FROM elevators WHERE id = ?').get(requestedNodeId)) {
        return { success: false, error: 'Node ID already exists' }
    }

    const nodeId = requestedNodeId || suggestedBaseId

    db.prepare(
        `INSERT INTO elevators (id, building, floor, ip_address, status, last_seen, x, y)
         VALUES (?, ?, ?, ?, 'offline', 0, 60, 60)`
    ).run(nodeId, payload.building || 'Unassigned', payload.floor || 0, payload.deviceIp)

    const count = Math.max(0, Math.min(payload.unitCount || 0, 16))

    let unitIds: string[] = []
    if (Array.isArray(payload.unitIds) && payload.unitIds.length > 0) {
        unitIds = payload.unitIds
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .slice(0, 16)
    }

    if (unitIds.length === 0) {
        // Default IDs if user didn't specify
        for (let i = 0; i < count; i++) {
            unitIds.push(`${nodeId}-E${i + 1}`)
        }
    }

    // Validate unit IDs
    const unitIdSet = new Set<string>()
    for (const u of unitIds) {
        if (u.length > 64) return { success: false, error: `Elevator ID too long: ${u}` }
        if (unitIdSet.has(u)) return { success: false, error: `Duplicate elevator ID: ${u}` }
        unitIdSet.add(u)
        if (db.prepare('SELECT id FROM elevator_units WHERE id = ?').get(u)) {
            return { success: false, error: `Elevator ID already exists: ${u}` }
        }
    }
    const insertUnit = db.prepare(
        `INSERT INTO elevator_units (id, node_id, label, unit_index, x, y, status)
         VALUES (?, ?, ?, ?, 0, 0, 'offline')`
    )
    const tx = db.transaction(() => {
        for (let i = 0; i < unitIds.length; i++) {
            const unitId = unitIds[i]
            insertUnit.run(unitId, nodeId, unitId, i + 1)
        }
        db.prepare('DELETE FROM pending_devices WHERE device_ip = ?').run(payload.deviceIp)
    })
    tx()

    // Push config immediately (best effort)
    pushNodeConfigToDevice(payload.deviceIp)

    return { success: true, nodeId }
}
)

// Legacy config handlers (for backward compatibility)
ipcMain.handle('save-config', (_, key: string, data: string) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO config (id, data) VALUES (?, ?)')
    stmt.run(key, data)
    return { success: true }
})

ipcMain.handle('get-config', (_, key: string) => {
    return db.prepare('SELECT data FROM config WHERE id = ?').get(key)
})

// Ping an elevator to check if it's online
ipcMain.handle('ping-elevator', (_, ipAddress: string) => {
    return new Promise((resolve) => {
        const client = dgram.createSocket('udp4')
        const message = JSON.stringify({ type: 'ping', timestamp: Date.now() })

        const timeout = setTimeout(() => {
            client.close()
            resolve({ online: false })
        }, 2000)

        client.on('message', () => {
            clearTimeout(timeout)
            client.close()
            resolve({ online: true })
        })

        client.send(message, 5001, ipAddress, (err) => {
            if (err) {
                clearTimeout(timeout)
                client.close()
                resolve({ online: false })
            }
        })
    })
})
