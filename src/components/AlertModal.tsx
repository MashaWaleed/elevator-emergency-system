import { AlertCircle, MapPin, Building2, Clock, Fingerprint, X } from 'lucide-react'
import { EmergencyEvent } from '../types'

export default function AlertModal({ emergencies, onAcknowledge }: { 
    emergencies: EmergencyEvent[], 
    onAcknowledge: (elevatorId: string) => void 
}) {
    if (emergencies.length === 0) return null

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-8 bg-black/90">
            {/* Emergency Container */}
            <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="glass border-2 border-danger/40 rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="py-4 px-8 bg-gradient-to-r from-danger to-orange-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <AlertCircle size={28} className="text-white" />
                                <span className="text-xl font-black tracking-wide uppercase text-white">
                                    Emergency Alert
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-mono font-bold text-white/80 uppercase tracking-wider">
                                    {emergencies.length} Active {emergencies.length === 1 ? 'Emergency' : 'Emergencies'}
                                </span>
                                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                            </div>
                        </div>
                    </div>

                    {/* Emergency List */}
                    <div className="p-6 space-y-4 flex-1 overflow-y-auto" style={{minHeight: 0}}>
                        {emergencies.map((emergency) => (
                            <EmergencyCard 
                                key={emergency.elevator_id} 
                                emergency={emergency} 
                                onAcknowledge={onAcknowledge} 
                            />
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-black/30 border-t flex justify-between items-center text-xs font-mono text-muted uppercase tracking-wider">
                        <span>Audio Alert: Playing</span>
                        <span>Authorized Personnel Only</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function EmergencyCard({ emergency, onAcknowledge }: { 
    emergency: EmergencyEvent, 
    onAcknowledge: (elevatorId: string) => void 
}) {
    return (
        <div className="glass p-6 rounded-xl border border-danger/30">
            {/* Top Row */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-6">
                    {/* Icon */}
                    <div
                        className="w-16 h-16 rounded-xl flex items-center justify-center"
                        style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}
                    >
                        <AlertCircle size={32} className="text-danger" />
                    </div>

                    {/* Info */}
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tight mb-2">
                            Active Emergency
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="badge badge-red font-mono text-sm px-3 py-1">
                                Node: {emergency.node_id || 'Unknown'}
                            </span>
                            <span className="badge font-mono text-sm px-3 py-1" style={{background: 'rgba(139, 92, 246, 0.2)', color: 'rgb(196, 181, 253)'}}>
                                Elevator: {emergency.elevator_id}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Timestamp */}
                <div className="text-right">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                            Incident Time
                        </p>
                        <p className="text-2xl font-bold font-mono text-white">
                            {new Date(emergency.timestamp).toLocaleTimeString([], {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <InfoCard
                    icon={<Building2 size={18} />}
                    label="Node"
                    title={emergency.node_id || 'N/A'}
                    subtitle={emergency.ip_address || 'Unknown IP'}
                />
                <InfoCard
                    icon={<MapPin size={18} />}
                    label="Elevator Unit"
                    title={emergency.elevator_id}
                    subtitle="Emergency Activated"
                />
                <InfoCard
                    icon={<MapPin size={18} />}
                    label="Location"
                    title={emergency.building}
                    subtitle={`Floor ${emergency.floor}`}
                />
            </div>

            {/* Acknowledge Button */}
            <button
                onClick={() => onAcknowledge(emergency.elevator_id)}
                className="w-full py-5 rounded-xl font-black text-xl uppercase tracking-wide text-white bg-gradient-to-r from-danger to-red-600 hover:from-red-600 hover:to-red-700 transition-all"
            >
                <span className="flex items-center justify-center gap-3">
                    <Fingerprint size={24} />
                    Acknowledge Emergency
                    <Fingerprint size={24} />
                </span>
            </button>
        </div>
    )
}

function InfoCard({ icon, label, title, subtitle }: {
    icon: React.ReactNode;
    label: string;
    title: string;
    subtitle: string;
}) {
    return (
        <div className="glass p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-danger">{icon}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
            </div>
            <p className="text-lg font-bold text-white mb-1">{title}</p>
            <p className="text-xs font-medium text-tertiary uppercase">{subtitle}</p>
        </div>
    )
}
