import { useState, useEffect } from 'react'
import { LayoutDashboard, ShieldAlert, Settings, History, Radio } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Monitoring from './components/Monitoring'
import DashboardBuilder from './components/DashboardBuilder'
import HistoryView from './components/History'
import AlertModal from './components/AlertModal'
import { Elevator, EmergencyEvent } from './types'

export default function App() {
    const [activeTab, setActiveTab] = useState<'monitoring' | 'builder' | 'history'>('monitoring')
    const [elevators, setElevators] = useState<Elevator[]>([])
    const [activeEmergency, setActiveEmergency] = useState<EmergencyEvent | null>(null)
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

            if (data.status === 'active') {
                setActiveEmergency(data)
                setIsAlarmPlaying(true)
                playAlertSound()
            } else if (data.status === 'acknowledged') {
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
        setElevators(prev => {
            // Check if elevator exists
            const exists = prev.some(el => el.id === data.elevator_id)

            if (!exists) {
                // New elevator auto-registered via UDP - reload from DB
                loadElevators()
                return prev
            }

            return prev.map(el => {
                if (el.id === data.elevator_id) {
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

    const acknowledgeEmergency = async () => {
        if (activeEmergency) {
            try {
                await window.electron.invoke('acknowledge-emergency', activeEmergency)
                if (window.alertAudio) {
                    window.alertAudio.pause()
                    window.alertAudio = null
                }
                setActiveEmergency(null)
                setIsAlarmPlaying(false)

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
            {/* Premium Sidebar Navigation */}
            <aside className="sidebar flex flex-col items-center py-6 gap-3">
                {/* Logo */}
                <motion.div
                    className="flex items-center justify-center mb-6"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/30 flex items-center justify-center">
                            <ShieldAlert size={24} className="text-blue-400" />
                        </div>
                        <div
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                            style={{
                                background: isAlarmPlaying ? 'var(--danger)' : 'var(--success)',
                                borderColor: 'var(--bg-primary)',
                                boxShadow: isAlarmPlaying
                                    ? '0 0 8px rgba(239, 68, 68, 0.6)'
                                    : '0 0 8px rgba(16, 185, 129, 0.6)'
                            }}
                        />
                    </div>
                </motion.div>

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
                <AnimatePresence mode="wait">
                    {activeTab === 'monitoring' && (
                        <motion.div
                            key="monitoring"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="h-full"
                        >
                            <Monitoring elevators={elevators} />
                        </motion.div>
                    )}
                    {activeTab === 'builder' && (
                        <motion.div
                            key="builder"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="h-full"
                        >
                            <DashboardBuilder
                                elevators={elevators}
                                onElevatorsChange={handleElevatorsChange}
                            />
                        </motion.div>
                    )}
                    {activeTab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="h-full"
                        >
                            <HistoryView />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <AlertModal
                emergency={activeEmergency}
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
        <motion.button
            onClick={onClick}
            className={`nav-item ${active ? 'active' : ''}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            {icon}
            <span className="text-xs font-bold tracking-wider">{label}</span>
        </motion.button>
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
