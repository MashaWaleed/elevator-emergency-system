import { useState } from 'react'
import { Elevator } from '../types'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Save, Move, HardDrive, Layout, Terminal, CheckCircle, Building2, Layers, Hash, Wifi, Globe } from 'lucide-react'

interface Props {
    elevators: Elevator[];
    onElevatorsChange: (elevators: Elevator[]) => void;
}

export default function DashboardBuilder({ elevators, onElevatorsChange }: Props) {
    const [newEl, setNewEl] = useState({ id: '', building: '', floor: 0, ip_address: '' })
    const [isSaving, setIsSaving] = useState(false)
    const [showSaveSuccess, setShowSaveSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const addElevator = async () => {
        if (!newEl.id.trim()) {
            setError('Node ID is required')
            return
        }
        if (!newEl.ip_address.trim()) {
            setError('IP Address is required')
            return
        }

        // Validate IP address format
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
        if (!ipRegex.test(newEl.ip_address.trim())) {
            setError('Invalid IP address format (e.g., 192.168.1.100)')
            return
        }

        // Check for duplicate ID
        if (elevators.some(e => e.id === newEl.id.trim())) {
            setError('A node with this ID already exists')
            return
        }

        setError(null)

        const elevator: Elevator = {
            id: newEl.id.trim(),
            building: newEl.building.trim() || 'Unassigned',
            floor: newEl.floor,
            ip_address: newEl.ip_address.trim(),
            status: 'offline',
            lastSeen: 0,
            x: 60 + (elevators.length % 4) * 160,
            y: 60 + Math.floor(elevators.length / 4) * 140
        }

        try {
            // Save to database
            await window.electron.invoke('add-elevator', elevator)

            // Update local state
            onElevatorsChange([...elevators, elevator])

            // Reset form
            setNewEl({ id: '', building: '', floor: 0, ip_address: '' })

            // Show success
            setShowSaveSuccess(true)
            setTimeout(() => setShowSaveSuccess(false), 2000)
        } catch (err) {
            console.error('Failed to add elevator:', err)
            setError('Failed to save elevator to database')
        }
    }

    const removeElevator = async (id: string) => {
        try {
            await window.electron.invoke('remove-elevator', id)
            onElevatorsChange(elevators.filter(e => e.id !== id))
        } catch (err) {
            console.error('Failed to remove elevator:', err)
        }
    }

    const updatePosition = async (id: string, x: number, y: number) => {
        try {
            await window.electron.invoke('update-elevator-position', id, x, y)
        } catch (err) {
            console.error('Failed to update position:', err)
        }
    }

    return (
        <div className="flex flex-col gap-6 h-full">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="badge">
                            <Layers size={10} className="mr-1" />
                            Configuration Mode
                        </span>
                        <span className="text-xs font-mono text-tertiary">
                            Database synced
                        </span>
                    </div>
                    <h1 className="mb-2">System Constructor</h1>
                    <p className="text-secondary text-sm">Register elevator nodes with their network addresses</p>
                </div>
            </header>

            {/* Main Grid */}
            <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left Control Panel */}
                <div className="col-span-4 flex flex-col gap-5 h-full overflow-hidden">
                    {/* Add New Node Form */}
                    <div className="glass p-6 relative overflow-hidden">
                        {/* Gradient Accent */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-violet-500" />

                        <h3 className="font-semibold flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center">
                                <Plus size={16} className="text-blue-400" />
                            </div>
                            Register New Node
                        </h3>

                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            <FormField
                                label="Node Identifier"
                                icon={<Hash size={14} />}
                                placeholder="e.g. ELEV-NORTH-01"
                                value={newEl.id}
                                onChange={e => setNewEl({ ...newEl, id: e.target.value })}
                            />
                            <FormField
                                label="IP Address"
                                icon={<Globe size={14} />}
                                placeholder="192.168.1.100"
                                value={newEl.ip_address}
                                onChange={e => setNewEl({ ...newEl, ip_address: e.target.value })}
                            />
                            <FormField
                                label="Building / Zone"
                                icon={<Building2 size={14} />}
                                placeholder="North Wing A"
                                value={newEl.building}
                                onChange={e => setNewEl({ ...newEl, building: e.target.value })}
                            />
                            <FormField
                                label="Floor Level"
                                icon={<Layers size={14} />}
                                placeholder="0"
                                type="number"
                                value={newEl.floor.toString()}
                                onChange={e => setNewEl({ ...newEl, floor: parseInt(e.target.value) || 0 })}
                            />

                            <motion.button
                                className="btn btn-primary w-full justify-center mt-2"
                                onClick={addElevator}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                            >
                                <AnimatePresence mode="wait">
                                    {showSaveSuccess ? (
                                        <motion.div
                                            key="success"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className="flex items-center gap-2"
                                        >
                                            <CheckCircle size={18} />
                                            Added!
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="add"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className="flex items-center gap-2"
                                        >
                                            <Plus size={18} />
                                            Add to Network
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        </div>
                    </div>

                    {/* Node Registry List */}
                    <div className="glass flex-1 p-5 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-semibold flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                    <Terminal size={14} className="text-tertiary" />
                                </div>
                                Node Registry
                            </h3>
                            <span className="badge font-mono">
                                {elevators.length} {elevators.length === 1 ? 'node' : 'nodes'}
                            </span>
                        </div>

                        <div className="flex-1 overflow-auto flex flex-col gap-2 pr-1">
                            <AnimatePresence>
                                {elevators.map((el, index) => (
                                    <motion.div
                                        key={el.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20, height: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="group"
                                    >
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-transparent hover:border-white/10 hover:bg-white/[0.05] transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center border border-white/5 relative">
                                                    <HardDrive size={16} className="text-muted group-hover:text-blue-400 transition-colors" />
                                                    <div
                                                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2"
                                                        style={{
                                                            background: el.status === 'emergency' ? 'var(--danger)' :
                                                                el.lastSeen > 0 ? 'var(--success)' : 'var(--text-muted)',
                                                            borderColor: 'var(--bg-tertiary)'
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm tracking-tight">{el.id}</p>
                                                    <p className="text-xs text-muted font-mono">
                                                        {el.ip_address}
                                                    </p>
                                                    <p className="text-xs text-muted uppercase tracking-wide">
                                                        {el.building} • FL {el.floor}
                                                    </p>
                                                </div>
                                            </div>
                                            <motion.button
                                                onClick={() => removeElevator(el.id)}
                                                className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                            >
                                                <Trash2 size={14} />
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {elevators.length === 0 && (
                                <div className="flex-1 flex items-center justify-center">
                                    <p className="text-sm text-muted italic text-center">
                                        No nodes registered.<br />
                                        Add nodes using the form above.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Spatial Mapping Canvas */}
                <div className="col-span-8 glass relative flex flex-col overflow-hidden">
                    {/* Canvas Header */}
                    <div className="p-5 border-b flex items-center justify-between bg-black/20">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
                                <Layout size={14} className="text-violet-400" />
                            </div>
                            <span className="font-semibold text-sm">Spatial Layout Canvas</span>
                        </div>
                        <div className="flex items-center gap-5 text-xs font-medium text-muted">
                            <LegendDot color="var(--success)" label="Online" />
                            <LegendDot color="var(--danger)" label="Emergency" />
                            <LegendDot color="var(--text-muted)" label="Offline" />
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 relative canvas-grid overflow-hidden">
                        {/* Drag Hint */}
                        {elevators.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <motion.div
                                    animate={{ y: [0, -10, 0], opacity: [0.1, 0.2, 0.1] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                >
                                    <Move size={80} className="text-white mb-4" />
                                </motion.div>
                                <p className="text-muted text-sm">Nodes will appear here for spatial mapping</p>
                            </div>
                        )}

                        {/* Draggable Nodes */}
                        <AnimatePresence>
                            {elevators.map((el) => (
                                <motion.div
                                    key={el.id}
                                    drag
                                    dragMomentum={false}
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    whileDrag={{ scale: 1.08, zIndex: 50, cursor: 'grabbing' }}
                                    whileHover={{ scale: 1.02 }}
                                    onDragEnd={(_, info) => {
                                        const newX = el.x + info.offset.x
                                        const newY = el.y + info.offset.y
                                        updatePosition(el.id, newX, newY)
                                    }}
                                    className="absolute cursor-grab active:cursor-grabbing"
                                    style={{ left: el.x, top: el.y }}
                                >
                                    <div className={`w-40 glass-card p-4 flex flex-col items-center text-center group ${el.status === 'emergency' ? 'border-danger/40' : 'border-white/10'}`}>
                                        {/* Status Dot */}
                                        <div
                                            className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                                            style={{
                                                background: el.status === 'emergency' ? 'var(--danger)' :
                                                    el.lastSeen > 0 ? 'var(--success)' : 'var(--text-muted)',
                                                boxShadow: el.status === 'emergency' ? '0 0 8px rgba(239, 68, 68, 0.5)' :
                                                    el.lastSeen > 0 ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none'
                                            }}
                                        />

                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:bg-blue-500/10 transition-colors">
                                            <HardDrive size={18} className="text-muted group-hover:text-blue-400 transition-colors" />
                                        </div>

                                        <span className="text-xs font-bold uppercase tracking-tight mb-1 group-hover:text-blue-400 transition-colors">
                                            {el.id}
                                        </span>
                                        <span className="text-xs text-tertiary font-mono mb-1">
                                            {el.ip_address}
                                        </span>
                                        <span className="text-xs text-muted font-medium uppercase tracking-wider">
                                            {el.building}
                                        </span>

                                        <div className="mt-2 px-2.5 py-1 rounded-md bg-black/30 text-xs font-mono text-tertiary">
                                            FL {el.floor}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Canvas Footer */}
                    <div className="p-4 bg-black/30 border-t flex justify-between text-xs font-mono text-muted">
                        <span>REAL-TIME SYNC: ENABLED</span>
                        <span>GRID: 32×32px</span>
                        <span>DRAG NODES TO REPOSITION</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function FormField({
    label,
    icon,
    placeholder,
    value,
    onChange,
    type = 'text'
}: {
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide ml-1">
                {icon}
                {label}
            </label>
            <input
                className="input"
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
            />
        </div>
    )
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span>{label}</span>
        </div>
    )
}
