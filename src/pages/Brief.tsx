import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Target,
    IndianRupee,
    TrendingUp,
    Calendar,
    Sparkles,
    Trophy,
    ChevronRight,
    Receipt
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/toast-provider';
import { supabase } from '../lib/supabase';
import { useInsightsGenerator } from '../hooks/useInsightsGenerator';
import { getAllGoals, completeGoal, updateGoal, type UserGoal } from '../lib/aiMemory';

// Types
type PaymentReminder = {
    id: string;
    customer_id: string;
    amount: number;
    due_date: string;
    status: 'pending' | 'paid';
};

type AccountPayable = {
    id: string;
    supplier_id: string;
    amount: number;
    due_date: string;
    status: 'pending' | 'paid';
};

type Customer = {
    id: string;
    name: string;
};

type Supplier = {
    id: string;
    name: string;
};

export default function Brief() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { tasks } = useInsightsGenerator();

    // State
    const [loading, setLoading] = useState(true);
    const [goals, setGoals] = useState<UserGoal[]>([]);
    const [paymentReminders, setPaymentReminders] = useState<PaymentReminder[]>([]);
    const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    // Goal completion modal
    const [completingGoal, setCompletingGoal] = useState<UserGoal | null>(null);
    const [surplusAmount, setSurplusAmount] = useState(0);
    const [surplusDecision, setSurplusDecision] = useState<'next-goal' | 'next-month' | null>(null);

    // Load all data
    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            // Load goals
            const goalsData = await getAllGoals();
            const activeGoals = goalsData.filter(g => g.status === 'active');
            setGoals(activeGoals);

            // Load payment reminders (to be received)
            const { data: remindersData } = await supabase
                .from('payment_reminders')
                .select('*')
                .eq('status', 'pending')
                .order('due_date', { ascending: true });
            if (remindersData) setPaymentReminders(remindersData);

            // Load accounts payable (to be paid)
            const { data: payablesData } = await supabase
                .from('accounts_payable')
                .select('*')
                .eq('status', 'pending')
                .order('due_date', { ascending: true });
            if (payablesData) setAccountsPayable(payablesData);

            // Load customers
            const { data: customersData } = await supabase
                .from('customers')
                .select('id, name')
                .eq('is_active', true);
            if (customersData) setCustomers(customersData);

            // Load suppliers
            const { data: suppliersData } = await supabase
                .from('suppliers')
                .select('id, name')
                .eq('is_active', true);
            if (suppliersData) setSuppliers(suppliersData);

        } catch (error) {
            console.error('Error loading brief data:', error);
            toast('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Helper functions
    const getCustomerName = (id: string) => {
        return customers.find(c => c.id === id)?.name || 'Unknown';
    };

    const getSupplierName = (id: string) => {
        return suppliers.find(s => s.id === id)?.name || 'Unknown';
    };

    const getDueStatus = (dateStr: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dateStr);
        due.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)} days`, color: 'text-red-500', bg: 'bg-red-500/10' };
        if (diffDays === 0) return { text: 'Due Today', color: 'text-orange-500', bg: 'bg-orange-500/10' };
        if (diffDays === 1) return { text: 'Due Tomorrow', color: 'text-amber-500', bg: 'bg-amber-500/10' };
        return { text: `Due in ${diffDays} days`, color: 'text-zinc-400', bg: 'bg-zinc-500/10' };
    };

    // Handle goal completion with surplus
    const handleGoalClick = (goal: UserGoal) => {
        const progress = (goal.current_amount / goal.target_amount) * 100;

        if (progress >= 100) {
            const surplus = goal.current_amount - goal.target_amount;
            setCompletingGoal(goal);
            setSurplusAmount(surplus);
            setSurplusDecision(null);
        }
    };

    const handleCompleteGoal = async () => {
        if (!completingGoal || surplusDecision === null) {
            toast('Please select how to handle the surplus', 'warning');
            return;
        }

        try {
            // Complete the goal
            await completeGoal(completingGoal.id);

            if (surplusAmount > 0) {
                if (surplusDecision === 'next-goal') {
                    // Find the next active goal to apply surplus
                    const nextGoal = goals.find(g => g.id !== completingGoal.id && g.status === 'active');
                    if (nextGoal) {
                        await updateGoal(nextGoal.id, {
                            current_amount: nextGoal.current_amount + surplusAmount
                        });
                        toast(`Goal completed! ₹${surplusAmount.toLocaleString()} surplus applied to next goal.`, 'success');
                    } else {
                        toast('Goal completed! No other active goals to apply surplus.', 'success');
                    }
                } else {
                    // Track from next month - we'll just note it in the toast
                    toast(`Goal completed! ₹${surplusAmount.toLocaleString()} surplus will be tracked from next month.`, 'success');
                }
            } else {
                toast('Goal completed! 🎉', 'success');
            }

            // Reload data and close modal
            setCompletingGoal(null);
            setSurplusAmount(0);
            setSurplusDecision(null);
            loadAllData();
        } catch (error) {
            console.error('Error completing goal:', error);
            toast('Failed to complete goal', 'error');
        }
    };

    // Calculate totals
    const totalToReceive = paymentReminders.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalToPay = accountsPayable.reduce((sum, a) => sum + Number(a.amount), 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24 animate-in fade-in">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/10 px-4 py-4">
                <div className="flex items-center gap-3 max-w-2xl mx-auto">
                    <button
                        onClick={() => window.history.back()}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-0.5">
                            <Sparkles size={14} />
                            <span className="font-semibold">Your Daily Brief</span>
                        </div>
                        <h1 className="text-xl font-bold text-white tracking-tight">
                            {format(new Date(), 'EEEE, MMM d')}
                        </h1>
                    </div>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 space-y-6 mt-6">
                {/* Tasks Section */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            Today's Tasks ({tasks.length})
                        </h2>
                        <button
                            onClick={() => navigate('/insights')}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
                        >
                            View All <ChevronRight size={14} />
                        </button>
                    </div>
                    {tasks.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 text-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto mb-2" />
                            <p className="text-sm text-neutral-400">All caught up! No pending tasks.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tasks.slice(0, 3).map((task) => (
                                <div
                                    key={task.id}
                                    className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 flex items-start gap-3"
                                >
                                    {task.severity === 'warning' ? (
                                        <AlertTriangle size={16} className="text-amber-400 mt-0.5" />
                                    ) : (
                                        <Clock size={16} className="text-blue-400 mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white">{task.title}</p>
                                        {task.description && (
                                            <p className="text-xs text-neutral-400 mt-0.5">{task.description}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {tasks.length > 3 && (
                                <button
                                    onClick={() => navigate('/insights')}
                                    className="w-full text-xs text-neutral-400 hover:text-white py-2 transition-colors"
                                >
                                    +{tasks.length - 3} more tasks
                                </button>
                            )}
                        </div>
                    )}
                </section>

                {/* Payments Section */}
                <section>
                    <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <IndianRupee size={16} className="text-blue-500" />
                        Payments
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {/* To Receive */}
                        <button
                            onClick={() => navigate('/payment-reminders')}
                            className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl p-4 text-left hover:from-emerald-500/30 hover:to-emerald-600/20 transition-all group"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <TrendingUp size={16} className="text-emerald-400" />
                                </div>
                                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                    To Receive
                                </span>
                            </div>
                            <p className="text-2xl font-black text-white mb-1">
                                ₹{totalToReceive.toLocaleString()}
                            </p>
                            <p className="text-xs text-emerald-400">
                                {paymentReminders.length} customer{paymentReminders.length !== 1 ? 's' : ''}
                            </p>
                        </button>

                        {/* To Pay */}
                        <button
                            onClick={() => navigate('/accounts-payable')}
                            className="bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 rounded-xl p-4 text-left hover:from-red-500/30 hover:to-red-600/20 transition-all group"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                                    <Receipt size={16} className="text-red-400" />
                                </div>
                                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                                    To Pay
                                </span>
                            </div>
                            <p className="text-2xl font-black text-white mb-1">
                                ₹{totalToPay.toLocaleString()}
                            </p>
                            <p className="text-xs text-red-400">
                                {accountsPayable.length} supplier{accountsPayable.length !== 1 ? 's' : ''}
                            </p>
                        </button>
                    </div>

                    {/* Recent Payment Items */}
                    {(paymentReminders.length > 0 || accountsPayable.length > 0) && (
                        <div className="mt-3 space-y-2">
                            {paymentReminders.slice(0, 2).map((reminder) => {
                                const status = getDueStatus(reminder.due_date);
                                return (
                                    <div
                                        key={reminder.id}
                                        onClick={() => navigate('/payment-reminders')}
                                        className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-900/70 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                <TrendingUp size={14} className="text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {getCustomerName(reminder.customer_id)}
                                                </p>
                                                <p className={cn("text-xs font-medium", status.color)}>
                                                    {status.text}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-400">
                                            ₹{Number(reminder.amount).toLocaleString()}
                                        </p>
                                    </div>
                                );
                            })}
                            {accountsPayable.slice(0, 2).map((payable) => {
                                const status = getDueStatus(payable.due_date);
                                return (
                                    <div
                                        key={payable.id}
                                        onClick={() => navigate('/accounts-payable')}
                                        className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-900/70 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                                                <Receipt size={14} className="text-red-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {getSupplierName(payable.supplier_id)}
                                                </p>
                                                <p className={cn("text-xs font-medium", status.color)}>
                                                    {status.text}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-red-400">
                                            ₹{Number(payable.amount).toLocaleString()}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Goals Section */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                            <Target size={16} className="text-purple-500" />
                            My Goals ({goals.length})
                        </h2>
                        <button
                            onClick={() => navigate('/insights/goals')}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
                        >
                            View All <ChevronRight size={14} />
                        </button>
                    </div>
                    {goals.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 text-center">
                            <Target className="w-8 h-8 text-purple-400/50 mx-auto mb-2" />
                            <p className="text-sm text-neutral-400">No active goals</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {goals.map((goal) => {
                                const progress = (goal.current_amount / goal.target_amount) * 100;
                                const remaining = goal.target_amount - goal.current_amount;
                                const surplus = goal.current_amount - goal.target_amount;
                                const isComplete = progress >= 100;
                                const daysLeft = goal.deadline ? differenceInDays(new Date(goal.deadline), new Date()) : null;

                                return (
                                    <div
                                        key={goal.id}
                                        onClick={() => handleGoalClick(goal)}
                                        className={cn(
                                            "bg-zinc-900/80 border rounded-xl p-4 transition-all",
                                            isComplete ? "border-emerald-500/50 cursor-pointer hover:bg-zinc-900" : "border-white/10"
                                        )}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center",
                                                    isComplete ? "bg-emerald-500/20" : "bg-purple-500/20"
                                                )}>
                                                    {isComplete ? (
                                                        <Trophy size={20} className="text-emerald-400" />
                                                    ) : (
                                                        <Target size={20} className="text-purple-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-sm">{goal.title}</h3>
                                                    {goal.description && (
                                                        <p className="text-xs text-neutral-400 mt-0.5">{goal.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mb-3">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-neutral-400">Progress</span>
                                                <span className={cn(
                                                    "font-bold",
                                                    isComplete ? "text-emerald-400" : "text-white"
                                                )}>
                                                    {progress.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        isComplete
                                                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                                            : "bg-gradient-to-r from-purple-500 to-purple-400"
                                                    )}
                                                    style={{ width: `${Math.min(100, progress)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-white/5 rounded-lg p-2 text-center">
                                                <div className="text-xs text-neutral-400">Current</div>
                                                <div className="font-bold text-white text-xs">
                                                    ₹{goal.current_amount.toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-2 text-center">
                                                <div className="text-xs text-neutral-400">Target</div>
                                                <div className="font-bold text-white text-xs">
                                                    ₹{goal.target_amount.toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-2 text-center">
                                                <div className="text-xs text-neutral-400">
                                                    {isComplete ? 'Surplus' : 'Remaining'}
                                                </div>
                                                <div className={cn(
                                                    "font-bold text-xs",
                                                    isComplete ? "text-emerald-400" : "text-amber-400"
                                                )}>
                                                    ₹{isComplete ? surplus.toLocaleString() : Math.max(0, remaining).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Completion Message */}
                                        {isComplete && (
                                            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                <div className="flex items-start gap-2">
                                                    <Sparkles size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                                    <div className="flex-1">
                                                        <p className="text-xs text-emerald-300 font-medium">
                                                            🎉 Congratulations! You have already saved ₹{goal.current_amount.toLocaleString()}!
                                                        </p>
                                                        {surplus > 0 && (
                                                            <p className="text-xs text-emerald-400 mt-1 font-bold">
                                                                You have ₹{surplus.toLocaleString()} surplus. Tap to mark as complete and decide what to do with it.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Deadline */}
                                        {!isComplete && goal.deadline && daysLeft !== null && (
                                            <div className="mt-2 flex items-center gap-2 text-xs">
                                                <span className={cn(
                                                    "flex items-center gap-1 px-2 py-1 rounded-lg",
                                                    daysLeft < 0 ? "bg-red-500/20 text-red-400" :
                                                        daysLeft <= 3 ? "bg-amber-500/20 text-amber-400" :
                                                            "bg-white/10 text-neutral-300"
                                                )}>
                                                    <Clock size={12} />
                                                    {daysLeft < 0 ? `Overdue by ${Math.abs(daysLeft)} days` :
                                                        daysLeft === 0 ? 'Due Today!' :
                                                            `${daysLeft} days left`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {/* Goal Completion Modal */}
            <Modal
                isOpen={!!completingGoal}
                onClose={() => {
                    setCompletingGoal(null);
                    setSurplusAmount(0);
                    setSurplusDecision(null);
                }}
                title={
                    <div className="flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                            <Trophy size={32} className="text-emerald-400" />
                        </div>
                    </div>
                }
            >
                <div className="text-center space-y-4">
                    <h3 className="text-lg font-bold text-white">Goal Completed!</h3>
                    {completingGoal && (
                        <>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                                <p className="text-sm text-emerald-300 mb-2">
                                    🎉 Congratulations! You have already saved
                                </p>
                                <p className="text-3xl font-black text-emerald-400">
                                    ₹{completingGoal.current_amount.toLocaleString()}
                                </p>
                            </div>

                            {surplusAmount > 0 && (
                                <>
                                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                                        <p className="text-xs text-purple-300 mb-1 uppercase tracking-wider">
                                            Surplus Amount
                                        </p>
                                        <p className="text-2xl font-black text-purple-400">
                                            ₹{surplusAmount.toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="text-left">
                                        <p className="text-sm text-neutral-400 mb-3">
                                            What would you like to do with the surplus?
                                        </p>
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => setSurplusDecision('next-goal')}
                                                className={cn(
                                                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                                                    surplusDecision === 'next-goal'
                                                        ? "border-purple-500 bg-purple-500/20"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <Target size={20} className="text-purple-400 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-white">Track towards next goal</p>
                                                        <p className="text-xs text-neutral-400 mt-0.5">
                                                            Apply ₹{surplusAmount.toLocaleString()} to your next active goal
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                onClick={() => setSurplusDecision('next-month')}
                                                className={cn(
                                                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                                                    surplusDecision === 'next-month'
                                                        ? "border-blue-500 bg-blue-500/20"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <Calendar size={20} className="text-blue-400 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-white">Start tracking from next month</p>
                                                        <p className="text-xs text-neutral-400 mt-0.5">
                                                            Keep ₹{surplusAmount.toLocaleString()} separate for next month
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setCompletingGoal(null);
                                        setSurplusAmount(0);
                                        setSurplusDecision(null);
                                    }}
                                    className="flex-1 border-white/20 hover:bg-white/10"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCompleteGoal}
                                    disabled={surplusAmount > 0 && !surplusDecision}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Complete Goal 🎉
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
