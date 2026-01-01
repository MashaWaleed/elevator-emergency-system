import { useState, useRef, useEffect } from 'react'
import { Elevator, ElevatorUnit, PendingDevice } from '../types'
import { Plus, Trash2, Move, HardDrive, Layout, Terminal, CheckCircle, Building2, Layers, Hash, Globe, DoorOpen, Edit2, X } from 'lucide-react'

interface Props {
    elevators: Elevator[];
    onElevatorsChange: (elevators: Elevator[]) => void;
}

export default function DashboardBuilder({ elevators, onElevatorsChange }: Props) {
    const [newElevator, setNewElevator] = useState({ label: '', nodeId: '' })
    const [manualNode, setManualNode] = useState({ id: '', ip: '', building: '', floor: 0, unitIdsText: '' })
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [showNodeSuccess, setShowNodeSuccess] = useState(false)
    const [showElevatorSuccess, setShowElevatorSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Edit states
    const [editingNode, setEditingNode] = useState<{ id: string; newId: string; building: string; floor: number } | null>(null)
    const [editingUnit, setEditingUnit] = useState<{ nodeId: string; id: string; newId: string; label: string } | null>(null)

    const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([])
    const [pendingEdits, setPendingEdits] = useState<
        Record<string, { nodeId: string; building: string; floor: number; unitCount: number; unitIdsText: string }>
    >({})
    
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const canvasRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    const loadPendingDevices = async () => {
        try {
            const res = await window.electron.invoke('get-pending-devices')
            setPendingDevices(res)
            setPendingEdits(prev => {
                const next = { ...prev }
                for (const d of res as PendingDevice[]) {
                    if (!next[d.device_ip]) {
                        const suggested = d.mac_address
                            ? `NODE-${d.mac_address.replace(/:/g, '').toUpperCase()}`
                            : `NODE-${d.device_ip.replace(/\./g, '_')}`
                        next[d.device_ip] = {
                            nodeId: suggested,
                            building: '',
                            floor: 0,
                            unitCount: Math.max(0, d.buttons || 0),
                            unitIdsText: '',
                        }
                    }
                }
                return next
            })
        } catch (err) {
            console.error('Failed to load pending devices:', err)
        }
    }

    // Auto-fit all nodes on mount or when elevators change
    useEffect(() => {
        if (elevators.length > 0 && canvasRef.current) {
            autoFitNodes()
        }
    }, [elevators.length])

    useEffect(() => {
        loadPendingDevices()
        const unsub = window.electron.on('pending-device', (data: PendingDevice) => {
            setPendingDevices(prev => {
                const exists = prev.some(p => p.device_ip === data.device_ip)
                if (exists) {
                    return prev.map(p => (p.device_ip === data.device_ip ? { ...p, ...data } : p))
                }
                return [data, ...prev]
            })
            setPendingEdits(prev => {
                if (prev[data.device_ip]) return prev
                const suggested = data.mac_address
                    ? `NODE-${String(data.mac_address).replace(/:/g, '').toUpperCase()}`
                    : `NODE-${data.device_ip.replace(/\./g, '_')}`
                return {
                    ...prev,
                    [data.device_ip]: {
                        nodeId: suggested,
                        building: '',
                        floor: 0,
                        unitCount: Math.max(0, data.buttons || 0),
                        unitIdsText: '',
                    },
                }
            })
        })
        return () => {
            unsub()
        }
    }, [])

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
        if ((e.target as HTMLElement).closest('.draggable-item')) return
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

    const approvePendingDevice = async (deviceIp: string) => {
        const edit = pendingEdits[deviceIp] || { nodeId: '', building: '', floor: 0, unitCount: 0, unitIdsText: '' }
        try {
            setError(null)
            if (!edit.nodeId.trim()) {
                setError('Node ID is required')
                return
            }

            const unitIds = edit.unitIdsText
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(Boolean)

            await window.electron.invoke('approve-pending-device', {
                deviceIp,
                nodeId: edit.nodeId.trim(),
                building: edit.building,
                floor: edit.floor,
                unitCount: edit.unitCount,
                unitIds: unitIds.length > 0 ? unitIds : undefined,
            })
            const dbElevators = await window.electron.invoke('get-elevators')
            onElevatorsChange(dbElevators)
            await loadPendingDevices()
            setShowNodeSuccess(true)
            setTimeout(() => setShowNodeSuccess(false), 2000)
        } catch (err) {
            console.error('Failed to approve device:', err)
            setError('Failed to approve device')
        }
    }

    const registerNodeManually = async () => {
        try {
            setError(null)
            const nodeId = manualNode.id.trim()
            if (!nodeId) {
                setError('Node ID is required')
                return
            }
            const ip = manualNode.ip.trim()
            if (!ip) {
                setError('IP address is required')
                return
            }

            const unitIds = manualNode.unitIdsText
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(Boolean)

            await window.electron.invoke('add-elevator', {
                id: nodeId,
                building: manualNode.building || 'Unassigned',
                floor: manualNode.floor || 0,
                ip_address: ip,
                status: 'offline',
                lastSeen: 0,
                x: 60,
                y: 60,
            })

            for (let i = 0; i < unitIds.length; i++) {
                const uid = unitIds[i]
                const unit: ElevatorUnit = {
                    id: uid,
                    label: uid,
                    unitIndex: i + 1,
                    x: 60 + 180 + i * 140,
                    y: 60,
                    status: 'offline',
                    nodeId,
                }
                await window.electron.invoke('add-elevator-unit', unit)
            }

            const dbElevators = await window.electron.invoke('get-elevators')
            onElevatorsChange(dbElevators)
            setManualNode({ id: '', ip: '', building: '', floor: 0, unitIdsText: '' })
            setShowNodeSuccess(true)
            setTimeout(() => setShowNodeSuccess(false), 2000)
        } catch (err) {
            console.error('Failed to manually register node:', err)
            setError('Failed to manually register node')
        }
    }

    const rejectPendingDevice = async (deviceIp: string) => {
        try {
            setError(null)
            await window.electron.invoke('reject-pending-device', deviceIp)
            await loadPendingDevices()
        } catch (err) {
            console.error('Failed to reject device:', err)
            setError('Failed to reject device')
        }
    }

    const addElevatorToNode = async () => {
        if (!newElevator.label.trim()) {
            setError('Elevator label is required')
            return
        }
        if (!newElevator.nodeId) {
            setError('Please select a node')
            return
        }

        setError(null)

        const node = elevators.find(e => e.id === newElevator.nodeId)
        if (!node) return

        // Use the label as the ID (user-provided name)
        const elevatorId = newElevator.label.trim()

        const elevatorUnit: ElevatorUnit = {
            id: elevatorId,
            label: elevatorId,
            unitIndex: ((node.elevators?.length || 0) + 1),
            x: node.x + 180 + (node.elevators?.length || 0) * 150,
            y: node.y,
            status: 'offline',
            nodeId: newElevator.nodeId
        }

        try {
            // Save to database
            await window.electron.invoke('add-elevator-unit', elevatorUnit)

            const updatedElevators = elevators.map(el => {
                if (el.id === newElevator.nodeId) {
                    return {
                        ...el,
                        elevators: [...(el.elevators || []), elevatorUnit]
                    }
                }
                return el
            })

            onElevatorsChange(updatedElevators)
            setNewElevator({ label: '', nodeId: '' })
            setShowElevatorSuccess(true)
            setTimeout(() => setShowElevatorSuccess(false), 2000)
        } catch (err) {
            console.error('Failed to add elevator unit:', err)
            setError('Failed to save elevator unit to database')
        }
    }

    const removeNode = async (id: string) => {
        try {
            await window.electron.invoke('remove-elevator', id)
            onElevatorsChange(elevators.filter(e => e.id !== id))
        } catch (err) {
            console.error('Failed to remove node:', err)
        }
    }

    const removeElevatorUnit = async (nodeId: string, elevatorId: string) => {
        try {
            await window.electron.invoke('remove-elevator-unit', elevatorId)
            
            const updatedElevators = elevators.map(node => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        elevators: (node.elevators || []).filter(e => e.id !== elevatorId)
                    }
                }
                return node
            })
            onElevatorsChange(updatedElevators)
        } catch (err) {
            console.error('Failed to remove elevator unit:', err)
        }
    }

    const startEditNode = (node: Elevator) => {
        setEditingNode({
            id: node.id,
            newId: node.id,
            building: node.building,
            floor: node.floor
        })
    }

    const saveEditNode = async () => {
        if (!editingNode) return
        try {
            setError(null)
            const result = await window.electron.invoke('update-node', {
                oldId: editingNode.id,
                newId: editingNode.newId.trim(),
                building: editingNode.building,
                floor: editingNode.floor
            })
            if (!result.success) {
                setError(result.error || 'Failed to update node')
                return
            }
            // Refresh elevators from DB
            const dbElevators = await window.electron.invoke('get-elevators')
            onElevatorsChange(dbElevators)
            setEditingNode(null)
        } catch (err) {
            console.error('Failed to update node:', err)
            setError('Failed to update node')
        }
    }

    const startEditUnit = (nodeId: string, unit: ElevatorUnit) => {
        setEditingUnit({
            nodeId,
            id: unit.id,
            newId: unit.id,
            label: unit.label
        })
    }

    const saveEditUnit = async () => {
        if (!editingUnit) return
        try {
            setError(null)
            const result = await window.electron.invoke('update-elevator-unit', {
                oldId: editingUnit.id,
                newId: editingUnit.newId.trim(),
                label: editingUnit.label.trim()
            })
            if (!result.success) {
                setError(result.error || 'Failed to update elevator')
                return
            }
            // Refresh elevators from DB
            const dbElevators = await window.electron.invoke('get-elevators')
            onElevatorsChange(dbElevators)
            setEditingUnit(null)
        } catch (err) {
            console.error('Failed to update elevator unit:', err)
            setError('Failed to update elevator')
        }
    }

    const updateNodePosition = async (id: string, x: number, y: number) => {
        try {
            await window.electron.invoke('update-elevator-position', id, x, y)
        } catch (err) {
            console.error('Failed to update position:', err)
        }
    }

    const updateElevatorPosition = async (nodeId: string, elevatorId: string, x: number, y: number) => {
        try {
            await window.electron.invoke('update-elevator-unit-position', elevatorId, x, y)
            
            const updatedElevators = elevators.map(node => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        elevators: (node.elevators || []).map(e => 
                            e.id === elevatorId ? { ...e, x, y } : e
                        )
                    }
                }
                return node
            })
            onElevatorsChange(updatedElevators)
        } catch (err) {
            console.error('Failed to update elevator position:', err)
        }
    }

    const handleItemDragEnd = (id: string, type: 'node' | 'elevator', nodeId: string | null, offsetX: number, offsetY: number) => {
        if (type === 'node') {
            const node = elevators.find(e => e.id === id)
            if (node) {
                const newX = node.x + offsetX / zoom
                const newY = node.y + offsetY / zoom
                const updatedElevators = elevators.map(el => 
                    el.id === id ? { ...el, x: newX, y: newY } : el
                )
                onElevatorsChange(updatedElevators)
                updateNodePosition(id, newX, newY)
            }
        } else if (type === 'elevator' && nodeId) {
            const node = elevators.find(e => e.id === nodeId)
            const elevator = node?.elevators?.find(e => e.id === id)
            if (elevator) {
                const newX = elevator.x + offsetX / zoom
                const newY = elevator.y + offsetY / zoom
                updateElevatorPosition(nodeId, id, newX, newY)
            }
        }
    }

    return (
        <div className="flex flex-col gap-6 h-full">
            <header className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="badge">
                            <Layers size={10} className="mr-1" />
                            Configuration Mode
                        </span>
                    </div>
                    <h1 className="mb-2">System Constructor</h1>
                    <p className="text-secondary text-sm">Register nodes and configure elevators</p>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left Control Panel - Scrollable */}
                <div className="col-span-4 overflow-y-auto pr-1" style={{minHeight: 0}}>
                    <div className="flex flex-col gap-3">
                    {/* Pending Devices */}
                    <div className="glass p-3 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-violet-500" />
                        <h3 className="font-semibold text-xs flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center">
                                <Terminal size={12} className="text-blue-400" />
                            </div>
                            Pending Devices
                        </h3>

                        {error && (
                            <div className="mb-2 p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                                {error}
                            </div>
                        )}

                        {pendingDevices.length === 0 ? (
                            <div className="text-xs text-muted">No new devices detected. Power on an ESP32 node to request registration.</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {pendingDevices.map((d) => {
                                    const edit = pendingEdits[d.device_ip] || { nodeId: '', building: '', floor: 0, unitCount: 0, unitIdsText: '' }
                                    return (
                                        <div key={d.device_ip} className="p-2 rounded-lg border border-white/10 bg-white/5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-mono text-secondary truncate">{d.device_ip}</div>
                                                    <div className="text-[10px] text-muted truncate">{d.mac_address || 'MAC: unknown'} • buttons: {d.buttons || 0}</div>
                                                </div>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    <button className="btn btn-ghost text-xs py-1 px-2" onClick={() => rejectPendingDevice(d.device_ip)}>
                                                        Reject
                                                    </button>
                                                    <button className="btn btn-primary text-xs py-1 px-2" onClick={() => approvePendingDevice(d.device_ip)}>
                                                        {showNodeSuccess ? 'Approved!' : 'Approve'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3 mt-3">
                                                <FormField
                                                    label="Node ID"
                                                    icon={<Hash size={14} />}
                                                    placeholder="NODE-01"
                                                    value={edit.nodeId}
                                                    onChange={e => setPendingEdits(prev => ({
                                                        ...prev,
                                                        [d.device_ip]: { ...edit, nodeId: e.target.value }
                                                    }))}
                                                />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <FormField
                                                        label="Building / Zone"
                                                        icon={<Building2 size={14} />}
                                                        placeholder="North Wing"
                                                        value={edit.building}
                                                        onChange={e => setPendingEdits(prev => ({
                                                            ...prev,
                                                            [d.device_ip]: { ...edit, building: e.target.value }
                                                        }))}
                                                    />
                                                    <FormField
                                                        label="Floor"
                                                        icon={<Layers size={14} />}
                                                        placeholder="0"
                                                        type="number"
                                                        value={String(edit.floor)}
                                                        onChange={e => setPendingEdits(prev => ({
                                                            ...prev,
                                                            [d.device_ip]: { ...edit, floor: parseInt(e.target.value) || 0 }
                                                        }))}
                                                    />
                                                </div>
                                                <FormField
                                                    label="Number of Elevators"
                                                    icon={<DoorOpen size={14} />}
                                                    placeholder="0"
                                                    type="number"
                                                    value={String(edit.unitCount)}
                                                    onChange={e => setPendingEdits(prev => ({
                                                        ...prev,
                                                        [d.device_ip]: { ...edit, unitCount: Math.max(0, parseInt(e.target.value) || 0) }
                                                    }))}
                                                />
                                                <div className="flex flex-col gap-1">
                                                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                                                        <Hash size={14} />
                                                        Elevator IDs (one per line)
                                                    </label>
                                                    <textarea
                                                        className="input text-sm py-2 px-3 min-h-[80px] resize-y"
                                                        placeholder={"ELEV-A\nELEV-B"}
                                                        value={edit.unitIdsText}
                                                        onChange={e => setPendingEdits(prev => ({
                                                            ...prev,
                                                            [d.device_ip]: { ...edit, unitIdsText: e.target.value }
                                                        }))}
                                                    />
                                                    <div className="text-[11px] text-muted">
                                                        Leave blank to auto-generate from Node ID.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Manual Registration */}
                    <div className="glass p-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-cyan-500" />
                        <h3 className="font-semibold text-xs flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
                                <Globe size={12} className="text-emerald-400" />
                            </div>
                            Manual Registration
                        </h3>

                        <div className="flex flex-col gap-3">
                            <FormField
                                label="Node ID"
                                icon={<Hash size={14} />}
                                placeholder="NODE-01"
                                value={manualNode.id}
                                onChange={e => setManualNode(prev => ({ ...prev, id: e.target.value }))}
                            />
                            <FormField
                                label="Device IP"
                                icon={<Globe size={14} />}
                                placeholder="192.168.1.232"
                                value={manualNode.ip}
                                onChange={e => setManualNode(prev => ({ ...prev, ip: e.target.value }))}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <FormField
                                    label="Building / Zone"
                                    icon={<Building2 size={14} />}
                                    placeholder="North Wing"
                                    value={manualNode.building}
                                    onChange={e => setManualNode(prev => ({ ...prev, building: e.target.value }))}
                                />
                                <FormField
                                    label="Floor"
                                    icon={<Layers size={14} />}
                                    placeholder="0"
                                    type="number"
                                    value={String(manualNode.floor)}
                                    onChange={e => setManualNode(prev => ({ ...prev, floor: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                                    <Hash size={14} />
                                    Elevator IDs (one per line)
                                </label>
                                <textarea
                                    className="input text-sm py-2 px-3 min-h-[90px] resize-y"
                                    placeholder={"ELEV-A\nELEV-B\nELEV-C"}
                                    value={manualNode.unitIdsText}
                                    onChange={e => setManualNode(prev => ({ ...prev, unitIdsText: e.target.value }))}
                                />
                            </div>
                        </div>

                        <button className="btn btn-primary w-full justify-center text-xs py-1.5 mt-2" onClick={registerNodeManually}>
                            {showNodeSuccess ? (
                                <><CheckCircle size={14} /> Saved!</>
                            ) : (
                                <><Plus size={14} /> Register Node</>
                            )}
                        </button>
                    </div>

                    {/* Add Elevator Form */}
                    <div className="glass p-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-cyan-500" />
                        <h3 className="font-semibold text-xs flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
                                <DoorOpen size={12} className="text-violet-400" />
                            </div>
                            Add Elevator
                        </h3>

                        <div className="flex flex-col gap-2">
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide ml-1">
                                    <HardDrive size={12} />
                                    Parent Node
                                </label>
                                <select
                                    className="input text-xs py-1.5"
                                    value={newElevator.nodeId}
                                    onChange={e => setNewElevator({ ...newElevator, nodeId: e.target.value })}
                                >
                                    <option value="">Select a node</option>
                                    {elevators.map(el => (
                                        <option key={el.id} value={el.id}>{el.id} - {el.building}</option>
                                    ))}
                                </select>
                            </div>

                            <FormField
                                label="Elevator Label"
                                icon={<DoorOpen size={14} />}
                                placeholder="Elevator A"
                                value={newElevator.label}
                                onChange={e => setNewElevator({ ...newElevator, label: e.target.value })}
                            />

                            <button className="btn btn-primary w-full justify-center text-xs py-1.5 mt-1" onClick={addElevatorToNode}>
                                {showElevatorSuccess ? (
                                    <><CheckCircle size={14} /> Added!</>
                                ) : (
                                    <><Plus size={14} /> Add Elevator</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Node List */}
                    <div className="glass p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                                    <Terminal size={12} className="text-tertiary" />
                                </div>
                                Nodes & Elevators
                            </h3>
                            <span className="badge font-mono text-xs">{elevators.length}</span>
                        </div>

                        <div className="flex flex-col gap-2">

                            {elevators.map((node) => (
                                <div key={node.id} className="mb-2">
                                    {/* Node row - with edit mode */}
                                    {editingNode?.id === node.id ? (
                                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    className="input text-xs py-1 px-2 flex-1"
                                                    placeholder="Node ID"
                                                    value={editingNode.newId}
                                                    onChange={e => setEditingNode({ ...editingNode, newId: e.target.value })}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    className="input text-xs py-1 px-2 flex-1"
                                                    placeholder="Building"
                                                    value={editingNode.building}
                                                    onChange={e => setEditingNode({ ...editingNode, building: e.target.value })}
                                                />
                                                <input
                                                    className="input text-xs py-1 px-2 w-16"
                                                    type="number"
                                                    placeholder="Floor"
                                                    value={editingNode.floor}
                                                    onChange={e => setEditingNode({ ...editingNode, floor: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    className="btn btn-ghost text-xs py-1 px-2"
                                                    onClick={() => setEditingNode(null)}
                                                >
                                                    <X size={12} /> Cancel
                                                </button>
                                                <button
                                                    className="btn btn-primary text-xs py-1 px-2"
                                                    onClick={saveEditNode}
                                                >
                                                    <CheckCircle size={12} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                                            <div className="flex items-center gap-3">
                                                <HardDrive size={14} className="text-blue-400" />
                                                <div>
                                                    <p className="text-sm font-bold">{node.id}</p>
                                                    <p className="text-xs text-muted">{node.building} • FL {node.floor}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => startEditNode(node)}
                                                    className="p-2 rounded-lg text-muted hover:text-blue-400 hover:bg-blue-400/10"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => removeNode(node.id)}
                                                    className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Elevator units */}
                                    {node.elevators && node.elevators.length > 0 && (
                                        <div className="ml-6 mt-1 space-y-1">
                                            {node.elevators.map((elev) => (
                                                editingUnit?.id === elev.id ? (
                                                    <div key={elev.id} className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30 space-y-2">
                                                        <div className="flex gap-2">
                                                            <input
                                                                className="input text-xs py-1 px-2 flex-1"
                                                                placeholder="Elevator ID"
                                                                value={editingUnit.newId}
                                                                onChange={e => setEditingUnit({ ...editingUnit, newId: e.target.value })}
                                                            />
                                                            <input
                                                                className="input text-xs py-1 px-2 flex-1"
                                                                placeholder="Label"
                                                                value={editingUnit.label}
                                                                onChange={e => setEditingUnit({ ...editingUnit, label: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex gap-2 justify-end">
                                                            <button
                                                                className="btn btn-ghost text-xs py-1 px-2"
                                                                onClick={() => setEditingUnit(null)}
                                                            >
                                                                <X size={10} /> Cancel
                                                            </button>
                                                            <button
                                                                className="btn btn-primary text-xs py-1 px-2"
                                                                onClick={saveEditUnit}
                                                            >
                                                                <CheckCircle size={10} /> Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div key={elev.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                                                        <div className="flex items-center gap-2">
                                                            <DoorOpen size={12} className="text-violet-400" />
                                                            <span className="text-xs">{elev.label}</span>
                                                            {elev.id !== elev.label && (
                                                                <span className="text-[10px] text-muted">({elev.id})</span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => startEditUnit(node.id, elev)}
                                                                className="p-1 rounded text-muted hover:text-violet-400"
                                                            >
                                                                <Edit2 size={10} />
                                                            </button>
                                                            <button
                                                                onClick={() => removeElevatorUnit(node.id, elev.id)}
                                                                className="p-1 rounded text-muted hover:text-danger"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>{/* End of scrollable wrapper */}
                </div>{/* End of left control panel */}

                {/* Canvas */}
                <div className="col-span-8 glass relative flex flex-col overflow-hidden">
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
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <Move size={80} className="text-white opacity-10 mb-4" />
                                <p className="text-muted text-sm">Nodes and elevators will appear here</p>
                            </div>
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
                                                stroke="rgba(139, 92, 246, 0.4)"
                                                strokeWidth="2"
                                            />
                                        ))
                                    )}
                                </svg>
                                
                                {elevators.map((node) => (
                                    <div key={node.id}>
                                        {/* Node */}
                                        <DraggableNode
                                            node={node}
                                            zoom={zoom}
                                            onDragEnd={(offsetX, offsetY) => handleItemDragEnd(node.id, 'node', null, offsetX, offsetY)}
                                        />
                                        
                                        {/* Elevators */}
                                        {node.elevators?.map((elevator) => (
                                            <DraggableElevator
                                                key={elevator.id}
                                                elevator={elevator}
                                                zoom={zoom}
                                                onDragEnd={(offsetX, offsetY) => handleItemDragEnd(elevator.id, 'elevator', node.id, offsetX, offsetY)}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-black/30 border-t flex justify-between text-xs font-mono text-muted">
                        <span>REAL-TIME SYNC</span>
                        <span>ZOOM: {(zoom * 100).toFixed(0)}%</span>
                        <span>SCROLL TO ZOOM • DRAG TO PAN</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function DraggableNode({ node, zoom, onDragEnd }: { node: Elevator, zoom: number, onDragEnd: (offsetX: number, offsetY: number) => void }) {
    const [isDragging, setIsDragging] = useState(false)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [startPos, setStartPos] = useState({ x: 0, y: 0 })

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setStartPos({ x: e.clientX, y: e.clientY })
        setDragOffset({ x: 0, y: 0 })
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setDragOffset({
                x: e.clientX - startPos.x,
                y: e.clientY - startPos.y
            })
        }
    }

    const handleMouseUp = () => {
        if (isDragging) {
            onDragEnd(dragOffset.x, dragOffset.y)
            setIsDragging(false)
            setDragOffset({ x: 0, y: 0 })
        }
    }

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
            return () => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [isDragging, dragOffset])

    const isEmergency = node.status === 'emergency'
    const isOnline = node.lastSeen > 0 && Date.now() - node.lastSeen < 60000
    const statusColor = isEmergency ? 'var(--danger)' : isOnline ? 'var(--success)' : 'var(--text-muted)'

    return (
        <div
            className="absolute draggable-item cursor-grab active:cursor-grabbing"
            style={{ 
                left: node.x + dragOffset.x / zoom, 
                top: node.y + dragOffset.y / zoom,
                zIndex: isDragging ? 1000 : 1,
                userSelect: 'none'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className={`w-40 glass-card relative p-4 flex flex-col items-center text-center group ${isEmergency ? 'border-danger/40' : 'border-white/10'}`}>
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
                    <HardDrive size={18} className="text-muted" />
                </div>
                <span className="text-xs font-bold uppercase tracking-tight mb-1">{node.id}</span>
                <span className="text-xs text-tertiary font-mono mb-1">{node.ip_address}</span>
                <span className="text-xs text-muted font-medium uppercase tracking-wider">{node.building}</span>
                <div className="mt-2 px-2.5 py-1 rounded-md bg-black/30 text-xs font-mono text-tertiary">
                    FL {node.floor}
                </div>
            </div>
        </div>
    )
}

function DraggableElevator({ elevator, zoom, onDragEnd }: { elevator: ElevatorUnit, zoom: number, onDragEnd: (offsetX: number, offsetY: number) => void }) {
    const [isDragging, setIsDragging] = useState(false)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [startPos, setStartPos] = useState({ x: 0, y: 0 })

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setStartPos({ x: e.clientX, y: e.clientY })
        setDragOffset({ x: 0, y: 0 })
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setDragOffset({
                x: e.clientX - startPos.x,
                y: e.clientY - startPos.y
            })
        }
    }

    const handleMouseUp = () => {
        if (isDragging) {
            onDragEnd(dragOffset.x, dragOffset.y)
            setIsDragging(false)
            setDragOffset({ x: 0, y: 0 })
        }
    }

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
            return () => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [isDragging, dragOffset])

    const statusColor = elevator.status === 'emergency' ? 'var(--danger)' : 'var(--success)'

    return (
        <div
            className="absolute draggable-item cursor-grab active:cursor-grabbing"
            style={{ 
                left: elevator.x + dragOffset.x / zoom, 
                top: elevator.y + dragOffset.y / zoom,
                zIndex: isDragging ? 1000 : 1,
                userSelect: 'none'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className={`w-32 glass-card p-3 flex flex-col items-center text-center ${elevator.status === 'emergency' ? 'border-danger/40' : 'border-white/10'}`}>
                <div
                    className="absolute top-2 right-2 w-2 h-2 rounded-full"
                    style={{ background: statusColor }}
                />
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-2">
                    <DoorOpen size={16} className={elevator.status === 'emergency' ? "text-danger" : "text-violet-400"} />
                </div>
                <span className="text-xs font-bold uppercase tracking-tight">{elevator.label}</span>
            </div>
        </div>
    )
}

function FormField({ label, icon, placeholder, value, onChange, type = 'text' }: {
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                {icon}
                {label}
            </label>
            <input
                className="input text-sm py-2 px-3"
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
