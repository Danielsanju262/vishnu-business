/**
 * Goals Dashboard - Track and manage personal/business goals
 * Features:
 * - Visual progress bars
 * - Goal creation/editing
 * - EMI tracking with net profit bridging
 * - Motivational insights
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
    ArrowLeft,
    Target,
    Plus,
    Trash2,
    Edit3,
    CheckCircle2,
    Clock,
    Sparkles,
    DollarSign,
    BarChart3,
    ShoppingCart,
    FileText,
    Trophy,
    Flame,
    Users,
    Percent,
    Package,
    TrendingUp,
    Calendar,
    AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/toast-provider';
import {
    getAllGoals,
    addGoal,
    updateGoal,
    completeGoal,
    deleteGoal,
    updateGoalProgress,
    type UserGoal
} from '../lib/aiMemory';
import { supabase } from '../lib/supabase';

// Goal type icons
const goalTypeIcons: Record<string, React.ReactNode> = {
    net_profit: <DollarSign size={20} />,
    revenue: <BarChart3 size={20} />,
    sales_count: <ShoppingCart size={20} />,
    manual_check: <FileText size={20} />,
    customer_count: <Users size={20} />,
    gross_profit: <DollarSign size={20} />,
    margin: <Percent size={20} />,
    product_sales: <Package size={20} />,
    daily_revenue: <TrendingUp size={20} />,
    daily_margin: <Percent size={20} />,
    avg_margin: <Calendar size={20} />,
    avg_revenue: <Calendar size={20} />,
    avg_profit: <Calendar size={20} />
};

// Goal type labels
const goalTypeLabels: Record<string, string> = {
    net_profit: 'Net Profit (Cumulative)',
    revenue: 'Revenue (Cumulative)',
    sales_count: 'Sales Count',
    manual_check: 'Manual Confirmation (EMI, etc.)',
    customer_count: 'Customer Count',
    gross_profit: 'Gross Profit (Cumulative)',
    margin: 'Margin % (Any Day)',
    product_sales: 'Product Sales',
    daily_revenue: 'Daily Revenue Target',
    daily_margin: 'Daily Margin % Target',
    avg_margin: 'Average Margin %',
    avg_revenue: 'Average Revenue/Day',
    avg_profit: 'Average Profit/Day'
};

// Goal type descriptions for UI
const goalTypeDescriptions: Record<string, string> = {
    net_profit: 'Track total net profit from start date',
    revenue: 'Track total revenue from start date',
    sales_count: 'Track number of sales transactions',
    manual_check: 'Manually update progress (for EMI, etc.)',
    customer_count: 'Reach target customer count',
    gross_profit: 'Track total gross profit',
    margin: 'Achieve this margin % on any single day',
    product_sales: 'Track specific product sales quantity',
    daily_revenue: 'Hit this revenue target on any day',
    daily_margin: 'Achieve this margin % on any day',
    avg_margin: 'Achieve average margin % by deadline',
    avg_revenue: 'Achieve average daily revenue by deadline',
    avg_profit: 'Achieve average daily profit by deadline'
};

export default function GoalsDashboard() {
    const { toast } = useToast();

    const [goals, setGoals] = useState<UserGoal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingGoal, setEditingGoal] = useState<UserGoal | null>(null);
    const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [updatingGoal, setUpdatingGoal] = useState<UserGoal | null>(null);
    const [newProgressAmount, setNewProgressAmount] = useState('');

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formTargetAmount, setFormTargetAmount] = useState('');
    const [formDeadline, setFormDeadline] = useState('');
    const [formMetricType, setFormMetricType] = useState<'net_profit' | 'revenue' | 'sales_count' | 'manual_check' | 'customer_count' | 'gross_profit' | 'margin' | 'product_sales' | 'daily_revenue' | 'daily_margin' | 'avg_margin' | 'avg_revenue' | 'avg_profit'>('net_profit');
    const [formIsRecurring, setFormIsRecurring] = useState(false);
    const [formRecurrenceType, setFormRecurrenceType] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');
    const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0]);

    // Load goals
    useEffect(() => {
        loadGoals();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('goals-dashboard-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_goals'
                },
                (payload) => {
                    console.log('Real-time goal update received:', payload);
                    loadGoals();
                }
            )
            .subscribe();

        // Listen for internal app updates
        const handleGoalUpdate = () => {
            // Add a small delay to ensure DB propagation
            setTimeout(() => {
                console.log('Received goal update event, reloading...');
                loadGoals();
            }, 500);
        };

        window.addEventListener('goal-updated', handleGoalUpdate);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('goal-updated', handleGoalUpdate);
        };
    }, []);

    const loadGoals = async () => {
        setIsLoading(true);
        try {
            const allGoals = await getAllGoals();

            // Update progress for all active goals
            for (const goal of allGoals) {
                if (goal.status === 'active') {
                    await updateGoalProgress(goal.id);
                }
            }

            // Reload to get updated values
            const updatedGoals = await getAllGoals();
            setGoals(updatedGoals);
        } catch (error) {
            console.error('Error loading goals:', error);
            toast('Failed to load goals', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormTitle('');
        setFormDescription('');
        setFormTargetAmount('');
        setFormDeadline('');
        setFormMetricType('net_profit');
        setFormIsRecurring(false);
        setFormRecurrenceType('monthly');
        setFormStartDate(new Date().toISOString().split('T')[0]);
        setEditingGoal(null);
    };

    const handleOpenAdd = () => {
        resetForm();
        setShowAddModal(true);
    };

    const handleOpenEdit = (goal: UserGoal) => {
        setFormTitle(goal.title);
        setFormDescription(goal.description || '');
        setFormTargetAmount(goal.target_amount.toString());
        setFormDeadline(goal.deadline || '');
        setFormMetricType(goal.metric_type);
        setFormIsRecurring(!!goal.is_recurring);
        setFormRecurrenceType(goal.recurrence_type || 'monthly');
        setFormStartDate(goal.start_tracking_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
        setEditingGoal(goal);
        setShowAddModal(true);
    };

    const handleSaveGoal = async () => {
        if (!formTitle.trim()) {
            toast('Please enter a goal title', 'error');
            return;
        }

        if (!formTargetAmount || parseFloat(formTargetAmount) <= 0) {
            toast('Please enter a valid target amount', 'error');
            return;
        }

        try {
            if (editingGoal) {
                // Update existing
                await updateGoal(editingGoal.id, {
                    title: formTitle.trim(),
                    description: formDescription.trim() || undefined,
                    target_amount: parseFloat(formTargetAmount),
                    deadline: formDeadline || undefined,
                    metric_type: formMetricType,
                    is_recurring: formIsRecurring,
                    recurrence_type: formIsRecurring ? formRecurrenceType : undefined,
                    start_tracking_date: formMetricType !== 'manual_check' ? formStartDate : undefined
                });
                toast('Goal updated! 🎯', 'success');
            } else {
                // Create new
                console.log('[Goals] Creating goal:', {
                    title: formTitle.trim(),
                    target_amount: parseFloat(formTargetAmount),
                    metric_type: formMetricType,
                    is_recurring: formIsRecurring
                });

                const newGoal = await addGoal({
                    title: formTitle.trim(),
                    description: formDescription.trim() || undefined,
                    target_amount: parseFloat(formTargetAmount),
                    deadline: formDeadline || undefined,
                    metric_type: formMetricType,
                    start_tracking_date: formMetricType !== 'manual_check' ? formStartDate : new Date().toISOString().split('T')[0],
                    is_recurring: formIsRecurring,
                    recurrence_type: formIsRecurring ? formRecurrenceType : undefined
                });

                if (!newGoal) {
                    console.error('[Goals] Goal creation returned null - database insert failed');
                    toast('Failed to create goal. Please check database connection.', 'error');
                    return;
                }

                console.log('[Goals] Goal created successfully:', newGoal);
                toast('Goal created! Let\'s do this! 🚀', 'success');
            }

            setShowAddModal(false);
            resetForm();
            loadGoals();
        } catch (error) {
            console.error('Error saving goal:', error);
            toast(`Failed to save goal: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    };

    const handleOpenUpdateProgress = (goal: UserGoal) => {
        setUpdatingGoal(goal);
        setNewProgressAmount(goal.current_amount.toString());
        setShowProgressModal(true);
    };

    const handleSaveAdjustment = async (type: 'add' | 'subtract') => {
        if (!updatingGoal) return;

        const adjAmount = parseFloat(newProgressAmount);
        if (isNaN(adjAmount) || adjAmount < 0) {
            toast('Please enter a valid amount', 'error');
            return;
        }

        const currentTotal = updatingGoal.current_amount;
        let newTotal = 0;

        if (type === 'add') {
            newTotal = currentTotal + adjAmount;
        } else {
            newTotal = Math.max(0, currentTotal - adjAmount);
        }

        try {
            await updateGoal(updatingGoal.id, {
                current_amount: newTotal,
                metric_type: 'manual_check'
            });
            toast(type === 'add' ? 'Amount added successfully!' : 'Amount reduced successfully!', 'success');

            setTimeout(() => {
                loadGoals();
            }, 500);

            setShowProgressModal(false);
            setUpdatingGoal(null);
            setNewProgressAmount('');
        } catch (error) {
            console.error('Error updating progress:', error);
            toast('Failed to update progress', 'error');
        }
    };



    const handleCompleteGoal = async (goalId: string) => {
        try {
            await completeGoal(goalId);
            toast('Goal completed! 🎉 Great job!', 'success');
            setConfirmComplete(null);
            loadGoals();
        } catch (error) {
            console.error('Error completing goal:', error);
            toast('Failed to complete goal', 'error');
        }
    };

    const handleDeleteGoal = async (goalId: string) => {
        try {
            await deleteGoal(goalId);
            toast('Goal archived', 'info');
            loadGoals();
        } catch (error) {
            console.error('Error deleting goal:', error);
            toast('Failed to delete goal', 'error');
        }
    };

    // Separate goals by status
    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');

    // Debug logging
    console.log('[GoalsDashboard] Total goals in state:', goals.length);
    console.log('[GoalsDashboard] Active goals:', activeGoals.length);
    console.log('[GoalsDashboard] All goals:', goals.map(g => ({ id: g.id, title: g.title, status: g.status })));

    return (
        <div className="min-h-screen bg-background p-3 md:p-4 pb-6 animate-in fade-in w-full md:max-w-2xl md:mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 md:mb-6">
                <button
                    onClick={() => window.history.back()}
                    className="p-3 -ml-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-neutral-400 hover:text-white transition-all border border-transparent hover:border-white/10"
                >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-0.5 tracking-wide">
                        <Link to="/insights" className="hover:text-white transition-colors">Insights</Link>
                        <span className="text-neutral-600">/</span>
                        <span className="text-white font-semibold">Goals</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">My Goals</h1>
                </div>
                <Button
                    onClick={handleOpenAdd}
                    className="bg-purple-600 hover:bg-purple-500 text-white h-10 px-4"
                >
                    <Plus size={18} className="mr-1" />
                    Add Goal
                </Button>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {/* Empty State */}
            {!isLoading && activeGoals.length === 0 && completedGoals.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                        <Target size={40} className="text-purple-400" />
                    </div>
                    <h2 className="text-lg font-bold text-white mb-2">No Goals Yet</h2>
                    <p className="text-sm text-neutral-400 mb-6 max-w-xs mx-auto">
                        Set your first goal to start tracking your progress. It could be a profit target, EMI payment, or sales goal!
                    </p>
                    <Button onClick={handleOpenAdd} className="bg-purple-600 hover:bg-purple-500">
                        <Plus size={18} className="mr-2" />
                        Create Your First Goal
                    </Button>
                </div>
            )}

            {/* Active Goals */}
            {!isLoading && activeGoals.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Flame size={14} className="text-orange-500" />
                        Active Goals ({activeGoals.length})
                    </h2>
                    <div className="space-y-4">
                        {activeGoals.map((goal) => {
                            const progress = (goal.current_amount / goal.target_amount) * 100;
                            const remaining = goal.target_amount - goal.current_amount;
                            const daysLeft = goal.deadline ? differenceInDays(new Date(goal.deadline), new Date()) : null;
                            const isOverdue = daysLeft !== null && daysLeft < 0;
                            const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

                            return (
                                <div
                                    key={goal.id}
                                    className={cn(
                                        "bg-zinc-900/80 border rounded-2xl p-4 transition-all",
                                        isOverdue ? "border-red-500/50" : isUrgent ? "border-amber-500/50" : "border-white/10"
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                progress >= 100 ? "bg-emerald-500/20 text-emerald-400" :
                                                    isOverdue ? "bg-red-500/20 text-red-400" :
                                                        isUrgent ? "bg-amber-500/20 text-amber-400" :
                                                            "bg-purple-500/20 text-purple-400"
                                            )}>
                                                {progress >= 100 ? <Trophy size={20} /> : goalTypeIcons[goal.metric_type]}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-sm">{goal.title}</h3>
                                                {goal.description && (
                                                    <p className="text-xs text-neutral-400 mt-0.5">{goal.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
                                                        {goalTypeLabels[goal.metric_type]}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleOpenEdit(goal)}
                                                className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteGoal(goal.id)}
                                                className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-3">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-neutral-400">Progress</span>
                                            <span className={cn(
                                                "font-bold",
                                                progress >= 100 ? "text-emerald-400" : "text-white"
                                            )}>
                                                {progress.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500",
                                                    progress >= 100 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                                                        isOverdue ? "bg-gradient-to-r from-red-500 to-red-400" :
                                                            isUrgent ? "bg-gradient-to-r from-amber-500 to-amber-400" :
                                                                "bg-gradient-to-r from-purple-500 to-purple-400"
                                                )}
                                                style={{ width: `${Math.min(100, progress)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-xs text-neutral-400">Current</div>
                                            <div className="font-bold text-white text-sm">
                                                {['margin', 'daily_margin', 'avg_margin'].includes(goal.metric_type)
                                                    ? `${goal.current_amount.toFixed(1)}%`
                                                    : ['customer_count', 'sales_count'].includes(goal.metric_type)
                                                        ? goal.current_amount.toLocaleString()
                                                        : `₹${goal.current_amount.toLocaleString()}`}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-xs text-neutral-400">Target</div>
                                            <div className="font-bold text-white text-sm">
                                                {['margin', 'daily_margin', 'avg_margin'].includes(goal.metric_type)
                                                    ? `${goal.target_amount.toFixed(1)}%`
                                                    : ['customer_count', 'sales_count'].includes(goal.metric_type)
                                                        ? goal.target_amount.toLocaleString()
                                                        : `₹${goal.target_amount.toLocaleString()}`}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-xs text-neutral-400">Remaining</div>
                                            <div className={cn(
                                                "font-bold text-sm",
                                                remaining <= 0 ? "text-emerald-400" : "text-amber-400"
                                            )}>
                                                {remaining <= 0 ? (
                                                    <span className="flex items-center justify-center gap-1">
                                                        <CheckCircle2 size={12} /> Done
                                                    </span>
                                                ) : (
                                                    ['margin', 'daily_margin', 'avg_margin'].includes(goal.metric_type)
                                                        ? `${remaining.toFixed(1)}%`
                                                        : ['customer_count', 'sales_count'].includes(goal.metric_type)
                                                            ? remaining.toLocaleString()
                                                            : `₹${remaining.toLocaleString()}`
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Deadline & Actions */}
                                    {isOverdue ? (
                                        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                                            <div className="flex items-center gap-2 mb-3 text-red-400">
                                                <AlertCircle size={16} />
                                                <span className="text-xs font-semibold">Goal Expired & Locked</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(goal)}
                                                    className="bg-zinc-800 border-white/10 hover:bg-zinc-700 h-8 text-xs text-white"
                                                >
                                                    Extend Deadline
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(goal)}
                                                    className="bg-zinc-800 border-white/10 hover:bg-zinc-700 h-8 text-xs text-white"
                                                >
                                                    Adjust Target
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleDeleteGoal(goal.id)}
                                                    className="col-span-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 h-8 text-xs font-medium"
                                                >
                                                    Delete Goal
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs">
                                                {goal.deadline && (
                                                    <span className={cn(
                                                        "flex items-center gap-1 px-2 py-1 rounded-lg",
                                                        isUrgent ? "bg-amber-500/20 text-amber-400" :
                                                            "bg-white/10 text-neutral-300"
                                                    )}>
                                                        <Clock size={12} />
                                                        {daysLeft === 0 ? 'Due Today!' : `${daysLeft} days left`}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Update Progress Button - Only show for manual_check (EMI) goals */}
                                                {goal.metric_type === 'manual_check' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleOpenUpdateProgress(goal)}
                                                        className="bg-zinc-800 border-white/10 hover:bg-zinc-700 h-8 px-3 text-xs text-white"
                                                    >
                                                        <Edit3 size={12} className="mr-1" />
                                                        Update
                                                    </Button>
                                                )}

                                                {/* Mark Complete Button */}
                                                {(progress >= 100 || goal.metric_type === 'manual_check') && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setConfirmComplete(goal.id)}
                                                        className="bg-emerald-600 hover:bg-emerald-500 h-8 px-3 text-xs"
                                                    >
                                                        <CheckCircle2 size={14} className="mr-1" />
                                                        Mark Complete
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Motivation Message */}
                                    {remaining > 0 && !isOverdue && (
                                        <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                            <div className="flex items-start gap-2">
                                                <Sparkles size={14} className="text-purple-400 mt-0.5 shrink-0" />
                                                <p className="text-xs text-purple-300">
                                                    {progress >= 75
                                                        ? "Almost there! Just a little more push! 🔥"
                                                        : progress >= 50
                                                            ? "Halfway there! Keep the momentum going! 💪"
                                                            : progress >= 25
                                                                ? "Good progress! Stay consistent! 📈"
                                                                : "Let's build momentum! Every step counts! 🚀"
                                                    }
                                                    {daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
                                                        <span className="block mt-1 font-medium">
                                                            You need ₹{Math.ceil(remaining / (daysLeft || 1)).toLocaleString()}/day to hit your target.
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Completed Goals */}
            {!isLoading && completedGoals.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Trophy size={14} className="text-emerald-500" />
                        Completed ({completedGoals.length})
                    </h2>
                    <div className="space-y-3">
                        {completedGoals.slice(0, 5).map((goal) => (
                            <div
                                key={goal.id}
                                className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 size={16} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white/80 text-sm">{goal.title}</h3>
                                        <p className="text-[10px] text-neutral-500">
                                            ₹{goal.target_amount.toLocaleString()} achieved
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteGoal(goal.id)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                                    aria-label="Delete completed goal"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add/Edit Goal Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); resetForm(); }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Target size={20} className="text-purple-400" />
                        </div>
                        <span className="font-bold text-white">{editingGoal ? 'Edit Goal' : 'New Goal'}</span>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Goal Title *</label>
                        <Input
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder="e.g., Pay January EMI, Reach 50k Profit"
                            className="bg-white/5"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Description (optional)</label>
                        <Input
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            placeholder="Any notes about this goal"
                            className="bg-white/5"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(goalTypeLabels).map(([type, label]) => (
                                <button
                                    key={type}
                                    onClick={() => setFormMetricType(type as any)}
                                    className={cn(
                                        "p-3 rounded-xl border text-left transition-all text-xs",
                                        formMetricType === type
                                            ? "bg-purple-500/20 border-purple-500/50 text-white"
                                            : "bg-white/5 border-white/10 text-neutral-400 hover:border-white/20"
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {goalTypeIcons[type]}
                                        <span className="font-medium">{label}</span>
                                    </div>
                                    <p className="text-[10px] text-neutral-500 pl-7">
                                        {goalTypeDescriptions[type]}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                            {['margin', 'daily_margin', 'avg_margin'].includes(formMetricType)
                                ? 'Target Margin (%) *'
                                : ['customer_count', 'sales_count'].includes(formMetricType)
                                    ? 'Target Count *'
                                    : 'Target Amount (₹) *'}
                        </label>
                        <Input
                            type="number"
                            value={formTargetAmount}
                            onChange={(e) => setFormTargetAmount(e.target.value)}
                            placeholder={['margin', 'daily_margin', 'avg_margin'].includes(formMetricType)
                                ? 'e.g., 20'
                                : 'e.g., 15000'}
                            className="bg-white/5"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Deadline (optional)</label>
                        <Input
                            type="date"
                            value={formDeadline}
                            onChange={(e) => setFormDeadline(e.target.value)}
                            className="bg-white/5"
                        />
                    </div>

                    {/* Start Date - Only show for auto-tracked goals */}
                    {formMetricType !== 'manual_check' && (
                        <div>
                            <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Start Tracking From</label>
                            <Input
                                type="date"
                                value={formStartDate}
                                onChange={(e) => setFormStartDate(e.target.value)}
                                className="bg-white/5"
                            />
                            <p className="text-[10px] text-neutral-500 mt-1">
                                Net profit/progress will be calculated from this date onwards
                            </p>
                        </div>
                    )}

                    {/* Recurrence Toggle */}
                    <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
                        <div className="flex flex-col">
                            <span className="text-sm text-white font-medium">Recurring Goal?</span>
                            <span className="text-[10px] text-neutral-400">e.g., Monthly Rent, Weekly Savings</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant={formIsRecurring ? 'default' : 'outline'}
                                onClick={() => setFormIsRecurring(!formIsRecurring)}
                                className={cn(
                                    "px-3 h-8 text-xs",
                                    formIsRecurring ? "bg-purple-600 hover:bg-purple-500" : "border-white/20 text-neutral-400"
                                )}
                            >
                                {formIsRecurring ? 'Yes' : 'No'}
                            </Button>
                        </div>
                    </div>

                    {/* Recurrence Type Selection (Conditional) */}
                    {formIsRecurring && (
                        <div className="grid grid-cols-3 gap-2 animate-in slide-in-from-top-2 fade-in">
                            {['weekly', 'monthly', 'yearly'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setFormRecurrenceType(type as any)}
                                    className={cn(
                                        "p-2 rounded-lg text-xs font-medium border transition-all capitalized",
                                        formRecurrenceType === type
                                            ? "bg-purple-500/20 border-purple-500/50 text-white"
                                            : "bg-white/5 border-white/10 text-neutral-400 hover:border-white/20"
                                    )}
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => { setShowAddModal(false); resetForm(); }}
                            className="flex-1 border-white/20 hover:bg-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveGoal}
                            className="flex-1 bg-purple-600 hover:bg-purple-500"
                        >
                            {editingGoal ? 'Save Changes' : 'Create Goal'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Confirm Complete Modal */}
            <Modal
                isOpen={!!confirmComplete}
                onClose={() => setConfirmComplete(null)}
                title={
                    <div className="flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                            <Trophy size={32} className="text-emerald-400" />
                        </div>
                    </div>
                }
            >
                <div className="text-center">
                    <h3 className="text-lg font-bold text-white mb-2">Confirm Completion</h3>
                    <p className="text-sm text-neutral-400 mb-6">
                        Are you sure you've achieved this goal? This action will mark it as complete and archive it.
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmComplete(null)}
                            className="flex-1 border-white/20 hover:bg-white/10"
                        >
                            Not Yet
                        </Button>
                        <Button
                            onClick={() => confirmComplete && handleCompleteGoal(confirmComplete)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                        >
                            Yes, I Did It! 🎉
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Update Progress Modal */}
            <Modal
                isOpen={showProgressModal}
                onClose={() => setShowProgressModal(false)}
                title="Update Progress"
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-neutral-400 mb-1.5 block">
                            Amount to Adjust (₹)
                        </label>
                        <Input
                            type="number"
                            value={newProgressAmount}
                            onChange={(e) => setNewProgressAmount(e.target.value)}
                            placeholder="e.g. 500"
                            className="bg-zinc-800 border-white/10"
                            autoFocus
                        />
                        <p className="text-[10px] text-neutral-500 mt-1.5">
                            Enter an amount to add or subtract from your current collected total.
                            {updatingGoal?.metric_type === 'net_profit' && (
                                <span className="text-amber-500 block mt-1">
                                    Note: Manually updating this Net Profit goal will switch it to 'Manual Check' mode to prevent auto-sync overwrites.
                                </span>
                            )}
                        </p>
                    </div>

                    {updatingGoal && (
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-neutral-400">Current Total:</span>
                                <span className="text-white font-mono">₹{updatingGoal.current_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-neutral-400">New Total will be:</span>
                                <span className="text-purple-400 font-bold font-mono">
                                    ₹{(updatingGoal.current_amount + (parseFloat(newProgressAmount) || 0)).toLocaleString()}
                                    <span className="text-neutral-500 font-normal mx-1">or</span>
                                    ₹{Math.max(0, updatingGoal.current_amount - (parseFloat(newProgressAmount) || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setShowProgressModal(false)}
                            className="flex-1 border-white/20 hover:bg-white/10"
                        >
                            Cancel
                        </Button>

                        <Button
                            onClick={() => handleSaveAdjustment('subtract')}
                            className="flex-1 bg-red-600/80 hover:bg-red-500"
                        >
                            - Subtract
                        </Button>
                        <Button
                            onClick={() => handleSaveAdjustment('add')}
                            className="flex-1 bg-emerald-600/80 hover:bg-emerald-500"
                        >
                            + Add
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
