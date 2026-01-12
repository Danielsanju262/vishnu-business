import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeTables } from './useRealtimeSync';
import type { InsightItem, InsightSource, InsightSeverity } from '../types/insightTypes';
import { format, subDays, subWeeks, addDays } from 'date-fns';
import { insightsEvents, INSIGHTS_EVENTS } from '../lib/insightsEvents';

interface UseInsightsGeneratorReturn {
    tasks: InsightItem[];
    insights: InsightItem[];
    isLoading: boolean;
    error: string | null;
    refreshInsights: () => Promise<void>;
    markAsDone: (id: string) => Promise<void>;
    snoozeItem: (id: string, hours: number) => Promise<void>;
    clearItem: (id: string) => Promise<void>;
}

export function useInsightsGenerator(): UseInsightsGeneratorReturn {
    // Initialize from localStorage if available
    const [tasks, setTasks] = useState<InsightItem[]>(() => {
        try {
            const saved = localStorage.getItem('vishnu_insights_tasks');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [insights, setInsights] = useState<InsightItem[]>(() => {
        try {
            const saved = localStorage.getItem('vishnu_insights_data');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [isLoading, setIsLoading] = useState(tasks.length === 0);
    const [error, setError] = useState<string | null>(null);

    // Helper to create an insight item
    const createInsightItem = (
        type: 'task' | 'insight',
        title: string,
        description: string,
        severity: InsightSeverity,
        source: InsightSource,
        metadata?: Record<string, any>
    ): InsightItem => ({
        id: `${type}-${source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        title,
        description,
        severity,
        source,
        generated_date: format(new Date(), 'yyyy-MM-dd'),
        metadata,
        created_at: new Date().toISOString(),
    });

    // Generate tasks based on current data
    const generateTasks = useCallback(async (): Promise<InsightItem[]> => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const generatedTasks: InsightItem[] = [];

        try {
            // 1. Check for today's sales
            const { data: todaySales, error: salesError } = await supabase
                .from('transactions')
                .select('id')
                .eq('date', todayStr)
                .is('deleted_at', null)
                .limit(1);

            if (!salesError && (!todaySales || todaySales.length === 0)) {
                generatedTasks.push(createInsightItem(
                    'task',
                    "You haven't added today's sales",
                    "Record your sales to keep track of your business performance",
                    'warning',
                    'sales'
                ));
            }

            // 2. Check for today's expenses
            const { data: todayExpenses, error: expensesError } = await supabase
                .from('expenses')
                .select('id')
                .eq('date', todayStr)
                .is('deleted_at', null)
                .limit(1);

            if (!expensesError && (!todayExpenses || todayExpenses.length === 0)) {
                generatedTasks.push(createInsightItem(
                    'task',
                    "You haven't recorded today's expenses",
                    "Log your expenses for accurate profit tracking",
                    'info',
                    'expenses'
                ));
            }

            // 3. Check for payments (Yesterday, Today, Tomorrow)
            const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
            const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

            const { data: recentReminders, error: remindersError } = await supabase
                .from('payment_reminders')
                .select('id, amount, customer_id, due_date, customers(name)')
                .eq('status', 'pending')
                .gte('due_date', yesterdayStr)
                .lte('due_date', tomorrowStr);

            if (!remindersError && recentReminders && recentReminders.length > 0) {
                recentReminders.forEach((reminder: any) => {
                    const customerName = reminder.customers?.name || 'Customer';
                    const amount = Number(reminder.amount).toLocaleString();
                    let title = '';
                    let description = '';

                    if (reminder.due_date === todayStr) {
                        title = `Did you collect ₹${amount} from ${customerName} today?`;
                        description = 'Payment due today';
                    } else if (reminder.due_date < todayStr) {
                        title = `Did you collect overdue ₹${amount} from ${customerName}?`;
                        description = 'Was due yesterday';
                    } else {
                        title = `Upcoming: Collect ₹${amount} from ${customerName}`;
                        description = 'Due tomorrow';
                    }

                    generatedTasks.push(createInsightItem(
                        'task',
                        title,
                        description,
                        'warning',
                        'payments',
                        { reminderId: reminder.id, customerId: reminder.customer_id, amount: reminder.amount }
                    ));
                });
            }

            // 4. Check for Accounts Payable (Yesterday, Today, Tomorrow)
            const { data: recentPayables, error: payablesError } = await supabase
                .from('accounts_payable')
                .select('id, amount, supplier_id, due_date, suppliers(name)')
                .eq('status', 'pending')
                .gte('due_date', yesterdayStr)
                .lte('due_date', tomorrowStr);

            if (!payablesError && recentPayables && recentPayables.length > 0) {
                recentPayables.forEach((payable: any) => {
                    const supplierName = payable.suppliers?.name || 'Supplier';
                    const amount = Number(payable.amount).toLocaleString();
                    let title = '';
                    let description = '';

                    if (payable.due_date === todayStr) {
                        title = `Did you do the payment of ₹${amount} to ${supplierName}?`;
                        description = 'Payment due today';
                    } else if (payable.due_date < todayStr) {
                        title = `Did you pay overdue ₹${amount} to ${supplierName}?`;
                        description = 'Was due yesterday';
                    } else {
                        title = `Upcoming: Pay ₹${amount} to ${supplierName}`;
                        description = 'Due tomorrow';
                    }

                    generatedTasks.push(createInsightItem(
                        'task',
                        title,
                        description,
                        'warning',
                        'payables',
                        { payableId: payable.id, supplierId: payable.supplier_id, amount: payable.amount }
                    ));
                });
            }

        } catch (err) {
            console.error('[Insights] Error generating tasks:', err);
        }

        return generatedTasks;
    }, []);

    // Generate insights based on historical data
    const generateInsights = useCallback(async (): Promise<InsightItem[]> => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lastWeekSameDay = format(subWeeks(new Date(), 1), 'yyyy-MM-dd');
        const generatedInsights: InsightItem[] = [];

        try {
            // 1. Sales comparison: Today vs same day last week
            const { data: todaySalesData } = await supabase
                .from('transactions')
                .select('sell_price, quantity')
                .eq('date', todayStr)
                .is('deleted_at', null);

            const { data: lastWeekData } = await supabase
                .from('transactions')
                .select('sell_price, quantity')
                .eq('date', lastWeekSameDay)
                .is('deleted_at', null);

            const todayRevenue = (todaySalesData || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
            const lastWeekRevenue = (lastWeekData || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);

            if (todayRevenue > 0 && lastWeekRevenue > 0) {
                const percentChange = ((todayRevenue - lastWeekRevenue) / lastWeekRevenue * 100).toFixed(0);
                const isUp = todayRevenue > lastWeekRevenue;
                generatedInsights.push(createInsightItem(
                    'insight',
                    isUp
                        ? `Today's sales are ${percentChange}% higher than last week`
                        : `Today's sales are ${Math.abs(Number(percentChange))}% lower than last week`,
                    `Today: ₹${todayRevenue.toLocaleString()} vs Last Week: ₹${lastWeekRevenue.toLocaleString()}`,
                    isUp ? 'success' : 'warning',
                    'sales',
                    { todayRevenue, lastWeekRevenue, percentChange }
                ));
            }

            // 2. Expense spike detection (today vs 30-day average)
            const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
            const { data: recentExpenses } = await supabase
                .from('expenses')
                .select('amount, date')
                .gte('date', thirtyDaysAgo)
                .is('deleted_at', null);

            if (recentExpenses && recentExpenses.length > 0) {
                const todayExpenseTotal = recentExpenses
                    .filter(e => e.date === todayStr)
                    .reduce((sum, e) => sum + Number(e.amount), 0);

                const otherDays = recentExpenses.filter(e => e.date !== todayStr);
                const avgExpense = otherDays.length > 0
                    ? otherDays.reduce((sum, e) => sum + Number(e.amount), 0) / Math.min(otherDays.length, 30)
                    : 0;

                if (todayExpenseTotal > avgExpense * 1.5 && avgExpense > 0) {
                    generatedInsights.push(createInsightItem(
                        'insight',
                        'Expenses today are unusually high',
                        `Today: ₹${todayExpenseTotal.toLocaleString()} vs Avg: ₹${avgExpense.toFixed(0)}`,
                        'warning',
                        'expenses',
                        { todayExpenseTotal, avgExpense }
                    ));
                }
            }

            // 3. Find customers with repeated late payments (3+ in last 30 days)
            const { data: allReminders } = await supabase
                .from('payment_reminders')
                .select('customer_id, due_date, status, recorded_at')
                .eq('status', 'paid')
                .gte('recorded_at', thirtyDaysAgo);

            if (allReminders && allReminders.length > 0) {
                // Count late payments per customer
                const latePaymentsByCustomer: Record<string, number> = {};
                allReminders.forEach(r => {
                    const recordedDate = r.recorded_at ? new Date(r.recorded_at) : null;
                    const dueDate = new Date(r.due_date);
                    if (recordedDate && recordedDate > dueDate) {
                        latePaymentsByCustomer[r.customer_id] = (latePaymentsByCustomer[r.customer_id] || 0) + 1;
                    }
                });

                // Find customers with 3+ late payments
                const latePayerIds = Object.entries(latePaymentsByCustomer)
                    .filter(([_, count]) => count >= 3)
                    .map(([id]) => id);

                if (latePayerIds.length > 0) {
                    // Get customer names
                    const { data: customers } = await supabase
                        .from('customers')
                        .select('id, name')
                        .in('id', latePayerIds);

                    if (customers && customers.length > 0) {
                        customers.forEach(customer => {
                            const lateCount = latePaymentsByCustomer[customer.id];
                            generatedInsights.push(createInsightItem(
                                'insight',
                                `${customer.name} delayed payment ${lateCount} times this month`,
                                'Consider following up more frequently with this customer',
                                'warning',
                                'payments',
                                { customerId: customer.id, lateCount }
                            ));
                        });
                    }
                }
            }

            // 4. Top customers by revenue (this month)
            const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
            const { data: monthTransactions } = await supabase
                .from('transactions')
                .select('customer_id, sell_price, quantity')
                .gte('date', startOfMonth)
                .is('deleted_at', null);

            if (monthTransactions && monthTransactions.length > 5) {
                const revenueByCustomer: Record<string, number> = {};
                let totalRevenue = 0;

                monthTransactions.forEach(t => {
                    if (t.customer_id) {
                        const revenue = t.sell_price * t.quantity;
                        revenueByCustomer[t.customer_id] = (revenueByCustomer[t.customer_id] || 0) + revenue;
                        totalRevenue += revenue;
                    }
                });

                // Get top 3 customers
                const sortedCustomers = Object.entries(revenueByCustomer)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);

                if (sortedCustomers.length >= 3 && totalRevenue > 0) {
                    const topThreeRevenue = sortedCustomers.reduce((sum, [_, revenue]) => sum + revenue, 0);
                    const percentage = ((topThreeRevenue / totalRevenue) * 100).toFixed(0);

                    if (Number(percentage) > 50) {
                        generatedInsights.push(createInsightItem(
                            'insight',
                            `Top 3 customers generate ${percentage}% of revenue`,
                            'Consider strategies to diversify your customer base',
                            'info',
                            'sales',
                            { percentage, topThreeRevenue, totalRevenue }
                        ));
                    }
                }
            }

        } catch (err) {
            console.error('[Insights] Error generating insights:', err);
        }

        return generatedInsights;
    }, []);

    // Load persisted items and merge with generated
    const refreshInsights = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) setIsLoading(true);
        setError(null);

        try {
            const now = new Date().toISOString();

            // Generate fresh tasks for today
            const generatedTasks = await generateTasks();

            // Generate insights
            const generatedInsights = await generateInsights();

            // Load persisted insights from Supabase (non-cleared, non-snoozed or snooze expired)
            const { data: persistedItems, error: dbError } = await supabase
                .from('insight_items')
                .select('*')
                .is('cleared_at', null)
                .or(`snoozed_until.is.null,snoozed_until.lt.${now}`);

            if (dbError) {
                console.warn('[Insights] Could not load persisted items:', dbError);
            }

            // Filter persisted items
            const persistedInsights: InsightItem[] = (persistedItems || [])
                .filter((item: InsightItem) => item.type === 'insight')
                .filter((item: InsightItem) => !item.snoozed_until || new Date(item.snoozed_until) < new Date());

            // Merge generated insights with persisted (avoid duplicates by title/source)
            const mergedInsights = [...persistedInsights];
            generatedInsights.forEach(gi => {
                const exists = mergedInsights.some(pi =>
                    pi.title === gi.title && pi.source === gi.source
                );
                if (!exists) {
                    mergedInsights.push(gi);
                }
            });

            setTasks(generatedTasks);
            setInsights(mergedInsights);

            // Save to localStorage
            localStorage.setItem('vishnu_insights_tasks', JSON.stringify(generatedTasks));
            localStorage.setItem('vishnu_insights_data', JSON.stringify(mergedInsights));

        } catch (err) {
            console.error('[Insights] Error refreshing:', err);
            setError('Failed to load insights. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [generateTasks, generateInsights]);

    // Mark a task as done (just remove from local state for tasks)
    const markAsDone = useCallback(async (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        // We could also update localStorage here, but next refresh will sync it.
    }, []);

    // Snooze an item
    const snoozeItem = useCallback(async (id: string, hours: number) => {
        const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        // Check if it's a task (local) or insight
        const isTask = tasks.find(t => t.id === id);

        if (isTask) {
            // For tasks, just remove from local state (they'll regenerate tomorrow)
            setTasks(prev => prev.filter(t => t.id !== id));
        } else {
            // For insights, persist the snooze
            setInsights(prev => prev.filter(i => i.id !== id));

            // Try to update in DB if it exists
            await supabase
                .from('insight_items')
                .update({ snoozed_until: snoozeUntil })
                .eq('id', id);
        }
    }, [tasks]);

    // Clear an insight permanently
    const clearItem = useCallback(async (id: string) => {
        setInsights(prev => prev.filter(i => i.id !== id));

        // Mark as cleared in DB
        await supabase
            .from('insight_items')
            .update({ cleared_at: new Date().toISOString() })
            .eq('id', id);
    }, []);

    // Initial load
    useEffect(() => {
        // If we have data in cache, we load silently (background update)
        // If not, we show loading.
        const hasData = tasks.length > 0;
        refreshInsights({ silent: hasData });
    }, [refreshInsights]);

    // Listen for data change events (for auto-completing tasks)
    useEffect(() => {
        const unsubscribe = insightsEvents.on(INSIGHTS_EVENTS.DATA_CHANGED, () => {
            console.log('[Insights] Data changed, refreshing tasks...');
            refreshInsights({ silent: true });
        });

        return unsubscribe;
    }, [refreshInsights]);

    // Real-time updates - always silent
    useRealtimeTables(['transactions', 'expenses', 'payment_reminders', 'accounts_payable'], () => refreshInsights({ silent: true }));

    return {
        tasks,
        insights,
        isLoading,
        error,
        refreshInsights: () => refreshInsights({ silent: false }), // Manual refresh shows loading
        markAsDone,
        snoozeItem,
        clearItem,
    };
}
