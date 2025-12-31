import { Elevator } from '../types'
import { motion } from 'framer-motion'
import { Building2, Activity, Wifi, WifiOff, AlertTriangle, Zap, Signal, Server, Globe, Clock } from 'lucide-react'

export default function Monitoring({ elevators }: { elevators: Elevator[] }) {
    const emergencies = elevators.filter(e => e.status === 'emergency').length
    const online = elevators.filter(e => e.lastSeen > 0 && Date.now() - e.lastSeen < 60000).length

    return (
        <div className="flex flex-col gap-6 h-full">
            {/* Header Section */}
            <header className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="badge badge-green">
                            <span className="live-dot" style={{ width: 6, height: 6, marginRight: 6 }} />
                            System Active
                        </span>
                        <span className="text-tertiary text-sm font-mono">
                            {new Date().toLocaleDateString('en-US', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            })}
                        </span>
                    </div>
                    <h1 className="mb-2">Command Center</h1>
                    <p className="text-secondary text-sm">Real-time elevator network monitoring & emergency response</p>
                </div>

                {/* Stats Row */}
                <div className="flex gap-4">
                    <StatCard
                        icon={<Server size={18} />}
                        label="Registered"
                        value={elevators.length}
                        accentColor="blue"
                    />
                    <StatCard
                        icon={<Signal size={18} />}
                        label="Online"
                        value={online}
                        suffix={`/ ${elevators.length}`}
                        accentColor="cyan"
                    />
                    <StatCard
                        icon={<AlertTriangle size={18} />}
                        label="Emergencies"
                        value={emergencies}
                        accentColor={emergencies > 0 ? "red" : "green"}
                        highlight={emergencies > 0}
                    />
                </div>
            </header>

            {/* Main Monitoring Grid */}
            <div className="flex-1 glass p-6 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center">
                            <Activity size={16} className="text-blue-400" />
                        </div>
                        <span className="font-semibold text-sm">Network Overview</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-tertiary">
                        <LegendItem color="var(--success)" label="Normal" />
                        <LegendItem color="var(--danger)" label="Emergency" />
                        <LegendItem color="var(--text-muted)" label="Offline" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    {elevators.length > 0 ? (
                        <div className="grid grid-cols-4 gap-5">
                            {elevators.map((elevator, index) => (
                                <motion.div
                                    key={elevator.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05, duration: 0.3 }}
                                >
                                    <ElevatorCard elevator={elevator} />
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState />
                    )}
                </div>
            </div>
        </div>
    )
}

function ElevatorCard({ elevator }: { elevator: Elevator }) {
    const isEmergency = elevator.status === 'emergency'
    const isOnline = elevator.lastSeen > 0 && Date.now() - elevator.lastSeen < 60000
    const isOffline = !isOnline
    const statusColor = isEmergency ? 'var(--danger)' : isOffline ? 'var(--text-muted)' : 'var(--success)'

    const getTimeSinceLastSeen = () => {
        if (!elevator.lastSeen) return 'Never'
        const seconds = Math.floor((Date.now() - elevator.lastSeen) / 1000)
        if (seconds < 60) return `${seconds}s ago`
        const minutes = Math.floor(seconds / 60)
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        return `${hours}h ago`
    }

    return (
        <div className={`elevator-card group ${isEmergency ? 'emergency' : ''}`}>
            {/* Top Row - Icon & Status */}
            <div className="flex justify-between items-start mb-4">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all"
                    style={{
                        background: isEmergency
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${isEmergency ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`
                    }}
                >
                    <Building2
                        size={22}
                        className={isEmergency ? 'text-danger' : isOffline ? 'text-muted' : 'text-blue-400'}
                    />
                </div>
                <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={isEmergency ? 'emergency' : isOffline ? 'offline' : 'normal'} />
                </div>
            </div>

            {/* Elevator Info */}
            <div className="mb-4">
                <h3 className="text-lg font-bold tracking-tight mb-1 group-hover:text-blue-400 transition-colors">
                    {elevator.id}
                </h3>
                <div className="flex items-center gap-2 text-xs text-tertiary mb-1">
                    <Globe size={12} />
                    <span className="font-mono">{elevator.ip_address}</span>
                </div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium">
                    {elevator.building} • Floor {elevator.floor}
                </p>
            </div>

            {/* Connection Status */}
            <div className="mb-4 p-3 rounded-lg bg-black/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isOffline ? (
                        <WifiOff size={14} className="text-muted" />
                    ) : (
                        <Wifi size={14} className="text-success" />
                    )}
                    <span className="text-xs font-mono">
                        {isOffline ? 'DISCONNECTED' : 'CONNECTED'}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={10} />
                    <span className="font-mono">{getTimeSinceLastSeen()}</span>
                </div>
            </div>

            {/* Bottom Stats */}
            <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-0.5 font-semibold">Status</p>
                    <div className="flex items-center gap-2">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{
                                background: statusColor,
                                boxShadow: isEmergency ? '0 0 8px var(--danger-glow)' : undefined
                            }}
                        />
                        <p className="text-sm font-mono font-medium">
                            {isEmergency ? 'ALERT' : isOffline ? 'OFFLINE' : 'NORMAL'}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-muted uppercase tracking-wide mb-0.5 font-semibold">Last Ping</p>
                    <p className="text-sm font-mono">
                        {elevator.lastSeen
                            ? new Date(elevator.lastSeen).toLocaleTimeString([], { hour12: false })
                            : '--:--:--'
                        }
                    </p>
                </div>
            </div>

            {/* Glow Effect for Emergency */}
            {isEmergency && (
                <motion.div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    animate={{
                        boxShadow: [
                            '0 0 20px rgba(239, 68, 68, 0.2)',
                            '0 0 40px rgba(239, 68, 68, 0.4)',
                            '0 0 20px rgba(239, 68, 68, 0.2)'
                        ]
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: 'normal' | 'emergency' | 'offline' }) {
    const configs = {
        normal: {
            className: 'status-normal',
            label: 'Normal'
        },
        emergency: {
            className: 'status-emergency',
            label: 'Emergency'
        },
        offline: {
            className: 'status-offline',
            label: 'Offline'
        }
    }
    const config = configs[status]

    return (
        <span className={`status-indicator ${config.className}`}>
            {status === 'emergency' && <Zap size={10} />}
            {config.label}
        </span>
    )
}

function StatCard({
    icon,
    label,
    value,
    suffix = '',
    accentColor = 'blue',
    highlight = false
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    suffix?: string;
    accentColor?: 'blue' | 'cyan' | 'green' | 'red';
    highlight?: boolean;
}) {
    const colors = {
        blue: 'var(--accent-blue)',
        cyan: 'var(--accent-cyan)',
        green: 'var(--success)',
        red: 'var(--danger)'
    }

    return (
        <motion.div
            className="stat-card flex items-center gap-4 min-w-[180px]"
            animate={highlight ? {
                boxShadow: [
                    '0 0 15px rgba(239, 68, 68, 0.2)',
                    '0 0 25px rgba(239, 68, 68, 0.4)',
                    '0 0 15px rgba(239, 68, 68, 0.2)'
                ]
            } : {}}
            transition={highlight ? { duration: 2, repeat: Infinity } : {}}
            style={highlight ? { borderColor: 'rgba(239, 68, 68, 0.3)' } : {}}
        >
            <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{
                    background: `${colors[accentColor]}15`,
                    border: `1px solid ${colors[accentColor]}30`
                }}
            >
                <span style={{ color: colors[accentColor] }}>{icon}</span>
            </div>
            <div>
                <p className="text-xs text-muted uppercase tracking-wide font-semibold mb-1">{label}</p>
                <div className="flex items-baseline gap-1">
                    <span
                        className="text-2xl font-bold font-mono"
                        style={{ color: highlight ? colors[accentColor] : undefined }}
                    >
                        {value}
                    </span>
                    {suffix && <span className="text-sm text-tertiary font-mono">{suffix}</span>}
                </div>
            </div>
        </motion.div>
    )
}

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
            />
            <span className="font-medium">{label}</span>
        </div>
    )
}

function EmptyState() {
    return (
        <div className="h-full flex flex-col items-center justify-center">
            <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
                <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-6">
                    <Building2 size={48} className="text-muted opacity-30" />
                </div>
            </motion.div>
            <h3 className="text-lg font-semibold text-secondary mb-2">No Monitoring Nodes</h3>
            <p className="text-sm text-muted max-w-xs text-center">
                Configure elevator nodes in the Build panel to start monitoring your network.
            </p>
        </div>
    )
}
