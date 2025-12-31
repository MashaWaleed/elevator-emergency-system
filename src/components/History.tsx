import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History as HistoryIcon, Search, Download, AlertTriangle, CheckCircle2, Filter, Clock, ChevronRight, FileText, RefreshCw, Globe } from 'lucide-react'

interface Event {
    id: number;
    type: string;
    elevator_id: string;
    building: string;
    floor: number;
    status: string;
    operator: string;
    timestamp: string;
    ip_address?: string;
}

export default function History() {
    const [events, setEvents] = useState<Event[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [filterType, setFilterType] = useState<'all' | 'emergency' | 'acknowledgment'>('all')
    const [isLoading, setIsLoading] = useState(false)

    const fetchEvents = async () => {
        setIsLoading(true)
        try {
            const res = await window.electron.invoke('get-events')
            setEvents(res || [])
        } catch (err) {
            console.error('Failed to fetch events:', err)
        }
        setIsLoading(false)
    }

    useEffect(() => {
        fetchEvents()

        // Auto-refresh every 10 seconds
        const interval = setInterval(fetchEvents, 10000)
        return () => clearInterval(interval)
    }, [])

    const filteredEvents = events.filter(event => {
        const matchesSearch = event.elevator_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            event.building?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            event.ip_address?.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesFilter = filterType === 'all' || event.type === filterType
        return matchesSearch && matchesFilter
    })

    const exportCSV = () => {
        const headers = ['ID', 'Timestamp', 'Type', 'Elevator ID', 'Building', 'Floor', 'Status', 'IP Address', 'Operator']
        const rows = filteredEvents.map(e => [
            e.id,
            e.timestamp,
            e.type,
            e.elevator_id,
            e.building || '',
            e.floor || '',
            e.status,
            e.ip_address || '',
            e.operator || ''
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `elevator-events-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex flex-col gap-6 h-full">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="badge">
                            <Clock size={10} className="mr-1" />
                            Audit Log
                        </span>
                        <span className="text-tertiary text-sm font-mono">
                            {events.length} total records
                        </span>
                    </div>
                    <h1 className="mb-2">Event History</h1>
                    <p className="text-secondary text-sm">Historical records of all alarms and acknowledgments</p>
                </div>

                <div className="flex gap-3">
                    {/* Refresh Button */}
                    <motion.button
                        className="btn btn-ghost"
                        onClick={fetchEvents}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isLoading}
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </motion.button>

                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <input
                            className="input pl-10 w-64"
                            placeholder="Search by ID, building, IP..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filter Dropdown */}
                    <div className="relative">
                        <select
                            className="input pr-10 appearance-none cursor-pointer"
                            value={filterType}
                            onChange={e => setFilterType(e.target.value as any)}
                            style={{ minWidth: 140 }}
                        >
                            <option value="all">All Events</option>
                            <option value="emergency">Emergencies</option>
                            <option value="acknowledgment">Acknowledgments</option>
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={14} />
                    </div>

                    {/* Export Button */}
                    <motion.button
                        className="btn btn-ghost"
                        onClick={exportCSV}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={filteredEvents.length === 0}
                    >
                        <Download size={16} />
                        Export CSV
                    </motion.button>
                </div>
            </header>

            {/* Events Table */}
            <div className="flex-1 glass overflow-hidden flex flex-col">
                {/* Table Header */}
                <div className="data-table-header grid-cols-12 shrink-0">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Timestamp</div>
                    <div className="col-span-2">Event Type</div>
                    <div className="col-span-2">Node ID</div>
                    <div className="col-span-2">Location</div>
                    <div className="col-span-2">IP Address</div>
                    <div className="col-span-1">Status</div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-auto">
                    <AnimatePresence>
                        {filteredEvents.map((event, i) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ delay: i * 0.02 }}
                                className="data-table-row grid-cols-12 group"
                            >
                                {/* ID */}
                                <div className="col-span-1 font-mono text-sm text-muted">
                                    {event.id}
                                </div>

                                {/* Timestamp */}
                                <div className="col-span-2">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">
                                            {new Date(event.timestamp).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                        <span className="text-xs text-muted font-mono">
                                            {new Date(event.timestamp).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit',
                                                hour12: false
                                            })}
                                        </span>
                                    </div>
                                </div>

                                {/* Event Type */}
                                <div className="col-span-2">
                                    <EventTypeBadge type={event.type} />
                                </div>

                                {/* Node ID */}
                                <div className="col-span-2">
                                    <span className="font-mono text-sm font-medium">{event.elevator_id}</span>
                                </div>

                                {/* Location */}
                                <div className="col-span-2">
                                    {event.building ? (
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{event.building}</span>
                                            <span className="text-xs text-muted">Floor {event.floor}</span>
                                        </div>
                                    ) : (
                                        <span className="text-muted">—</span>
                                    )}
                                </div>

                                {/* IP Address */}
                                <div className="col-span-2">
                                    {event.ip_address ? (
                                        <div className="flex items-center gap-2 text-sm font-mono text-tertiary">
                                            <Globe size={12} />
                                            {event.ip_address}
                                        </div>
                                    ) : (
                                        <span className="text-muted">—</span>
                                    )}
                                </div>

                                {/* Status */}
                                <div className="col-span-1">
                                    <StatusPill status={event.status} />
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Empty State */}
                    {filteredEvents.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center py-16">
                            <motion.div
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            >
                                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-5">
                                    {searchQuery || filterType !== 'all' ? (
                                        <Search size={40} className="text-muted opacity-30" />
                                    ) : (
                                        <FileText size={40} className="text-muted opacity-30" />
                                    )}
                                </div>
                            </motion.div>
                            <h3 className="text-lg font-semibold text-secondary mb-2">
                                {searchQuery || filterType !== 'all' ? 'No matching events' : 'No Events Yet'}
                            </h3>
                            <p className="text-sm text-muted max-w-xs text-center">
                                {searchQuery || filterType !== 'all'
                                    ? 'Try adjusting your search or filter criteria.'
                                    : 'Event history will appear here as alerts are triggered and acknowledged.'
                                }
                            </p>
                        </div>
                    )}
                </div>

                {/* Table Footer with Stats */}
                {filteredEvents.length > 0 && (
                    <div className="p-4 border-t bg-black/20 flex items-center justify-between text-xs text-muted">
                        <div className="flex gap-6">
                            <span>
                                Showing <span className="font-mono text-primary">{filteredEvents.length}</span> of {events.length} events
                            </span>
                            <span>
                                Emergencies: <span className="font-mono text-danger">{events.filter(e => e.type === 'emergency').length}</span>
                            </span>
                            <span>
                                Acknowledged: <span className="font-mono text-success">{events.filter(e => e.status === 'acknowledged').length}</span>
                            </span>
                        </div>
                        <span className="font-mono">
                            Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

function EventTypeBadge({ type }: { type: string }) {
    const isEmergency = type === 'emergency'

    return (
        <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide ${isEmergency
                    ? 'bg-danger/15 text-danger border border-danger/20'
                    : 'bg-success/15 text-success border border-success/20'
                }`}
        >
            {isEmergency ? (
                <AlertTriangle size={12} />
            ) : (
                <CheckCircle2 size={12} />
            )}
            {type}
        </div>
    )
}

function StatusPill({ status }: { status: string }) {
    const isActive = status === 'active'

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${isActive
                    ? 'bg-danger/15 text-danger'
                    : 'bg-success/15 text-success'
                }`}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                    background: isActive ? 'var(--danger)' : 'var(--success)',
                    boxShadow: `0 0 6px ${isActive ? 'var(--danger-glow)' : 'var(--success-glow)'}`
                }}
            />
            {status}
        </span>
    )
}
