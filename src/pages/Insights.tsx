import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
    Lightbulb,
    CheckCircle2,
    Clock,
    AlertTriangle,
    TrendingUp,
    Sparkles,
    ChevronDown,
    ChevronRight,
    MessageCircle,

    Check,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useInsightsGenerator } from "../hooks/useInsightsGenerator";
import type { InsightItem } from "../types/insightTypes";
import { SNOOZE_OPTIONS } from "../types/insightTypes";
import { Modal } from "../components/ui/Modal";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";

export default function Insights() {
    const navigate = useNavigate();
    const {
        tasks,
        isLoading,
        error,
        refreshInsights,
        markAsDone,
        snoozeItem,
    } = useInsightsGenerator();

    // Section expansion state - tasks collapsed by default
    const [expandedSections, setExpandedSections] = useState({
        tasks: true,
    });

    // Snooze modal state
    const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useHistorySyncedState(false, 'insightsSnooze');
    const [snoozeItemId, setSnoozeItemId] = useState<string | null>(null);
    const [customSnoozeDate, setCustomSnoozeDate] = useState("");
    const [customSnoozeTime, setCustomSnoozeTime] = useState("09:00");

    // Toggle section
    const toggleSection = (section: 'tasks') => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    // Handle snooze
    const handleSnooze = (id: string) => {
        setSnoozeItemId(id);
        setIsSnoozeModalOpen(true);
    };

    const closeSnoozeModal = () => {
        setIsSnoozeModalOpen(false);
        setSnoozeItemId(null);
        setCustomSnoozeDate("");
    };

    const confirmSnooze = async (hours: number) => {
        if (!snoozeItemId) return;
        await snoozeItem(snoozeItemId, hours);
        closeSnoozeModal();
    };

    const confirmCustomSnooze = async () => {
        if (!snoozeItemId || !customSnoozeDate) return;
        const dateTime = new Date(`${customSnoozeDate}T${customSnoozeTime}`);
        const hoursFromNow = Math.max(1, Math.ceil((dateTime.getTime() - Date.now()) / (1000 * 60 * 60)));
        await snoozeItem(snoozeItemId, hoursFromNow);
        closeSnoozeModal();
    };

    // Get icon for severity
    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'warning': return <AlertTriangle size={16} className="text-amber-400" />;
            case 'success': return <TrendingUp size={16} className="text-emerald-400" />;
            default: return <Lightbulb size={16} className="text-blue-400" />;
        }
    };

    // Section header component
    const SectionHeader = ({
        title,
        icon: Icon,
        section,
        count,
        color,
    }: {
        title: string;
        icon: React.ElementType;
        section: 'tasks';
        count?: number;
        color: string;
    }) => (
        <button
            onClick={() => toggleSection(section)}
            className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl transition-all"
        >
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", color)}>
                    <Icon size={18} className="text-foreground" />
                </div>
                <span className="font-semibold text-foreground">{title}</span>
                {count !== undefined && count > 0 && (
                    <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs font-medium">
                        {count}
                    </span>
                )}
            </div>
            <ChevronDown
                size={20}
                className={cn(
                    "text-muted-foreground transition-transform duration-200",
                    expandedSections[section] && "rotate-180"
                )}
            />
        </button>
    );

    // Task item component (only handles task type since insights moved to Business Insights page)
    const TaskCard = ({ item }: { item: InsightItem }) => (
        <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/5 space-y-2">
            <div className="flex items-start gap-3">
                {getSeverityIcon(item.severity)}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 pl-7">
                <button
                    onClick={() => markAsDone(item.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium transition-all"
                >
                    <Check size={14} />
                    Done
                </button>
                <button
                    onClick={() => handleSnooze(item.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground rounded-lg text-xs font-medium transition-all"
                >
                    <Clock size={14} />
                    Later
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-40 px-4 py-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Sparkles size={20} className="text-purple-400" />
                            <h1 className="text-xl font-bold text-foreground">Daily Insights</h1>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(), "EEEE, MMM d")}
                        </p>
                    </div>

                </div>
            </header>

            {/* Main Content */}
            {isLoading && tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">Analyzing your business...</p>
                </div>
            ) : error ? (
                <div className="p-4">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                        <p className="text-sm text-red-400">{error}</p>
                        <button
                            onClick={refreshInsights}
                            className="mt-2 text-xs text-muted-foreground underline"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    {/* Section B: Business Insights - Clickable Card */}
                    <button
                        onClick={() => navigate('/insights/business')}
                        className="w-full p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 active:from-amber-500/40 active:to-orange-500/40 rounded-2xl border border-amber-500/20 transition-all group"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                    <Lightbulb size={24} className="text-amber-400" />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-lg font-semibold text-foreground">Business Insights</h2>
                                    <p className="text-sm text-muted-foreground">View detailed analytics</p>
                                </div>
                            </div>
                            <ChevronRight size={24} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>

                    {/* Ask Your Business - Clickable Card */}
                    <button
                        onClick={() => navigate('/insights/chat')}
                        className="w-full p-4 bg-gradient-to-r from-purple-500/20 to-violet-500/20 hover:from-purple-500/30 hover:to-violet-500/30 active:from-purple-500/40 active:to-violet-500/40 rounded-2xl border border-purple-500/20 transition-all group"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                    <MessageCircle size={24} className="text-purple-400" />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-lg font-semibold text-foreground">Ask Your Business</h2>
                                    <p className="text-sm text-muted-foreground">Chat with AI about your data</p>
                                </div>
                            </div>
                            <ChevronRight size={24} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>

                    {/* Section A: Today's Tasks */}
                    <div className="space-y-3">
                        <SectionHeader
                            title="Today's Tasks"
                            icon={CheckCircle2}
                            section="tasks"
                            count={tasks.length}
                            color="bg-emerald-500/20"
                        />
                        {expandedSections.tasks && (
                            <div className="space-y-2 pl-2">
                                {tasks.length === 0 ? (
                                    <div className="p-4 text-center">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">All caught up! No pending tasks.</p>
                                    </div>
                                ) : (
                                    tasks.map(task => (
                                        <TaskCard key={task.id} item={task} />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Snooze Modal */}
            <Modal
                isOpen={isSnoozeModalOpen}
                onClose={closeSnoozeModal}
                title={<span className="text-lg font-bold">Remind Me Later</span>}
            >
                <div className="space-y-4">
                    {/* Quick Options */}
                    <div className="space-y-2">
                        {SNOOZE_OPTIONS.filter(o => o.value > 0).map((option) => (
                            <button
                                key={option.value}
                                onClick={() => confirmSnooze(option.value)}
                                className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl text-left transition-all"
                            >
                                <Clock size={18} className="text-muted-foreground" />
                                <span className="text-sm font-medium">{option.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Custom Date/Time */}
                    <div className="pt-3 border-t border-white/10 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Time</p>
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="date"
                                value={customSnoozeDate}
                                onChange={(e) => setCustomSnoozeDate(e.target.value)}
                                min={format(new Date(), 'yyyy-MM-dd')}
                                className="bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                            <input
                                type="time"
                                value={customSnoozeTime}
                                onChange={(e) => setCustomSnoozeTime(e.target.value)}
                                className="bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                        <button
                            onClick={confirmCustomSnooze}
                            disabled={!customSnoozeDate}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all"
                        >
                            Set Custom Reminder
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
