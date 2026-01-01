import { useState, useEffect } from 'react'
import { LayoutDashboard, ShieldAlert, Settings, History } from 'lucide-react'
import Monitoring from './components/Monitoring'
import DashboardBuilder from './components/DashboardBuilder'
import HistoryView from './components/History'
import AlertModal from './components/AlertModal'
import { Elevator, EmergencyEvent } from './types'

export default function App() {
    const [activeTab, setActiveTab] = useState<'monitoring' | 'builder' | 'history'>('monitoring')
    const [elevators, setElevators] = useState<Elevator[]>([])
    const [activeEmergencies, setActiveEmergencies] = useState<EmergencyEvent[]>([])
    const [isAlarmPlaying, setIsAlarmPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

    // Load elevators from database on mount
    const loadElevators = async () => {
        try {
            const dbElevators = await window.electron.invoke('get-elevators')
            setElevators(dbElevators)
        } catch (err) {
            console.error('Failed to load elevators:', err)
        }
    }

    useEffect(() => {
        // Initial load
        loadElevators()

        // Listen for elevator events from UDP
        const unsubscribe = window.electron.on('elevator-event', (data: EmergencyEvent) => {
            console.log('Received elevator event:', data)

            // Get both node_id and elevator_id for proper tracking
            const nodeId = data.node_id || data.elevator_id
            const elevatorId = data.elevator_id || data.node_id

            if (data.type === 'heartbeat') {
                // For heartbeats, just update lastSeen without triggering emergency
                setElevators(prev => prev.map(el => {
                    if (el.id === nodeId) {
                        return { ...el, lastSeen: Date.now() }
                    }
                    return el
                }))
                return
            }

            if (data.status === 'active') {
                // Add to emergencies list if not already there - track by elevator_id to allow stacking
                setActiveEmergencies(prev => {
                    const exists = prev.some(e => e.elevator_id === elevatorId)
                    if (!exists) {
                        return [...prev, { ...data, node_id: nodeId, elevator_id: elevatorId }]
                    }
                    return prev
                })
                setIsAlarmPlaying(true)
                playAlertSound()
            } else if (data.status === 'acknowledged') {
                // Remove from emergencies list by elevator_id
                setActiveEmergencies(prev => prev.filter(e => e.elevator_id !== elevatorId))
                // Refresh elevators list to get updated status
                loadElevators()
            }

            // Update local elevator status
            updateElevatorStatus(data)
        })

        // Update time every second
        const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000)

        // Periodically refresh elevator list
        const refreshInterval = setInterval(loadElevators, 10000)

        return () => {
            unsubscribe()
            clearInterval(timeInterval)
            clearInterval(refreshInterval)
        }
    }, [])

    const updateElevatorStatus = (data: EmergencyEvent) => {
        const nodeId = data.node_id || data.elevator_id
        
        setElevators(prev => {
            // Check if elevator exists
            const exists = prev.some(el => el.id === nodeId)

            if (!exists) {
                // New elevator auto-registered via UDP - reload from DB
                loadElevators()
                return prev
            }

            return prev.map(el => {
                if (el.id === nodeId) {
                    return {
                        ...el,
                        status: data.status === 'active' ? 'emergency' : 'normal',
                        lastSeen: Date.now(),
                        ip_address: data.ip_address || el.ip_address
                    } as Elevator
                }
                return el
            })
        })
    }

    const playAlertSound = () => {
        if (window.alertAudio) {
            window.alertAudio.pause()
        }
        // More urgent industrial alarm sound
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3')
        audio.loop = true
        audio.play().catch(err => console.error('Failed to play audio:', err))
        window.alertAudio = audio
    }

    const acknowledgeEmergency = async (elevatorId: string) => {
        const emergency = activeEmergencies.find(e => e.elevator_id === elevatorId)
        if (emergency) {
            try {
                await window.electron.invoke('acknowledge-emergency', emergency)
                
                // Remove from active emergencies
                setActiveEmergencies(prev => prev.filter(e => e.elevator_id !== elevatorId))
                
                // Stop alarm if no more emergencies
                if (activeEmergencies.length <= 1) {
                    if (window.alertAudio) {
                        window.alertAudio.pause()
                        window.alertAudio = null
                    }
                    setIsAlarmPlaying(false)
                }

                // Refresh elevator list
                loadElevators()
            } catch (err) {
                console.error('Failed to acknowledge emergency:', err)
            }
        }
    }

    // Callback when elevators are modified in the builder
    const handleElevatorsChange = (newElevators: Elevator[]) => {
        setElevators(newElevators)
    }

    const tabs = [
        { id: 'monitoring', icon: LayoutDashboard, label: 'LIVE' },
        { id: 'builder', icon: Settings, label: 'BUILD' },
        { id: 'history', icon: History, label: 'LOGS' },
    ] as const

    return (
        <div className="flex h-full overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="sidebar flex flex-col items-center py-6 gap-3">
                {/* Logo */}
                <div className="flex items-center justify-center mb-6">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/30 flex items-center justify-center">
                            <ShieldAlert size={24} className="text-blue-400" />
                        </div>
                        <div
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                            style={{
                                background: isAlarmPlaying ? 'var(--danger)' : 'var(--success)',
                                borderColor: 'var(--bg-primary)'
                            }}
                        />
                    </div>
                </div>

                {/* Navigation Items */}
                <nav className="flex flex-col items-center gap-2">
                    {tabs.map((tab) => (
                        <NavButton
                            key={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            icon={<tab.icon size={20} />}
                            label={tab.label}
                        />
                    ))}
                </nav>

                {/* Bottom Status Section */}
                <div className="mt-auto flex flex-col items-center gap-4 py-4">
                    {/* System Status Indicator */}
                    <div className="flex flex-col items-center gap-2">
                        <div className={`live-dot ${isAlarmPlaying ? 'danger' : ''}`} />
                        <span className="text-xs font-mono text-tertiary">
                            {isAlarmPlaying ? 'ALERT' : 'OK'}
                        </span>
                    </div>

                    {/* Node Count */}
                    <div className="text-center">
                        <p className="text-xs font-mono text-muted">
                            {elevators.length} nodes
                        </p>
                    </div>

                    {/* Time Display */}
                    <div className="text-center">
                        <p className="text-xs font-mono text-muted">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative p-6">
                {activeTab === 'monitoring' && <Monitoring elevators={elevators} />}
                {activeTab === 'builder' && (
                    <DashboardBuilder
                        elevators={elevators}
                        onElevatorsChange={handleElevatorsChange}
                    />
                )}
                {activeTab === 'history' && <HistoryView />}
            </main>

            <AlertModal
                emergencies={activeEmergencies}
                onAcknowledge={acknowledgeEmergency}
            />
        </div>
    )
}

function NavButton({ active, onClick, icon, label }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string
}) {
    return (
        <button
            onClick={onClick}
            className={`nav-item ${active ? 'active' : ''}`}
        >
            {icon}
            <span className="text-xs font-bold tracking-wider">{label}</span>
        </button>
    )
}

declare global {
    interface Window {
        electron: {
            send: (channel: string, data: any) => void;
            on: (channel: string, func: (...args: any[]) => void) => () => void;
            invoke: (channel: string, ...args: any[]) => Promise<any>;
        };
        alertAudio: HTMLAudioElement | null;
    }
}
