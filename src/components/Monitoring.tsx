import { Elevator } from '../types'
import { useState, useRef, useEffect } from 'react'
import { Building2, Activity, Wifi, WifiOff, AlertTriangle, Zap, Signal, Server, Globe, Clock, DoorOpen } from 'lucide-react'

export default function Monitoring({ elevators }: { elevators: Elevator[] }) {
    // Force re-render every 5 seconds to update online/offline status
    const [, setTick] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 5000)
        return () => clearInterval(interval)
    }, [])

    const emergencies = elevators.filter(e => e.status === 'emergency').length
    const online = elevators.filter(e => e.lastSeen > 0 && Date.now() - e.lastSeen < 60000).length
    
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const canvasRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    // Auto-fit all nodes on mount or when elevators change
    useEffect(() => {
        if (elevators.length > 0 && canvasRef.current) {
            autoFitNodes()
        }
    }, [elevators.length])

    const autoFitNodes = () => {
        if (elevators.length === 0 || !canvasRef.current) return
        
        const bounds = {
            minX: Math.min(...elevators.map(e => e.x)),
            maxX: Math.max(...elevators.map(e => e.x + 160)),
            minY: Math.min(...elevators.map(e => e.y)),
            maxY: Math.max(...elevators.map(e => e.y + 140))
        }
        
        const width = bounds.maxX - bounds.minX
        const height = bounds.maxY - bounds.minY
        const containerWidth = canvasRef.current.clientWidth
        const containerHeight = canvasRef.current.clientHeight
        
        const zoomX = containerWidth / (width + 20)
        const zoomY = containerHeight / (height + 20)
        const newZoom = Math.min(zoomX, zoomY, 1.5)
        
        setZoom(newZoom)
        setPan({
            x: (containerWidth - width * newZoom) / 2 - bounds.minX * newZoom,
            y: (containerHeight - height * newZoom) / 2 - bounds.minY * newZoom
        })
    }

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)))
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPan({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            })
        }
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

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

            {/* Spatial Canvas View */}
            <div className="flex-1 glass overflow-hidden flex flex-col">
                <div className="p-5 border-b flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <Activity size={14} className="text-tertiary" />
                        </div>
                        <span className="font-semibold text-sm">Spatial Layout</span>
                    </div>
                    <div className="flex items-center gap-5 text-xs font-medium text-muted">
                        <LegendDot color="var(--success)" label="Online" />
                        <LegendDot color="var(--danger)" label="Emergency" />
                        <LegendDot color="var(--text-muted)" label="Offline" />
                    </div>
                </div>

                <div 
                    ref={canvasRef}
                    className="flex-1 relative canvas-grid overflow-hidden"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                >
                    {elevators.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <div
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: '0 0',
                                width: '100%',
                                height: '100%',
                                position: 'relative'
                            }}
                        >
                            {/* SVG Layer for Lines */}
                            <svg
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    width: '100%',
                                    height: '100%',
                                    pointerEvents: 'none',
                                    zIndex: 0,
                                    overflow: 'visible'
                                }}
                            >
                                {elevators.map((node) => 
                                    node.elevators?.map((elevator) => (
                                        <line
                                            key={`line-${elevator.id}`}
                                            x1={node.x + 80}
                                            y1={node.y + 80}
                                            x2={elevator.x + 64}
                                            y2={elevator.y + 48}
                                            stroke="rgba(59, 130, 246, 0.4)"
                                            strokeWidth="2"
                                        />
                                    ))
                                )}
                            </svg>
                            
                            {elevators.map((node) => (
                                <div key={node.id}>
                                    {/* Node */}
                                    <div
                                        className="absolute"
                                        style={{ left: node.x, top: node.y }}
                                    >
                                        <NodeDisplay node={node} />
                                    </div>
                                    
                                    {/* Elevators linked to this node */}
                                    {node.elevators?.map((elevator) => (
                                        <div
                                            key={elevator.id}
                                            className="absolute"
                                            style={{ left: elevator.x, top: elevator.y }}
                                        >
                                            <ElevatorDisplay elevator={elevator} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-black/30 border-t flex justify-between text-xs font-mono text-muted">
                    <span>LIVE MONITORING</span>
                    <span>ZOOM: {(zoom * 100).toFixed(0)}%</span>
                    <span>SCROLL TO ZOOM • DRAG TO PAN</span>
                </div>
            </div>
        </div>
    )
}

function NodeDisplay({ node }: { node: Elevator }) {
    const isEmergency = node.status === 'emergency'
    const isOnline = node.lastSeen > 0 && Date.now() - node.lastSeen < 60000
    const isOffline = !isOnline
    const statusColor = isEmergency ? 'var(--danger)' : isOffline ? 'var(--text-muted)' : 'var(--success)'

    return (
        <div className={`w-40 glass-card relative p-4 flex flex-col items-center text-center group ${isEmergency ? 'border-danger/40' : 'border-white/10'}`} style={{userSelect: 'none'}}>
            {/* Live Status Indicator - Top Left */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <div
                    className="w-2 h-2 rounded-full"
                    style={{
                        background: isOnline ? 'var(--success)' : 'var(--danger)',
                        boxShadow: isOnline ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(239, 68, 68, 0.4)'
                    }}
                />
                <span
                    className="text-xs font-mono"
                    style={{ color: isOnline ? 'var(--success)' : 'var(--danger)' }}
                >
                    {isOnline ? 'LIVE' : 'OFF'}
                </span>
            </div>
            
            {/* Emergency Status Indicator - Top Right */}
            <div
                className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                style={{
                    background: statusColor,
                    boxShadow: isEmergency ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                    display: isEmergency ? 'block' : 'none'
                }}
            />

            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                <Server size={18} className="text-muted" />
            </div>

            <span className="text-xs font-bold uppercase tracking-tight mb-1">
                {node.id}
            </span>
            <span className="text-xs text-tertiary font-mono mb-1">
                {node.ip_address}
            </span>
            <span className="text-xs text-muted font-medium uppercase tracking-wider">
                {node.building}
            </span>

            <div className="mt-2 px-2.5 py-1 rounded-md bg-black/30 text-xs font-mono text-tertiary">
                FL {node.floor}
            </div>
            
            {isEmergency && (
                <div className="mt-2 text-xs font-bold text-danger uppercase tracking-wide">
                    EMERGENCY
                </div>
            )}
        </div>
    )
}

function ElevatorDisplay({ elevator }: { elevator: any }) {
    const isEmergency = elevator.status === 'emergency'
    const statusColor = isEmergency ? 'var(--danger)' : 'var(--success)'

    return (
        <div className={`w-32 glass-card p-3 flex flex-col items-center text-center ${isEmergency ? 'border-danger/40' : 'border-white/10'}`} style={{userSelect: 'none'}}>
            <div
                className="absolute top-2 right-2 w-2 h-2 rounded-full"
                style={{
                    background: statusColor,
                    boxShadow: isEmergency ? '0 0 6px rgba(239, 68, 68, 0.5)' : 'none'
                }}
            />

            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-2">
                <DoorOpen size={16} className={isEmergency ? "text-danger" : "text-muted"} />
            </div>

            <span className="text-xs font-bold uppercase tracking-tight">
                {elevator.label}
            </span>
            
            {isEmergency && (
                <div className="mt-1 text-xs font-bold text-danger uppercase">
                    ALERT
                </div>
            )}
        </div>
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
        <div
            className="stat-card flex items-center gap-4 min-w-[180px]"
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
        </div>
    )
}

function LegendDot({ color, label }: { color: string; label: string }) {
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
            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-6">
                <Building2 size={48} className="text-muted opacity-30" />
            </div>
            <h3 className="text-lg font-semibold text-secondary mb-2">No Monitoring Nodes</h3>
            <p className="text-sm text-muted max-w-xs text-center">
                Configure elevator nodes in the Build panel to start monitoring your network.
            </p>
        </div>
    )
}
