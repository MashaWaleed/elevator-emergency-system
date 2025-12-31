import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, ShieldCheck, Clock, MapPin, Radio, Activity, Terminal, Zap, Building2, Fingerprint, AlertTriangle } from 'lucide-react'
import { EmergencyEvent } from '../types'

export default function AlertModal({ emergency, onAcknowledge }: { emergency: EmergencyEvent | null, onAcknowledge: () => void }) {
    return (
        <AnimatePresence>
            {emergency && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-100 flex items-center justify-center p-8"
                    style={{ background: 'rgba(0, 0, 0, 0.95)' }}
                >
                    {/* Animated Background Pulse */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{
                            background: [
                                'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.1) 0%, transparent 50%)',
                                'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.2) 0%, transparent 60%)',
                                'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.1) 0%, transparent 50%)'
                            ]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />

                    {/* Scan Line Effect */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <motion.div
                            className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500/30 to-transparent"
                            animate={{ y: ['0vh', '100vh'] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                        />
                    </div>

                    {/* Corner Accents */}
                    <CornerAccent position="top-left" />
                    <CornerAccent position="top-right" />
                    <CornerAccent position="bottom-left" />
                    <CornerAccent position="bottom-right" />

                    {/* Main Modal */}
                    <motion.div
                        initial={{ scale: 0.9, y: 50, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 1.05, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="w-1/2 min-w-[600px] relative z-50"
                    >
                        {/* Glow Effect */}
                        <div
                            className="absolute inset-0 rounded-3xl blur-2xl"
                            style={{ background: 'rgba(239, 68, 68, 0.2)' }}
                        />

                        <div className="glass relative border-2 border-danger/40 overflow-hidden rounded-3xl">
                            {/* Top Alert Bar */}
                            <div
                                className="relative py-4 px-8 flex justify-between items-center overflow-hidden"
                                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' }}
                            >
                                {/* Animated Stripes */}
                                <motion.div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 40px)'
                                    }}
                                    animate={{ x: [0, 40] }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                />

                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="flex gap-1">
                                        {[1, 2, 3].map(i => (
                                            <motion.div
                                                key={i}
                                                className="w-1.5 h-7 bg-white/30 rounded-sm"
                                                animate={{ opacity: [0.3, 1, 0.3] }}
                                                transition={{ duration: 0.8, delay: i * 0.1, repeat: Infinity }}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-xl font-black tracking-[0.2em] uppercase text-white">
                                        Emergency Alert
                                    </span>
                                </div>

                                <div className="flex items-center gap-4 relative z-10">
                                    <span className="text-sm font-mono font-bold text-white/80 uppercase tracking-wider">
                                        Priority: Critical
                                    </span>
                                    <motion.div
                                        className="w-3 h-3 rounded-full bg-white"
                                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                    />
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="p-10">
                                {/* Header Section */}
                                <div className="flex items-start justify-between mb-10">
                                    <div className="flex items-start gap-6">
                                        {/* Icon */}
                                        <motion.div
                                            className="w-20 h-20 rounded-2xl flex items-center justify-center"
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                border: '1px solid rgba(239, 68, 68, 0.3)'
                                            }}
                                            animate={{
                                                boxShadow: [
                                                    '0 0 20px rgba(239, 68, 68, 0.2)',
                                                    '0 0 40px rgba(239, 68, 68, 0.4)',
                                                    '0 0 20px rgba(239, 68, 68, 0.2)'
                                                ]
                                            }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        >
                                            <AlertTriangle size={40} className="text-danger" />
                                        </motion.div>

                                        {/* Title & Subtitle */}
                                        <div>
                                            <h2 className="text-4xl font-black text-white tracking-tight mb-3">
                                                Active Emergency
                                            </h2>
                                            <div className="flex items-center gap-4">
                                                <span className="badge badge-red font-mono">
                                                    <Zap size={10} className="mr-1" />
                                                    {emergency.elevator_id}
                                                </span>
                                                <span className="flex items-center gap-2 text-sm text-success font-mono">
                                                    <Activity size={14} />
                                                    Signal Connected
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Timestamp */}
                                    <div className="text-right">
                                        <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                                                Incident Time
                                            </p>
                                            <p className="text-3xl font-bold font-mono text-white tracking-tight">
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

                                {/* Info Cards Grid */}
                                <div className="grid grid-cols-3 gap-6 mb-10">
                                    <InfoCard
                                        icon={<MapPin size={20} />}
                                        iconColor="var(--danger)"
                                        label="Physical Location"
                                        title={emergency.building}
                                        subtitle={`Floor ${emergency.floor}`}
                                    />
                                    <InfoCard
                                        icon={<Building2 size={20} />}
                                        iconColor="var(--accent-blue)"
                                        label="Node Identifier"
                                        title={emergency.elevator_id}
                                        subtitle="Hardware Match: OK"
                                    />
                                    <InfoCard
                                        icon={<ShieldCheck size={20} />}
                                        iconColor="var(--success)"
                                        label="Response Protocol"
                                        title="Priority Alpha"
                                        subtitle="Manual Acknowledgment Required"
                                    />
                                </div>

                                {/* Acknowledge Button */}
                                <div className="relative group">
                                    {/* Button Glow */}
                                    <motion.div
                                        className="absolute inset-0 rounded-2xl blur-xl"
                                        animate={{
                                            background: [
                                                'rgba(239, 68, 68, 0.3)',
                                                'rgba(239, 68, 68, 0.5)',
                                                'rgba(239, 68, 68, 0.3)'
                                            ]
                                        }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />

                                    <motion.button
                                        onClick={onAcknowledge}
                                        className="relative w-full py-7 rounded-2xl font-black text-2xl uppercase tracking-[0.2em] text-white overflow-hidden"
                                        style={{
                                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                            boxShadow: '0 10px 40px rgba(239, 68, 68, 0.4)'
                                        }}
                                        whileHover={{ scale: 1.01, y: -2 }}
                                        whileTap={{ scale: 0.99 }}
                                    >
                                        {/* Shimmer Effect */}
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                            animate={{ x: ['-100%', '100%'] }}
                                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                        />

                                        <span className="relative z-10 flex items-center justify-center gap-4">
                                            <Fingerprint size={28} />
                                            Acknowledge Emergency
                                            <Fingerprint size={28} />
                                        </span>
                                    </motion.button>
                                </div>

                                {/* Footer Status */}
                                <div className="mt-8 flex justify-between items-center text-xs font-mono text-muted uppercase tracking-wider">
                                    <div className="flex items-center gap-6">
                                        <StatusItem color="var(--danger)" label="Audio Alert: Playing" />
                                        <StatusItem color="var(--success)" label="Event Logged" />
                                    </div>
                                    <span className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                        Authorized Personnel Only
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function InfoCard({ icon, iconColor, label, title, subtitle }: {
    icon: React.ReactNode;
    iconColor: string;
    label: string;
    title: string;
    subtitle: string;
}) {
    return (
        <div className="glass p-6 rounded-2xl relative group hover:border-white/15 transition-all">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <span style={{ color: iconColor }}>{icon}</span>
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted">{label}</span>
            </div>

            {/* Content */}
            <p className="text-xl font-bold text-white mb-1 tracking-tight">{title}</p>
            <p className="text-xs font-medium text-tertiary uppercase tracking-wide">{subtitle}</p>

            {/* Corner Decorations */}
            <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/10 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-white/10 rounded-bl-2xl" />
        </div>
    )
}

function StatusItem({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-2">
            <motion.span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: color }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            />
            {label}
        </span>
    )
}

function CornerAccent({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
    const getStyles = () => {
        switch (position) {
            case 'top-left':
                return { top: 24, left: 24, borderTop: true, borderLeft: true }
            case 'top-right':
                return { top: 24, right: 24, borderTop: true, borderRight: true }
            case 'bottom-left':
                return { bottom: 24, left: 24, borderBottom: true, borderLeft: true }
            case 'bottom-right':
                return { bottom: 24, right: 24, borderBottom: true, borderRight: true }
        }
    }

    const { borderTop, borderRight, borderBottom, borderLeft, ...pos } = getStyles()

    return (
        <div
            className="absolute w-16 h-16 pointer-events-none"
            style={{
                ...pos,
                borderTop: borderTop ? '2px solid rgba(239, 68, 68, 0.3)' : undefined,
                borderRight: borderRight ? '2px solid rgba(239, 68, 68, 0.3)' : undefined,
                borderBottom: borderBottom ? '2px solid rgba(239, 68, 68, 0.3)' : undefined,
                borderLeft: borderLeft ? '2px solid rgba(239, 68, 68, 0.3)' : undefined,
            }}
        />
    )
}
