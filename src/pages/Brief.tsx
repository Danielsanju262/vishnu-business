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
    Calendar,
    Sparkles,
    Trophy,
    ChevronRight,
    Receipt,
    ChevronDown,
    ChevronUp,
    MessageSquareQuote
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

    // We will store just the overdue/today items for display
    const [todayReminders, setTodayReminders] = useState<PaymentReminder[]>([]);
    const [overdueReminders, setOverdueReminders] = useState<PaymentReminder[]>([]);

    const [todayPayables, setTodayPayables] = useState<AccountPayable[]>([]);
    const [overduePayables, setOverduePayables] = useState<AccountPayable[]>([]);

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    // UI State
    const [isFinancialsOpen, setIsFinancialsOpen] = useState(false);
    const [aiSummary, setAiSummary] = useState('');

    // Yesterday's Stats
    const [yesterdayStats, setYesterdayStats] = useState({ revenue: 0, netProfit: 0 });

    // Goal completion modal
    const [completingGoal, setCompletingGoal] = useState<UserGoal | null>(null);
    const [surplusAmount, setSurplusAmount] = useState(0);
    const [surplusDecision, setSurplusDecision] = useState<'next-goal' | 'next-month' | null>(null);

    // Load all data
    useEffect(() => {
        loadAllData();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('brief-goals-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_goals'
                },
                () => {
                    loadAllData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const generateDailySummary = (
        yStats: { revenue: number, netProfit: number },
        dbyStats: { revenue: number, netProfit: number } | null,
        historyStats: { thirtyDayAvg: number, highestRevenue: number } | null,
        tPay: AccountPayable[],
        oPay: AccountPayable[],
        tRec: PaymentReminder[],
        oRec: PaymentReminder[],
        pendingTasks: any[]
    ) => {
        const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
        const hour = new Date().getHours();

        // 1. Greeting
        let greeting = '';
        if (hour < 12) {
            greeting = getRandom([
                'Good morning!', 'Rise and shine!', 'Top of the morning!',
                'Hello there!', 'Welcome back!', 'Ready for a new day?',
                'Morning check-in.'
            ]);
        } else if (hour < 17) {
            greeting = getRandom([
                'Good afternoon!', 'Hope your day is going well.',
                'Afternoon check-in.', 'Hello!', 'How is the day treating you?'
            ]);
        } else {
            greeting = getRandom([
                'Good evening!', 'Winding down?', 'Evening brief.',
                'Hello!', 'End of day check-in.'
            ]);
        }

        // 2. Revenue sentiment
        let revenueText = '';
        const revStr = `₹${yStats.revenue.toLocaleString()}`;
        const profStr = `₹${yStats.netProfit.toLocaleString()}`;

        if (yStats.revenue > 0) {
            const revenuePhrases = [
                `Yesterday was solid with ${revStr} in sales`,
                `You generated ${revStr} in revenue yesterday`,
                `Business brought in ${revStr} yesterday`,
                `Sales totaled ${revStr} yesterday`,
                `You recorded ${revStr} in sales yesterday`,
                `Yesterday's numbers came in at ${revStr}`
            ];

            revenueText = getRandom(revenuePhrases);

            if (yStats.netProfit > 0) {
                const profitPhrases = [
                    `, netting a profit of ${profStr}.`,
                    `, with a take-home of ${profStr}.`,
                    `, leaving you ${profStr} in the green.`,
                    ` and a positive net of ${profStr}.`,
                    `, clearing ${profStr} after costs.`,
                    ` contributing ${profStr} to your bottom line.`
                ];
                revenueText += getRandom(profitPhrases);
            } else if (yStats.netProfit < 0) {
                const lossPhrases = [
                    `, although expenses put you at ${profStr}.`,
                    `, but costs ran high at ${profStr}.`,
                    `, dipping into the red by ${profStr.replace('-', '')}.`
                ];
                revenueText += getRandom(lossPhrases);
            } else {
                revenueText += `, breaking even.`;
            }
        } else {
            revenueText = getRandom([
                "Yesterday didn't see any sales action.",
                "No revenue was recorded yesterday.",
                "Sales were flat yesterday.",
                "Yesterday was a quiet day for business.",
                "No transactions logged for yesterday."
            ]);
        }

        // 3. Financial obligations
        const totalDueCount = tPay.length + oPay.length;
        const totalRecCount = tRec.length + oRec.length;

        let financeText = '';
        if (totalDueCount > 0 || totalRecCount > 0) {
            financeText = getRandom([" On the money front, ", " Financially, ", " Regarding cash flow, ", " looking at your accounts, "]);

            if (totalDueCount > 0 && totalRecCount > 0) {
                financeText += getRandom([
                    "it's a busy day for both payments and collections.",
                    "money is moving in and out today.",
                    "you have a mix of inflows and outflows to manage.",
                    "pending payments and expected collections are on the docket."
                ]);
            } else if (totalDueCount > 0) {
                financeText += getRandom([
                    "you have some bills to clear today.",
                    "there are outgoing payments scheduled.",
                    "a few payments need your attention.",
                    "you'll need to settle some dues today."
                ]);
            } else {
                financeText += getRandom([
                    "looks like you'll be receiving funds today.",
                    "collections are expected to come in.",
                    "inflows are scheduled for today.",
                    "customers are due to pay you today."
                ]);
            }
        } else {
            financeText = getRandom([
                " No payments or collections are due today.",
                " Cash flow obligations are clear for today.",
                " No scheduled financial movements today.",
                " You have no dues or collections pending today."
            ]);
        }

        // 4. Tasks
        let taskText = '';
        if (pendingTasks.length > 0) {
            taskText = getRandom([
                ` You have ${pendingTasks.length} items on your agenda.`,
                ` There are ${pendingTasks.length} tasks awaiting action.`,
                ` Your to-do list has ${pendingTasks.length} items.`,
                ` Keep an eye on your ${pendingTasks.length} pending tasks.`,
                ` Don't forget, there are ${pendingTasks.length} things to do.`
            ]);
        } else {
            taskText = getRandom([
                ` Use the extra time wisely—no pending tasks!`,
                ` Your task list is completely clear.`,
                ` Nothing on your plate task-wise right now.`,
                ` You're all caught up on work items.`
            ]);
        }

        // 5. Closing
        const closing = getRandom([
            " Let's make it a good one.",
            " Have a great day ahead!",
            " Let's get things moving.",
            " Time to execute.",
            " Here's to a profitable day.",
            " Stay focused and win today."
        ]);

        // 6. Comparative Analysis (Dynamic & Randomized)
        let comparativeText = '';

        // We have multiple "insight modules" we can choose from.
        // We will randomly pick ONE to display to keep it fresh.
        const insightModules: string[] = [];

        // Module A: Day-over-Day (Yesterday vs Day Before)
        if (dbyStats && yStats.revenue > 0) {
            const revDiff = yStats.revenue - dbyStats.revenue;
            const profitDiff = yStats.netProfit - dbyStats.netProfit;
            const percentDiff = dbyStats.revenue > 0
                ? ((revDiff / dbyStats.revenue) * 100).toFixed(0)
                : null;

            if (revDiff > 0) {
                let modText = getRandom([
                    ` This is an improvement from the previous day's sales of ₹${dbyStats.revenue.toLocaleString()}.`,
                    ` You beat the previous day's sales by ₹${Math.abs(revDiff).toLocaleString()}.`,
                    ` That's an upward trend compared to the day before (${percentDiff}% growth!).`
                ]);

                // Bonus insight if profit also improved significantly
                if (profitDiff > 1000) {
                    modText += getRandom([
                        ` Plus, your profit jumped by ₹${profitDiff.toLocaleString()}!`,
                        ` Profit is also up by ₹${profitDiff.toLocaleString()}. Great job!`
                    ]);
                }
                insightModules.push(modText);

            } else if (revDiff < 0) {
                insightModules.push(getRandom([
                    ` A slight dip from the previous day (${dbyStats.revenue.toLocaleString()}), but today is a new chance.`,
                    ` Lower than the day before yesterday, so let's push hard today!`,
                    ` You did ₹${dbyStats.revenue.toLocaleString()} the day before, so there's room to grow back up today.`,
                ]));
            }
        }

        // Module B: 30-Day High (Record Breaking)
        if (historyStats && yStats.revenue > 0 && historyStats.highestRevenue > 0) {
            if (yStats.revenue >= historyStats.highestRevenue) {
                comparativeText = getRandom([
                    " 🏆 Amazing! Yesterday was your HIGHEST revenue day in the last 30 days!",
                    " Incredible work—you hit a new monthly high yesterday!",
                    " That's a new 30-day record! Momentum is on your side."
                ]);
                return `${greeting} ${revenueText}${comparativeText}${financeText}${taskText}${closing}`;
            } else if (yStats.revenue > historyStats.highestRevenue * 0.95) {
                insightModules.push(" You were very close to your monthly revenue record yesterday!");
            }
        }

        // Module C: 30-Day Average Comparison
        if (historyStats && historyStats.thirtyDayAvg > 0 && yStats.revenue > 0) {
            if (yStats.revenue > historyStats.thirtyDayAvg * 1.1) {
                insightModules.push(getRandom([
                    ` You performed well above your 30-day average of ₹${Math.round(historyStats.thirtyDayAvg).toLocaleString()}.`,
                    ` That's a strong day—beating your monthly daily average.`,
                    ` You're tracking higher than your usual daily average.`
                ]));
            } else if (yStats.revenue < historyStats.thirtyDayAvg * 0.8) {
                insightModules.push(getRandom([
                    ` Slightly below your 30-day average (${Math.round(historyStats.thirtyDayAvg).toLocaleString()}).`,
                    ` A bit lower than your usual daily average, but it happens.`,
                ]));
            }
        }

        // Select an insight
        if (!comparativeText && insightModules.length > 0) {
            comparativeText = getRandom(insightModules);
        } else if (!comparativeText && dbyStats) {
            comparativeText = " Consistency is key—revenue is stable.";
        }

        return `${greeting} ${revenueText}${comparativeText}${financeText}${taskText}${closing}`;
    };

    const loadAllData = async () => {
        setLoading(true);
        try {
            // Load goals
            const goalsData = await getAllGoals();
            const activeGoals = goalsData.filter(g => g.status === 'active');
            setGoals(activeGoals);

            // Fetch yesterday's stats
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yStr = yesterdayDate.toISOString().split('T')[0];

            // Yesterday Revenue
            const { data: ySales } = await supabase
                .from('transactions')
                .select('sell_price, buy_price, quantity')
                .eq('date', yStr)
                .is('deleted_at', null);

            const yRevenue = (ySales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
            const yCost = (ySales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);

            // Yesterday Expenses
            const { data: yExpenses } = await supabase
                .from('expenses')
                .select('amount')
                .eq('date', yStr)
                .is('deleted_at', null);

            const yExpenseTotal = (yExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

            const stats = {
                revenue: yRevenue,
                netProfit: yRevenue - yCost - yExpenseTotal
            };
            setYesterdayStats(stats);

            // Fetch DAY BEFORE YESTERDAY stats for comparison
            const dbyDate = new Date();
            dbyDate.setDate(dbyDate.getDate() - 2);
            const dbyStr = dbyDate.toISOString().split('T')[0];

            let dbyStats = null;
            try {
                // DBY Revenue
                const { data: dbySales } = await supabase
                    .from('transactions')
                    .select('sell_price, buy_price, quantity')
                    .eq('date', dbyStr)
                    .is('deleted_at', null);

                const dbyRev = (dbySales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
                const dbyCost = (dbySales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);

                // DBY Expenses
                const { data: dbyExpenses } = await supabase
                    .from('expenses')
                    .select('amount')
                    .eq('date', dbyStr)
                    .is('deleted_at', null);

                const dbyExp = (dbyExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

                dbyStats = {
                    revenue: dbyRev,
                    netProfit: dbyRev - dbyCost - dbyExp
                };
                dbyStats = {
                    revenue: dbyRev,
                    netProfit: dbyRev - dbyCost - dbyExp
                };
            } catch (e) {
                console.error("Error fetching DBY stats", e);
            }

            // Fetch LAST 30 DAYS stats for deeper analysis
            let historyStats = null;
            try {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];

                const { data: monthSales } = await supabase
                    .from('transactions')
                    .select('date, sell_price, quantity')
                    .gte('date', thirtyDaysStr)
                    .is('deleted_at', null);

                if (monthSales && monthSales.length > 0) {
                    // Group by date to find daily totals
                    const dailyTotals: Record<string, number> = {};
                    monthSales.forEach(t => {
                        const val = t.sell_price * t.quantity;
                        dailyTotals[t.date] = (dailyTotals[t.date] || 0) + val;
                    });

                    const dailyValues = Object.values(dailyTotals);
                    const highestRevenue = Math.max(...dailyValues);
                    const totalRevenue = dailyValues.reduce((a, b) => a + b, 0);
                    const thirtyDayAvg = totalRevenue / 30; // Simple average over 30 days

                    historyStats = { highestRevenue, thirtyDayAvg };
                }
            } catch (e) {
                console.error("Error fetching history stats", e);
            }

            const todayStr = new Date().toISOString().split('T')[0];
            let tReminders: PaymentReminder[] = [];
            let oReminders: PaymentReminder[] = [];
            let tPayables: AccountPayable[] = [];
            let oPayables: AccountPayable[] = [];

            // Load payment reminders (To Receive)
            const { data: remindersData } = await supabase
                .from('payment_reminders')
                .select('*')
                .eq('status', 'pending')
                .lte('due_date', todayStr) // Only today or older
                .order('due_date', { ascending: true });

            if (remindersData) {
                tReminders = remindersData.filter(r => r.due_date === todayStr);
                oReminders = remindersData.filter(r => r.due_date < todayStr);
                setTodayReminders(tReminders);
                setOverdueReminders(oReminders);
            }

            // Load accounts payable (To Pay)
            const { data: payablesData } = await supabase
                .from('accounts_payable')
                .select('*')
                .eq('status', 'pending')
                .lte('due_date', todayStr) // Only today or older
                .order('due_date', { ascending: true });

            if (payablesData) {
                tPayables = payablesData.filter(p => p.due_date === todayStr);
                oPayables = payablesData.filter(p => p.due_date < todayStr);
                setTodayPayables(tPayables);
                setOverduePayables(oPayables);
            }

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

            // Generate Summary using filtered lists AND dbyStats AND historyStats
            setAiSummary(generateDailySummary(stats, dbyStats, historyStats, tPayables, oPayables, tReminders, oReminders, tasks));

        } catch (error) {
            console.error('Error loading brief data:', error);
            toast('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Helper functions


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

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Totals for summary
    const totalToPay = todayPayables.reduce((sum, p) => sum + p.amount, 0) + overduePayables.reduce((sum, p) => sum + p.amount, 0);
    const totalToReceive = todayReminders.reduce((sum, r) => sum + r.amount, 0) + overdueReminders.reduce((sum, r) => sum + r.amount, 0);

    return (
        <div className="min-h-screen bg-background pb-24 animate-in fade-in">
            {/* Header */}
            <div
                className="sticky top-0 z-50 border-b border-neutral-200 dark:border-white/10 px-4 py-4 shadow-sm"
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                <div className="flex items-center gap-3 max-w-2xl mx-auto">
                    <button
                        onClick={() => window.history.back()}
                        className="p-3 -ml-2 text-neutral-400 hover:text-white transition-all"
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-0.5">
                            <Sparkles size={14} />
                            <span className="font-semibold">Your Brief</span>
                        </div>
                        <h1 className="text-xl font-bold text-foreground tracking-tight">
                            {format(new Date(), 'EEEE, MMM d')}
                        </h1>
                    </div>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 space-y-9 mt-8">

                {/* AI Summary Block */}
                {aiSummary && (
                    <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/5 border border-purple-500/20 rounded-2xl p-4 flex gap-3 shadow-sm">
                        <MessageSquareQuote className="w-6 h-6 text-purple-400 shrink-0 mt-1" />
                        <div>
                            <p className="text-sm font-medium text-purple-100 leading-relaxed">
                                {aiSummary}
                            </p>
                        </div>
                    </div>
                )}

                {/* Yesterday's Stats */}
                <section className="bg-zinc-900 border border-white/25 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                <Calendar size={20} className="text-neutral-300" />
                            </div>
                            <h2 className="text-base font-bold text-white uppercase tracking-wider">Yesterday's Performance</h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs text-neutral-400 mb-1 uppercase tracking-wider">Total Revenue</div>
                            <div className="text-2xl font-bold text-white">₹{yesterdayStats.revenue.toLocaleString()}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="text-xs text-neutral-400 mb-1 uppercase tracking-wider">Net Profit</div>
                            <div className={cn(
                                "text-2xl font-bold",
                                yesterdayStats.netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                                ₹{yesterdayStats.netProfit.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Tasks Section */}
                <section className="bg-zinc-900 border border-white/25 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-emerald-500/10 rounded-xl px-4 py-3 inline-flex items-center gap-3 border border-emerald-500/20">
                            <CheckCircle2 size={20} className="text-emerald-400" />
                            <h2 className="text-base font-bold text-emerald-300 uppercase tracking-wider">Today's Tasks ({tasks.length})</h2>
                        </div>
                        <button
                            onClick={() => navigate('/insights')}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
                        >
                            View All <ChevronRight size={14} />
                        </button>
                    </div>
                    {tasks.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-white/25 rounded-xl p-6 text-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto mb-2" />
                            <p className="text-sm text-neutral-400">All caught up! No pending tasks.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tasks.slice(0, 3).map((task) => (
                                <div
                                    key={task.id}
                                    className="bg-zinc-900/50 border border-white/25 rounded-xl p-3 flex items-start gap-3"
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

                {/* Financial Overview (Collapsible) */}
                <section>
                    <div
                        onClick={() => setIsFinancialsOpen(!isFinancialsOpen)}
                        className="w-full bg-zinc-900 border border-white/25 rounded-2xl p-5 transition-all hover:bg-zinc-800/80 text-left mb-3 cursor-pointer"
                        role="button"
                        tabIndex={0}
                    >
                        <div className="w-full flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                    <IndianRupee size={20} className="text-neutral-300" />
                                </div>
                                <h2 className="text-base font-bold text-white uppercase tracking-wider">Financial Overview</h2>
                            </div>
                            {isFinancialsOpen ? (
                                <ChevronUp size={20} className="text-neutral-500" />
                            ) : (
                                <div className="flex items-center gap-1 text-neutral-400 text-xs font-medium bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg">
                                    Tap to View <ChevronDown size={14} />
                                </div>
                            )}
                        </div>

                        {!isFinancialsOpen && (
                            <div className="w-full grid grid-cols-2 gap-4">
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <span className="text-xs text-neutral-400 mb-1 block uppercase tracking-wider">To Pay</span>
                                    <span className="text-2xl font-bold text-white">₹{totalToPay.toLocaleString()}</span>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <span className="text-xs text-neutral-400 mb-1 block uppercase tracking-wider">To Receive</span>
                                    <span className="text-2xl font-bold text-white">₹{totalToReceive.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {isFinancialsOpen && (
                        <div className="grid md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 fade-in duration-200">
                            {/* To Receive Today */}
                            <div className="bg-zinc-900 border border-white/25 rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <IndianRupee size={20} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white">To Receive Today</h3>
                                        <p className="text-xs text-neutral-400">Customer Payments</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <div className="text-lg font-bold text-white">
                                            ₹{totalToReceive.toLocaleString()}
                                        </div>
                                        <div className="text-[10px] text-emerald-400 font-medium">Total Collectible</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {/* Overdue Items */}
                                    {overdueReminders.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider px-1">Overdue</p>
                                            {overdueReminders.map((item) => {
                                                const customer = customers.find(c => c.id === item.customer_id);
                                                const daysOverdue = differenceInDays(new Date(), new Date(item.due_date));
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                                        <div>
                                                            <div className="text-sm font-medium text-red-200">{customer?.name || 'Unknown Customer'}</div>
                                                            <div className="text-[10px] text-red-400">Due {daysOverdue} days ago</div>
                                                        </div>
                                                        <div className="font-bold text-red-200">₹{item.amount.toLocaleString()}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Due Today Items */}
                                    {todayReminders.length > 0 && (
                                        <div className="space-y-1 mt-2">
                                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">Due Today</p>
                                            {todayReminders.map((item) => {
                                                const customer = customers.find(c => c.id === item.customer_id);
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                                                        <div className="text-sm font-medium text-white">{customer?.name || 'Unknown Customer'}</div>
                                                        <div className="font-bold text-white">₹{item.amount.toLocaleString()}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {overdueReminders.length === 0 && todayReminders.length === 0 && (
                                        <div className="text-center py-4 text-xs text-neutral-500">
                                            No payments expected today.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* To Pay Today */}
                            <div className="bg-zinc-900 border border-white/25 rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                        <Receipt size={20} className="text-orange-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white">To Pay Today</h3>
                                        <p className="text-xs text-neutral-400">Bills & Suppliers</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <div className="text-lg font-bold text-white">
                                            ₹{totalToPay.toLocaleString()}
                                        </div>
                                        <div className="text-[10px] text-orange-400 font-medium">Total Due</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {/* Overdue Items */}
                                    {overduePayables.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider px-1">Overdue</p>
                                            {overduePayables.map((item) => {
                                                const supplier = suppliers.find(s => s.id === item.supplier_id);
                                                const daysOverdue = differenceInDays(new Date(), new Date(item.due_date));
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                                        <div>
                                                            <div className="text-sm font-medium text-red-200">{supplier?.name || 'Unknown Supplier'}</div>
                                                            <div className="text-[10px] text-red-400">Due {daysOverdue} days ago</div>
                                                        </div>
                                                        <div className="font-bold text-red-200">₹{item.amount.toLocaleString()}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Due Today Items */}
                                    {todayPayables.length > 0 && (
                                        <div className="space-y-1 mt-2">
                                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">Due Today</p>
                                            {todayPayables.map((item) => {
                                                const supplier = suppliers.find(s => s.id === item.supplier_id);
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                                                        <div className="text-sm font-medium text-white">{supplier?.name || 'Unknown Supplier'}</div>
                                                        <div className="font-bold text-white">₹{item.amount.toLocaleString()}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {overduePayables.length === 0 && todayPayables.length === 0 && (
                                        <div className="text-center py-4 text-xs text-neutral-500">
                                            No payments due today.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Goals Section */}
                <section className="bg-zinc-900 border border-white/25 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-purple-500/10 rounded-xl px-4 py-3 inline-flex items-center gap-3 border border-purple-500/20">
                            <Target size={20} className="text-purple-400" />
                            <h2 className="text-base font-bold text-purple-300 uppercase tracking-wider">My Goals ({goals.length})</h2>
                        </div>
                        <button
                            onClick={() => navigate('/insights/goals')}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
                        >
                            View All <ChevronRight size={14} />
                        </button>
                    </div>
                    {goals.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-white/25 rounded-xl p-6 text-center">
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
                                            isComplete ? "border-emerald-500/50 cursor-pointer hover:bg-zinc-900" : "border-white/25"
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
