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
  
  CREATE TABLE IF NOT EXISTS config (
    id TEXT PRIMARY KEY,
    data TEXT
  );
`)

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

        // Log event to database
        const insertEvent = db.prepare(`
            INSERT INTO events (type, elevator_id, building, floor, status, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?)
        `)
        insertEvent.run(
            data.type || 'emergency',
            data.elevator_id,
            data.building,
            data.floor,
            data.status,
            data.ip_address || rinfo.address
        )

        // Update elevator status if it exists in database
        const updateElevator = db.prepare(`
            UPDATE elevators 
            SET status = ?, last_seen = ?, ip_address = COALESCE(?, ip_address)
            WHERE id = ?
        `)
        const result = updateElevator.run(
            data.status === 'active' ? 'emergency' : 'normal',
            Date.now(),
            data.ip_address || rinfo.address,
            data.elevator_id
        )

        // If elevator doesn't exist, auto-register it
        if (result.changes === 0 && data.elevator_id) {
            const insertElevator = db.prepare(`
                INSERT OR IGNORE INTO elevators (id, building, floor, ip_address, status, last_seen)
                VALUES (?, ?, ?, ?, ?, ?)
            `)
            insertElevator.run(
                data.elevator_id,
                data.building || 'Unknown',
                data.floor || 0,
                data.ip_address || rinfo.address,
                data.status === 'active' ? 'emergency' : 'normal',
                Date.now()
            )
            console.log(`Auto-registered new elevator: ${data.elevator_id}`)
        }

        // Notify renderer process
        mainWindow?.webContents.send('elevator-event', {
            ...data,
            ip_address: data.ip_address || rinfo.address,
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
function sendAcknowledgment(ipAddress: string, elevatorId: string, port: number = 5001) {
    const client = dgram.createSocket('udp4')
    const message = JSON.stringify({
        type: 'acknowledgment',
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
    return elevators.map((el: any) => ({
        id: el.id,
        building: el.building,
        floor: el.floor,
        ip_address: el.ip_address,
        status: el.status,
        lastSeen: el.last_seen,
        x: el.x,
        y: el.y
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
    return { success: true }
})

// Remove an elevator
ipcMain.handle('remove-elevator', (_, elevatorId: string) => {
    const stmt = db.prepare('DELETE FROM elevators WHERE id = ?')
    stmt.run(elevatorId)
    return { success: true }
})

// Update elevator position (for canvas drag)
ipcMain.handle('update-elevator-position', (_, elevatorId: string, x: number, y: number) => {
    const stmt = db.prepare('UPDATE elevators SET x = ?, y = ? WHERE id = ?')
    stmt.run(x, y, elevatorId)
    return { success: true }
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

    // Update elevator status in database
    const updateElevator = db.prepare(`
        UPDATE elevators SET status = 'normal', last_seen = ? WHERE id = ?
    `)
    updateElevator.run(Date.now(), data.elevator_id)

    // Send UDP acknowledgment back to the elevator's IP if available
    if (data.ip_address) {
        sendAcknowledgment(data.ip_address, data.elevator_id)
    }

    // Notify renderer that the emergency was acknowledged
    mainWindow?.webContents.send('elevator-event', {
        ...data,
        status: 'acknowledged',
        timestamp: new Date().toISOString()
    })

    return { success: true }
})

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
