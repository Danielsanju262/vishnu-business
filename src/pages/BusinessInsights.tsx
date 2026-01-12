import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Users, Wallet, ShoppingBag, Clock, BarChart3, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, subMonths } from "date-fns";
import { Link } from "react-router-dom";
import { Modal } from "../components/ui/Modal";
import { cn } from "../lib/utils";
import { useRealtimeTables } from "../hooks/useRealtimeSync";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";
import { DailyRevenueChart } from "../components/DailyRevenueChart";

type DateRangeType = "today" | "yesterday" | "week" | "month" | "year" | "custom";
type ChartAggregationType = "day" | "week" | "month";
type TabType = "summary" | "sales" | "customers" | "cashflow";

interface InsightData {
    transactions: any[];
    expenses: any[];
    customers: any[];
    paymentReminders: any[];
    accountsPayable: any[];
    previousPeriodTransactions: any[];

}

export default function BusinessInsights() {
    // Filters
    const [rangeType, setRangeType] = useState<DateRangeType>("month");
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
    const [selectedChartDay, setSelectedChartDay] = useState<string | null>(null);
    const [chartAggregation, setChartAggregation] = useState<ChartAggregationType>('day');
    const chartRef = useRef<HTMLDivElement>(null);
    useDropdownClose(selectedChartDay !== null, () => setSelectedChartDay(null), chartRef);
    const [showFilters, setShowFilters] = useHistorySyncedState(false, 'businessInsightsFilter');
    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const filterPanelRef = useRef<HTMLDivElement>(null);
    useDropdownClose(showFilters, () => setShowFilters(false), filterButtonRef, [filterPanelRef as React.RefObject<HTMLElement>]);
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // View State  
    const [activeTab, setActiveTab] = useState<TabType>('summary');
    const [isReceivablesOpen, setIsReceivablesOpen] = useState(true);

    // Data State
    const [data, setData] = useState<InsightData>({
        transactions: [],
        expenses: [],
        customers: [],
        paymentReminders: [],
        accountsPayable: [],
        previousPeriodTransactions: [],
    });
    const [historicalData, setHistoricalData] = useState<{
        transactions: any[];
        expenses: any[];
    }>({ transactions: [], expenses: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);

    const getDateFilter = useCallback(() => {
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');

        if (rangeType === 'today') return { start: todayStr, end: todayStr };
        if (rangeType === 'yesterday') {
            const yest = format(subDays(today, 1), 'yyyy-MM-dd');
            return { start: yest, end: yest };
        }
        if (rangeType === 'week') return { start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
        if (rangeType === 'month') return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
        if (rangeType === 'year') return { start: format(startOfYear(today), 'yyyy-MM-dd'), end: format(endOfYear(today), 'yyyy-MM-dd') };
        return { start: startDate, end: endDate };
    }, [rangeType, startDate, endDate]);

    const getPreviousPeriodDates = useCallback(() => {
        const { start, end } = getDateFilter();
        const startD = new Date(start);
        const endD = new Date(end);
        const daysDiff = Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const prevEnd = subDays(startD, 1);
        const prevStart = subDays(prevEnd, daysDiff - 1);

        return {
            start: format(prevStart, 'yyyy-MM-dd'),
            end: format(prevEnd, 'yyyy-MM-dd')
        };
    }, [getDateFilter]);

    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const { start, end } = getDateFilter();
        const prevPeriod = getPreviousPeriodDates();

        try {
            const [transactionsRes, expensesRes, customersRes, remindersRes, payablesRes, prevTransactionsRes] = await Promise.all([
                supabase.from('transactions').select('*, customers(name, id), products(name, unit, category)').is('deleted_at', null).gte('date', start).lte('date', end).order('date', { ascending: false }),
                supabase.from('expenses').select('*').is('deleted_at', null).gte('date', start).lte('date', end),
                supabase.from('customers').select('*'),
                supabase.from('payment_reminders').select('*, customers(name)').eq('status', 'pending'),
                supabase.from('accounts_payable').select('*, suppliers(name)').eq('status', 'pending'),
                supabase.from('transactions').select('*, customers(name, id), products(name, unit, category)').is('deleted_at', null).gte('date', prevPeriod.start).lte('date', prevPeriod.end),
            ]);

            // Check for errors in results
            const errors = [transactionsRes, expensesRes, customersRes, remindersRes, payablesRes, prevTransactionsRes].filter(r => r.error);
            if (errors.length > 0) throw errors[0].error;

            setData({
                transactions: transactionsRes.data || [],
                expenses: expensesRes.data || [],
                customers: customersRes.data || [],
                paymentReminders: remindersRes.data || [],
                accountsPayable: payablesRes.data || [],
                previousPeriodTransactions: prevTransactionsRes.data || [],
            });
        } catch (error) {
            console.error('[BusinessInsights] Error fetching data:', error);
            setError((error as any)?.message || "Failed to load data");
        } finally {
            setIsLoading(false);
        }
    }, [getDateFilter, getPreviousPeriodDates]);

    useRealtimeTables(['transactions', 'expenses', 'payment_reminders', 'accounts_payable'], fetchData, [rangeType, startDate, endDate]);

    // Fetch Historical Data when Week/Month view is selected
    useEffect(() => {
        if ((chartAggregation === 'week' || chartAggregation === 'month') && historicalData.transactions.length === 0 && !isHistoricalLoading) {
            const fetchHistorical = async () => {
                setIsHistoricalLoading(true);
                try {
                    // Fetch last 12 months of data (covers both 31 weeks and 12 months requirements)
                    const end = format(new Date(), 'yyyy-MM-dd');
                    const start = format(subMonths(new Date(), 12), 'yyyy-MM-dd');

                    const [transactionsRes, expensesRes] = await Promise.all([
                        supabase.from('transactions').select('date, quantity, sell_price, buy_price, products(name)').is('deleted_at', null).gte('date', start).lte('date', end),
                        supabase.from('expenses').select('date, amount, is_ghee_ingredient').is('deleted_at', null).gte('date', start).lte('date', end)
                    ]);

                    if (transactionsRes.error) throw transactionsRes.error;
                    if (expensesRes.error) throw expensesRes.error;

                    setHistoricalData({
                        transactions: transactionsRes.data || [],
                        expenses: expensesRes.data || []
                    });
                } catch (err) {
                    console.error("Failed to fetch historical data", err);
                } finally {
                    setIsHistoricalLoading(false);
                }
            };
            fetchHistorical();
        }
    }, [chartAggregation, historicalData.transactions.length, isHistoricalLoading]);

    // === CALCULATIONS ===

    // Summary Stats
    const summaryStats = useMemo(() => {
        const totalRevenue = data.transactions.reduce((acc, t) => acc + (t.quantity * t.sell_price), 0);
        const totalCOGS = data.transactions.reduce((acc, t) => acc + (t.quantity * t.buy_price), 0);
        const ingredientExpenses = data.expenses.filter(e => e.is_ghee_ingredient).reduce((acc, e) => acc + e.amount, 0);
        const otherExpenses = data.expenses.filter(e => !e.is_ghee_ingredient).reduce((acc, e) => acc + e.amount, 0);
        const totalGoodsCost = totalCOGS + ingredientExpenses;
        const grossProfit = totalRevenue - totalGoodsCost;
        const netProfit = grossProfit - otherExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const transactionCount = data.transactions.length;

        // Unique customers count
        const uniqueCustomers = new Set(data.transactions.map(t => t.customer_id).filter(Boolean)).size;

        // Date range duration in days
        const { start, end } = getDateFilter();
        const startDt = new Date(start);
        const endDt = new Date(end);


        // Calculate effective days for averages (sales/profit per day)
        // If the selected period includes future dates (e.g. "This Month"), cap the divisor at today
        // so averages are based on elapsed days only.
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let effectiveEndDt = endDt;
        if (effectiveEndDt > today) {
            effectiveEndDt = today;
        }

        // Ensure we don't go backwards if start date is also in future (unlikely but safe to handle)
        // and ensure at least 1 day.
        const effectiveDaysInPeriod = Math.max(Math.floor((effectiveEndDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1);

        // Average Daily Sales (Total Sales / Elapsed Days)
        const avgDailySales = totalRevenue / effectiveDaysInPeriod;

        // Average Daily Profit (Net Profit / Elapsed Days)
        const avgDailyProfit = netProfit / effectiveDaysInPeriod;

        // Previous period comparison
        const prevRevenue = data.previousPeriodTransactions.reduce((acc, t) => acc + (t.quantity * t.sell_price), 0);
        const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Best selling day with profit
        const salesByDay: Record<string, { revenue: number; cost: number }> = {};
        data.transactions.forEach(t => {
            const day = t.date;
            if (!salesByDay[day]) {
                salesByDay[day] = { revenue: 0, cost: 0 };
            }
            salesByDay[day].revenue += (t.quantity * t.sell_price);
            salesByDay[day].cost += (t.quantity * t.buy_price);
        });

        // Add ingredient expenses by day
        data.expenses.filter(e => e.is_ghee_ingredient).forEach(e => {
            const day = e.date;
            if (salesByDay[day]) {
                salesByDay[day].cost += e.amount;
            }
        });

        const bestDayEntry = Object.entries(salesByDay).sort((a, b) => b[1].revenue - a[1].revenue)[0];
        const bestDay = bestDayEntry ? {
            date: bestDayEntry[0],
            revenue: bestDayEntry[1].revenue,
            profit: bestDayEntry[1].revenue - bestDayEntry[1].cost
        } : null;

        return {
            totalRevenue,
            totalGoodsCost,
            otherExpenses,
            grossProfit,
            netProfit,
            profitMargin,
            transactionCount,
            avgDailySales,
            uniqueCustomers,
            avgDailyProfit,
            revenueChange,
            prevRevenue,
            bestDay,
        };
    }, [data, getDateFilter]);

    // Chart Series Data
    const chartSeries = useMemo(() => {
        const chartData: { date: string; revenue: number; profit: number; label: string; axisLabel?: string }[] = [];
        let canShowChart = false;

        // Determine source data and range based on aggregation
        // Daily: Uses filtered data (user selected range)
        // Weekly/Monthly: Uses historical data (last ~12 months fixed)
        let sourceTransactions = data.transactions;
        let sourceExpenses = data.expenses;
        let start: Date;
        let end: Date;

        if (chartAggregation === 'day') {
            const filter = getDateFilter();
            start = new Date(filter.start);
            end = new Date(filter.end);
        } else {
            // For Weekly/Monthly, we generally want the last X periods ending today
            // But we should use historicalData preferably if available, otherwise fallback to data (if it covers it, which implies large range selected)
            // However, request says "other than that [daily], it should show me the data for last 31 weeks and 12 months" so we force this range.
            sourceTransactions = historicalData.transactions.length > 0 ? historicalData.transactions : data.transactions;
            sourceExpenses = historicalData.expenses.length > 0 ? historicalData.expenses : data.expenses;
            end = new Date();
            start = subMonths(end, 12); // Ensuring we have coverage for the requested logic
        }

        if (chartAggregation === 'day') {
            const daysDiff = Math.max(Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1);
            if (daysDiff <= 32) {
                // Generate all days
                const days = eachDayOfInterval({ start, end });

                // Pre-process sales for performance
                const salesByDay: Record<string, { revenue: number; cost: number }> = {};
                sourceTransactions.forEach((t: any) => {
                    const d = t.date;
                    if (!salesByDay[d]) salesByDay[d] = { revenue: 0, cost: 0 };
                    salesByDay[d].revenue += (t.quantity * t.sell_price);
                    salesByDay[d].cost += (t.quantity * t.buy_price);
                });
                sourceExpenses.filter((e: any) => e.is_ghee_ingredient).forEach((e: any) => {
                    const d = e.date;
                    if (salesByDay[d]) salesByDay[d].cost += e.amount;
                });

                days.forEach(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayData = salesByDay[dateStr];
                    chartData.push({
                        date: dateStr,
                        label: format(day, 'd MMM'),
                        revenue: dayData ? dayData.revenue : 0,
                        profit: dayData ? (dayData.revenue - dayData.cost) : 0
                    });
                });
                canShowChart = true;
            }
        } else if (chartAggregation === 'week') {
            // Last 31 weeks
            // Start from 31 weeks ago to now
            // We'll iterate BACKWARDS from end week to ensure we capture the "last 31 weeks" correctly relative to today?
            // Or just interval. Let's do interval for simplicity, but construct start date carefully.
            // 31 weeks approx 7 months, so our 12 month historical fetch covers it.
            // Let's explicitly set start to 31 weeks ago.
            const weekStartPoint = subDays(end, 31 * 7);
            const validStart = weekStartPoint; // simplified

            const weeks = eachWeekOfInterval({ start: validStart, end }, { weekStartsOn: 1 });
            // Take only last 31 if somehow we got more
            const weeksToShow = weeks.slice(-31);

            weeksToShow.forEach(weekStart => {
                const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                const weekKey = format(weekStart, 'yyyy-MM-dd');

                // Filter source for this week
                const weekRevenue = sourceTransactions
                    .filter((t: any) => {
                        const d = new Date(t.date);
                        return d >= weekStart && d <= weekEnd;
                    })
                    .reduce((acc: number, t: any) => acc + (t.quantity * t.sell_price), 0);

                const weekCost = sourceTransactions
                    .filter((t: any) => {
                        const d = new Date(t.date);
                        return d >= weekStart && d <= weekEnd;
                    })
                    .reduce((acc: number, t: any) => acc + (t.quantity * t.buy_price), 0)
                    + sourceExpenses
                        .filter((e: any) => {
                            const d = new Date(e.date);
                            return e.is_ghee_ingredient && d >= weekStart && d <= weekEnd;
                        })
                        .reduce((acc: number, e: any) => acc + e.amount, 0);

                chartData.push({
                    date: weekKey,
                    label: `Week of ${format(weekStart, 'd MMM')}`,
                    axisLabel: format(weekStart, 'd MMM'),
                    revenue: weekRevenue,
                    profit: weekRevenue - weekCost
                });
            });
            canShowChart = true;
        } else if (chartAggregation === 'month') {
            // Last 12 months
            const validStart = subMonths(end, 11); // 11 months back + current month = 12 months
            const months = eachMonthOfInterval({ start: validStart, end });

            months.forEach(monthStart => {
                const monthEnd = endOfMonth(monthStart);
                const monthKey = format(monthStart, 'yyyy-MM-dd');

                const monthRevenue = sourceTransactions
                    .filter((t: any) => {
                        const d = new Date(t.date);
                        return d >= monthStart && d <= monthEnd;
                    })
                    .reduce((acc: number, t: any) => acc + (t.quantity * t.sell_price), 0);

                const monthCost = sourceTransactions
                    .filter((t: any) => {
                        const d = new Date(t.date);
                        return d >= monthStart && d <= monthEnd;
                    })
                    .reduce((acc: number, t: any) => acc + (t.quantity * t.buy_price), 0)
                    + sourceExpenses
                        .filter((e: any) => {
                            const d = new Date(e.date);
                            return e.is_ghee_ingredient && d >= monthStart && d <= monthEnd;
                        })
                        .reduce((acc: number, e: any) => acc + e.amount, 0);

                chartData.push({
                    date: monthKey,
                    label: format(monthStart, 'MMMM yyyy'),
                    axisLabel: format(monthStart, 'MMM'), // Jan, Feb...
                    revenue: monthRevenue,
                    profit: monthRevenue - monthCost
                });
            });
            canShowChart = true;
        }

        return { data: chartData, canShowChart };
    }, [data, historicalData, chartAggregation, getDateFilter]);

    // Sales Insights
    const salesInsights = useMemo(() => {
        // Top products by revenue
        const productRevenue: Record<string, { name: string; revenue: number; quantity: number; unit: string }> = {};
        data.transactions.forEach(t => {
            const name = t.products?.name || 'Unknown';
            if (!productRevenue[name]) {
                productRevenue[name] = { name, revenue: 0, quantity: 0, unit: t.products?.unit || '' };
            }
            productRevenue[name].revenue += (t.quantity * t.sell_price);
            productRevenue[name].quantity += t.quantity;
        });
        const topProducts = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        // Sales by day of week
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const salesByDayOfWeek: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        data.transactions.forEach(t => {
            const dayNum = new Date(t.date).getDay();
            salesByDayOfWeek[dayNames[dayNum]] += (t.quantity * t.sell_price);
        });

        // Trend comparison
        const prevPeriodRevenue = data.previousPeriodTransactions.reduce((acc, t) => acc + (t.quantity * t.sell_price), 0);
        const currentRevenue = summaryStats.totalRevenue;
        const trendPercent = prevPeriodRevenue > 0 ? ((currentRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100 : 0;

        // Dynamic Insight
        let productInsight = "Start selling to see product insights.";
        if (topProducts.length > 0) {
            const topProd = topProducts[0];
            const contribution = currentRevenue > 0 ? (topProd.revenue / currentRevenue) * 100 : 0;
            productInsight = `**${topProd.name}** is your star performer, contributing **${Math.round(contribution)}%** of total sales.`;
        }

        return { topProducts, salesByDayOfWeek, trendPercent, prevPeriodRevenue, productInsight };
    }, [data, summaryStats]);

    // Customer Insights
    const customerInsights = useMemo(() => {
        // Revenue by customer (current period)
        const customerRevenue: Record<string, { name: string; id: string; revenue: number; count: number }> = {};
        data.transactions.forEach(t => {
            const name = t.customers?.name || 'Walk-in';
            const id = t.customers?.id || 'walk-in';
            if (!customerRevenue[id]) {
                customerRevenue[id] = { name, id, revenue: 0, count: 0 };
            }
            customerRevenue[id].revenue += (t.quantity * t.sell_price);
            customerRevenue[id].count += 1;
        });
        const topCustomers = Object.values(customerRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

        // Previous period stats for comparison
        const prevCustomerRevenue: Record<string, number> = {};
        data.previousPeriodTransactions.forEach(t => {
            const id = t.customers?.id || 'walk-in';
            prevCustomerRevenue[id] = (prevCustomerRevenue[id] || 0) + (t.quantity * t.sell_price);
        });

        const currentTotalRevenue = summaryStats.totalRevenue;
        const prevTotalRevenue = data.previousPeriodTransactions.reduce((acc, t) => acc + (t.quantity * t.sell_price), 0);
        const currentCustomerCount = Object.keys(customerRevenue).length;
        const prevCustomerCount = Object.keys(prevCustomerRevenue).length;
        const currentTransactionCount = data.transactions.length;
        const prevTransactionCount = data.previousPeriodTransactions.length;

        // Customer concentration
        const top3Revenue = topCustomers.slice(0, 3).reduce((acc, c) => acc + c.revenue, 0);
        const concentrationPercent = currentTotalRevenue > 0 ? (top3Revenue / currentTotalRevenue) * 100 : 0;

        // Late paying customers (from payment reminders)
        const { start } = getDateFilter();
        const overdueReminders = data.paymentReminders.filter(r => r.due_date < start);
        const uniqueLateCustomers = [...new Set(overdueReminders.map(r => r.customers?.name))].filter(Boolean);

        // Determine if comparison is valid (only for today, week, month - not custom)
        const canCompare = rangeType !== 'custom';
        const comparisonLabel = rangeType === 'today' ? 'vs Yesterday' :
            rangeType === 'yesterday' ? 'vs Day Before' :
                rangeType === 'week' ? 'vs Last Week' :
                    rangeType === 'month' ? 'vs Last Month' : '';

        return {
            topCustomers,
            concentrationPercent,
            lateCustomers: uniqueLateCustomers,
            overdueCount: overdueReminders.length,
            // Comparison data
            canCompare,
            comparisonLabel,
            currentTotalRevenue,
            prevTotalRevenue,
            revenueChange: prevTotalRevenue > 0 ? ((currentTotalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0,
            currentCustomerCount,
            prevCustomerCount,
            customerCountChange: prevCustomerCount > 0 ? ((currentCustomerCount - prevCustomerCount) / prevCustomerCount) * 100 : 0,
            currentTransactionCount,
            prevTransactionCount,
            transactionChange: prevTransactionCount > 0 ? ((currentTransactionCount - prevTransactionCount) / prevTransactionCount) * 100 : 0,
            // Insight
            customerInsight: topCustomers.length > 0
                ? `**${topCustomers[0].name}** contributes **${Math.round((topCustomers[0].revenue / currentTotalRevenue) * 100)}%** of total revenue.`
                : `Start making sales to see customer insights!`
        };
    }, [data, summaryStats, getDateFilter, rangeType]);

    // Cash Flow Insights
    const cashFlowInsights = useMemo(() => {
        // Outstanding receivables
        const totalReceivables = data.paymentReminders.reduce((acc, r) => acc + Number(r.amount), 0);
        const overdueReceivables = data.paymentReminders.filter(r => r.due_date < format(new Date(), 'yyyy-MM-dd')).reduce((acc, r) => acc + Number(r.amount), 0);

        // Outstanding payables
        const totalPayables = data.accountsPayable.reduce((acc, p) => acc + Number(p.amount), 0);
        const overduePayables = data.accountsPayable.filter(p => p.due_date < format(new Date(), 'yyyy-MM-dd')).reduce((acc, p) => acc + Number(p.amount), 0);

        // Customer-wise receivables breakdown (ALL TIME)
        const customerReceivables: Record<string, { name: string; amount: number; count: number }> = {};

        // Use paymentReminders data (which fetches all pending)
        data.paymentReminders.forEach((r: any) => {
            const name = r.customers?.name || 'Unknown';
            if (!customerReceivables[name]) {
                customerReceivables[name] = { name, amount: 0, count: 0 };
            }
            customerReceivables[name].amount += Number(r.amount);
            customerReceivables[name].count += 1;
        });

        const topReceivableCustomers = Object.values(customerReceivables).sort((a, b) => b.amount - a.amount);

        // Total costs
        const totalGoodsCost = data.transactions.reduce((acc, t) => acc + (t.quantity * t.buy_price), 0);
        const totalExpenses = data.expenses.reduce((acc, e) => acc + e.amount, 0);

        return {
            totalReceivables,
            overdueReceivables,
            totalPayables,
            overduePayables,
            topReceivableCustomers,
            totalGoodsCost,
            totalExpenses
        };
    }, [data]);

    const ranges = [
        { key: 'today', label: 'Today' },
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'year', label: 'This Year' },
        { key: 'custom', label: 'Custom Range' },
    ];

    const tabs = [
        { key: 'summary', label: 'Summary', icon: BarChart3, color: 'bg-purple-500' },
        { key: 'sales', label: 'Products', icon: ShoppingBag, color: 'bg-emerald-500' },
        { key: 'customers', label: 'Customers', icon: Users, color: 'bg-blue-500' },
        { key: 'cashflow', label: 'Cash Flow', icon: Wallet, color: 'bg-amber-500' },
    ];

    return (
        <div className="min-h-screen bg-background pb-6 w-full md:max-w-2xl md:mx-auto px-3 md:px-4">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-border shadow-sm">
                <div className="w-full px-3 md:px-4 py-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1">
                                    <ArrowLeft size={20} />
                                </button>
                                <div>
                                    {/* Breadcrumb - Hidden on mobile */}
                                    <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                        <Link to="/" className="hover:text-primary transition">Insights</Link>
                                        <span>/</span>
                                        <span className="text-primary font-semibold">Business</span>
                                    </div>
                                    <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">Business Insights</h1>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={fetchData}
                                    className="p-2.5 rounded-full bg-accent hover:bg-zinc-200 dark:hover:bg-zinc-700 transition active:scale-95 text-foreground"
                                    aria-label="Refresh data"
                                >
                                    <RefreshCw size={16} className={cn(isLoading && "animate-spin")} />
                                </button>
                                {/* Filter Trigger */}
                                <button
                                    ref={filterButtonRef}
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2.5 md:px-4 md:py-2.5 rounded-full text-xs md:text-sm font-bold border interactive transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 whitespace-nowrap",
                                        showFilters ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                                    )}
                                    aria-label="Toggle date filter"
                                >
                                    <Calendar size={16} />
                                    <span className="text-xs md:text-sm">
                                        {rangeType === 'custom'
                                            ? `${format(new Date(startDate), 'dd MMM')} - ${format(new Date(endDate), 'dd MMM')}`
                                            : ranges.find(r => r.key === rangeType)?.label
                                        }
                                    </span>
                                    <ChevronDown size={16} className={cn("transition-transform", showFilters && "rotate-180")} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Panel */}
                        {showFilters && (
                            <div ref={filterPanelRef} className="animate-in slide-in-from-top-2 space-y-3 p-1 relative z-50">
                                <div className="flex flex-wrap gap-2">
                                    {ranges.map(r => (
                                        <button
                                            key={r.key}
                                            onClick={() => { setRangeType(r.key as DateRangeType); if (r.key !== 'custom') setShowFilters(false); }}
                                            className={cn(
                                                "px-4 py-3 text-xs md:text-sm font-semibold rounded-full border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                                                rangeType === r.key
                                                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                                                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                                            )}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>

                                {rangeType === 'custom' && (
                                    <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3">
                                        <div className="flex flex-col md:flex-row gap-3">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block ml-1">Start Date</label>
                                                <input
                                                    id="bi-start-date"
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => {
                                                        const newStart = e.target.value;

                                                        setStartDate(newStart);
                                                        // Ensure end date is not before start date
                                                        if (endDate < newStart) {
                                                            setEndDate(newStart);
                                                        }
                                                        // Auto-open end date picker after a short delay
                                                        setTimeout(() => {
                                                            const endDateInput = document.getElementById('bi-end-date') as HTMLInputElement;
                                                            if (endDateInput) {
                                                                endDateInput.focus();
                                                                if ('showPicker' in endDateInput) {
                                                                    try {
                                                                        (endDateInput as any).showPicker();
                                                                    } catch (err) { }
                                                                } else {
                                                                    (endDateInput as any).click();
                                                                }
                                                            }
                                                        }, 200);
                                                    }}
                                                    className="w-full px-3 py-3 md:py-2 bg-accent rounded-lg border border-border/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none h-12 md:h-auto"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block ml-1">End Date</label>
                                                <input
                                                    id="bi-end-date"
                                                    key={startDate} // Force re-render for min attribute accuracy
                                                    type="date"
                                                    value={endDate}
                                                    min={startDate}
                                                    onChange={(e) => {
                                                        setEndDate(e.target.value);
                                                        // Auto-close after selection
                                                        setShowFilters(false);
                                                    }}
                                                    className="w-full px-3 py-3 md:py-2 bg-accent rounded-lg border border-border/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none h-12 md:h-auto"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex p-1 bg-muted/50 rounded-xl overflow-x-auto no-scrollbar">
                            {tabs.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key as TabType)}
                                        className={cn(
                                            "flex-1 min-w-[80px] py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 flex items-center justify-center gap-1.5",
                                            activeTab === tab.key ? `${tab.color} text-white shadow-md` : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Icon size={14} className="hidden sm:block" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-36 md:h-40" /> {/* Spacer for fixed header */}

            {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3 animate-in slide-in-from-top-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 flex-1">{error}</p>
                    <button onClick={fetchData} className="text-xs font-bold text-red-600 underline hover:text-red-700">Retry</button>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3 animate-pulse">
                    <div className="h-28 bg-muted rounded-2xl" />
                    <div className="h-36 bg-muted rounded-2xl" />
                    <div className="h-28 bg-muted rounded-2xl" />
                </div>
            ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* === SUMMARY TAB === */}
                    {activeTab === 'summary' && (
                        <div className="space-y-4">
                            {/* Best Day */}
                            {summaryStats.bestDay && (
                                <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                                <TrendingUp size={18} className="text-amber-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-foreground">Best Sales Day</p>
                                                <p className="text-xs text-muted-foreground">{format(new Date(summaryStats.bestDay.date), 'EEE, MMM d')}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-black text-emerald-500">₹{summaryStats.bestDay.revenue.toLocaleString()}</p>
                                            <p className="text-[10px] text-muted-foreground">(Profit: <span className={cn("font-bold", summaryStats.bestDay.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>₹{summaryStats.bestDay.profit.toLocaleString()}</span>)</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Key Metrics */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider mb-1">Total Revenue</p>
                                        <p className="text-2xl font-black">₹{summaryStats.totalRevenue.toLocaleString()}</p>
                                        {summaryStats.revenueChange !== 0 && (
                                            <div className={cn("flex items-center gap-1 mt-1 text-xs font-semibold", summaryStats.revenueChange > 0 ? "text-emerald-200" : "text-red-200")}>
                                                {summaryStats.revenueChange > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                                {Math.abs(summaryStats.revenueChange).toFixed(1)}% vs prev period
                                            </div>
                                        )}
                                    </div>
                                    <TrendingUp className="absolute right-[-10px] bottom-[-10px] text-emerald-600 opacity-30" size={60} />
                                </div>

                                <div className={cn("p-4 rounded-2xl text-white shadow-lg relative overflow-hidden", summaryStats.netProfit >= 0 ? "bg-blue-500" : "bg-rose-500")}>
                                    <div className="relative z-10">
                                        <p className="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
                                        <p className="text-2xl font-black">₹{Math.abs(summaryStats.netProfit).toLocaleString()}</p>
                                        <p className="text-xs font-semibold text-blue-200 mt-1">{summaryStats.profitMargin.toFixed(1)}% margin</p>
                                    </div>
                                    {summaryStats.netProfit >= 0 ? (
                                        <TrendingUp className="absolute right-[-10px] bottom-[-10px] text-blue-600 opacity-30" size={60} />
                                    ) : (
                                        <TrendingDown className="absolute right-[-10px] bottom-[-10px] text-rose-600 opacity-30" size={60} />
                                    )}
                                </div>
                            </div>





                            {/* Chart Controls & Visibility */}
                            <div className="flex bg-muted/30 p-1 rounded-xl w-max mx-auto mb-2 border border-border/50">
                                <button
                                    onClick={() => setChartAggregation('day')}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                                        chartAggregation === 'day' ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Daily
                                </button>
                                <button
                                    onClick={() => setChartAggregation('week')}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                                        chartAggregation === 'week' ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Weekly
                                </button>
                                <button
                                    onClick={() => setChartAggregation('month')}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                                        chartAggregation === 'month' ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Monthly
                                </button>
                            </div>

                            {/* Revenue Chart */}
                            {chartSeries.canShowChart && chartSeries.data.length > 0 && (
                                <div ref={chartRef} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <DailyRevenueChart
                                        chartData={chartSeries.data}
                                        selectedChartDay={selectedChartDay}
                                        setSelectedChartDay={setSelectedChartDay}
                                    />
                                </div>
                            )}

                            {!chartSeries.canShowChart && (
                                <div className="p-6 text-center border border-dashed border-border rounded-2xl bg-muted/20">
                                    <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm font-semibold text-muted-foreground">Chart not available for this range</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {chartAggregation === 'day' && "For daily view, select a range of 31 days or less."}
                                        {chartAggregation === 'week' && "For weekly view, select a range of 31 weeks or less."}
                                        {chartAggregation === 'month' && "For monthly view, select a range of 12 months or less."}
                                    </p>
                                    <div className="mt-3">
                                        <button
                                            onClick={() => {
                                                if (chartAggregation === 'day') setChartAggregation('week');
                                                else if (chartAggregation === 'week') setChartAggregation('month');
                                            }}
                                            className="text-xs font-bold text-primary hover:underline"
                                        >
                                            Switch to {chartAggregation === 'day' ? 'Weekly' : 'Monthly'} view
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Quick Stats - Readable Grid */}
                            <div className="bg-card rounded-2xl border border-border/60 p-3 shadow-sm">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 bg-muted/40 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-muted-foreground">Sales</span>
                                        <span className="text-3xl font-black text-foreground">{summaryStats.transactionCount}</span>
                                    </div>
                                    <div className="p-3 bg-muted/40 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-muted-foreground">Customers</span>
                                        <span className="text-3xl font-black text-foreground">{summaryStats.uniqueCustomers}</span>
                                    </div>
                                    <div className="p-3 bg-muted/40 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-muted-foreground">Avg Sale/Day</span>
                                        <span className="text-2xl font-black text-foreground">₹{summaryStats.avgDailySales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="p-3 bg-muted/40 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-muted-foreground">Avg Profit/Day</span>
                                        <span className={cn("text-2xl font-black", summaryStats.avgDailyProfit >= 0 ? "text-emerald-500" : "text-rose-500")}>₹{Math.abs(summaryStats.avgDailyProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="p-3 bg-rose-500/10 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-rose-400">Goods Cost</span>
                                        <span className="text-lg font-black text-rose-500">₹{summaryStats.totalGoodsCost.toLocaleString()}</span>
                                    </div>
                                    <div className="p-3 bg-rose-500/10 rounded-xl flex flex-col items-center justify-center text-center gap-1">
                                        <span className="text-xs font-semibold text-rose-400">Other Exp</span>
                                        <span className="text-lg font-black text-rose-500">₹{summaryStats.otherExpenses.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === SALES TAB === */}
                    {activeTab === 'sales' && (
                        <div className="space-y-4">
                            {/* Sales Insight Card */}
                            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20 p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Sales</p>
                                        <h3 className="text-2xl font-black text-emerald-500">₹{summaryStats.totalRevenue.toLocaleString()}</h3>
                                    </div>
                                    <div className="p-2 bg-emerald-500/20 rounded-full text-emerald-600">
                                        <ShoppingBag size={20} />
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-emerald-500/20 flex gap-2">
                                    <div className="mt-0.5 min-w-[16px]">💡</div>
                                    <p className="text-sm text-emerald-900/80 dark:text-emerald-100/80 leading-snug">
                                        <span dangerouslySetInnerHTML={{ __html: salesInsights.productInsight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                    </p>
                                </div>
                            </div>

                            {/* Top Products */}
                            <div className="bg-card rounded-2xl border border-border/60 p-4 shadow-sm">
                                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                    <ShoppingBag size={16} className="text-emerald-500" />
                                    Top Products
                                </h3>
                                <div className="space-y-2">
                                    {salesInsights.topProducts.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No products sold in this period</p>
                                    ) : (
                                        salesInsights.topProducts.map((product, idx) => (
                                            <div
                                                key={product.name}
                                                onClick={() => setSelectedProduct(product)}
                                                className="flex items-center justify-between p-3 bg-muted/30 rounded-xl cursor-pointer hover:bg-muted/50 active:bg-muted transition-all active:scale-[0.99] group border border-transparent hover:border-border/50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm", idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-zinc-400" : idx === 2 ? "bg-amber-700" : "bg-zinc-600")}>
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{product.name}</p>
                                                            <ChevronRight size={12} className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity -ml-1" />
                                                        </div>
                                                        <p className="text-[10px] font-medium text-muted-foreground">{product.quantity} {product.unit} sold</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-emerald-500">₹{product.revenue.toLocaleString()}</p>
                                                    <ChevronRight size={16} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Sales by Day (Removed as requested) */}
                        </div>
                    )}

                    {/* === CUSTOMERS TAB === */}
                    {activeTab === 'customers' && (
                        <div className="space-y-3">
                            {/* Customer Insight Card */}
                            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl border border-blue-500/20 p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Active Customers</p>
                                        <h3 className="text-2xl font-black text-blue-500">{customerInsights.currentCustomerCount}</h3>
                                    </div>
                                    <div className="p-2 bg-blue-500/20 rounded-full text-blue-600">
                                        <Users size={20} />
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-blue-500/20 flex gap-2">
                                    <div className="mt-0.5 min-w-[16px]">💡</div>
                                    <p className="text-sm text-blue-900/80 dark:text-blue-100/80 leading-snug">
                                        <span dangerouslySetInnerHTML={{ __html: customerInsights.customerInsight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                    </p>
                                </div>
                            </div>



                            {/* Top Customers */}
                            <div className="bg-card rounded-2xl border border-border/60 p-4 shadow-sm">
                                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                    <Users size={16} className="text-blue-500" />
                                    Top Customers
                                </h3>
                                <div className="space-y-2">
                                    {customerInsights.topCustomers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No customers in this period</p>
                                    ) : (
                                        customerInsights.topCustomers.map((customer, idx) => (
                                            <div
                                                key={customer.id}
                                                onClick={() => setSelectedCustomer(customer)}
                                                className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl cursor-pointer hover:bg-muted/50 active:bg-muted transition-all active:scale-[0.99] group border border-transparent hover:border-border/50"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white", idx === 0 ? "bg-blue-500" : idx === 1 ? "bg-blue-400" : idx === 2 ? "bg-blue-300" : "bg-zinc-500")}>
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{customer.name}</p>
                                                            <ChevronRight size={12} className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity -ml-1" />
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground">{customer.count} transactions</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-emerald-500">₹{customer.revenue.toLocaleString()}</p>
                                                    <ChevronRight size={16} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Late Paying Customers */}
                            {customerInsights.lateCustomers.length > 0 && (
                                <div className="bg-card rounded-2xl border border-border/60 p-4 shadow-sm">
                                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                        <Clock size={16} className="text-rose-500" />
                                        Overdue Payments
                                    </h3>
                                    <p className="text-xs text-muted-foreground mb-2">{customerInsights.overdueCount} pending reminders</p>
                                    <div className="flex flex-wrap gap-2">
                                        {customerInsights.lateCustomers.slice(0, 5).map(name => (
                                            <span key={name} className="px-2.5 py-1 bg-rose-500/10 text-rose-500 text-xs font-semibold rounded-full border border-rose-500/20">
                                                {name}
                                            </span>
                                        ))}
                                        {customerInsights.lateCustomers.length > 5 && (
                                            <span className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-semibold rounded-full">
                                                +{customerInsights.lateCustomers.length - 5} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* === CASH FLOW TAB === */}
                    {activeTab === 'cashflow' && (
                        <div className="space-y-4">
                            {/* Receivables & Payables Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ArrowUpRight size={16} className="text-emerald-500" />
                                        <p className="text-[10px] font-bold text-emerald-500 uppercase">To Collect</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-1">Total Receivables</p>
                                    <p className="text-xl font-black text-emerald-500">₹{cashFlowInsights.totalReceivables.toLocaleString()}</p>
                                    {cashFlowInsights.overdueReceivables > 0 && (
                                        <p className="text-[10px] font-bold text-rose-500 mt-1">₹{cashFlowInsights.overdueReceivables.toLocaleString()} overdue</p>
                                    )}
                                </div>

                                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ArrowDownRight size={16} className="text-rose-500" />
                                        <p className="text-[10px] font-bold text-rose-500 uppercase">To Pay</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-1">Total Payables</p>
                                    <p className="text-xl font-black text-rose-500">₹{cashFlowInsights.totalPayables.toLocaleString()}</p>
                                    {cashFlowInsights.overduePayables > 0 && (
                                        <p className="text-[10px] font-bold text-rose-500 mt-1">₹{cashFlowInsights.overduePayables.toLocaleString()} overdue</p>
                                    )}
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="grid grid-cols-2 gap-3">
                                <Link
                                    to="/payment-reminders"
                                    className="p-4 bg-card rounded-2xl border border-border/60 hover:border-emerald-500/50 transition-all group"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Clock size={16} className="text-emerald-500" />
                                        <p className="text-xs font-bold text-muted-foreground">Reminders</p>
                                    </div>
                                    <p className="text-lg font-black text-foreground group-hover:text-emerald-500 transition-colors">{data.paymentReminders.length}</p>
                                </Link>

                                <Link
                                    to="/accounts-payable"
                                    className="p-4 bg-card rounded-2xl border border-border/60 hover:border-rose-500/50 transition-all group"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Wallet size={16} className="text-rose-500" />
                                        <p className="text-xs font-bold text-muted-foreground">Payables</p>
                                    </div>
                                    <p className="text-lg font-black text-foreground group-hover:text-rose-500 transition-colors">{data.accountsPayable.length}</p>
                                </Link>
                            </div>

                            {/* Customer Wise Breakdown - ALL TIME */}
                            <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setIsReceivablesOpen(!isReceivablesOpen)}
                                    className="w-full flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/40 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Users size={16} className="text-amber-500" />
                                        <h3 className="text-sm font-bold text-foreground">Customer Wise Breakdown</h3>
                                    </div>
                                    <ChevronDown
                                        size={16}
                                        className={cn("text-muted-foreground transition-transform duration-200", isReceivablesOpen && "rotate-180")}
                                    />
                                </button>

                                {isReceivablesOpen && (
                                    <div className="p-4 pt-0 animate-in slide-in-from-top-2 duration-200">
                                        <div className="space-y-2 mt-2">
                                            {cashFlowInsights.topReceivableCustomers.length === 0 ? (
                                                <p className="text-sm text-muted-foreground text-center py-4">No pending receivables</p>
                                            ) : (
                                                cashFlowInsights.topReceivableCustomers.slice(0, 10).map((customer, idx) => (
                                                    <div key={customer.name} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-xl">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white", idx === 0 ? "bg-rose-500" : idx === 1 ? "bg-rose-400" : idx === 2 ? "bg-rose-300" : "bg-zinc-600")}>
                                                                {idx + 1}
                                                            </span>
                                                            <div>
                                                                <p className="text-sm font-semibold text-foreground">{customer.name}</p>
                                                                <p className="text-[10px] text-muted-foreground">{customer.count} pending payments</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-base font-black text-rose-500">₹{customer.amount.toLocaleString()}</p>
                                                    </div>
                                                ))
                                            )}
                                            {cashFlowInsights.topReceivableCustomers.length > 10 && (
                                                <p className="text-[10px] text-center text-muted-foreground mt-2">
                                                    + {cashFlowInsights.topReceivableCustomers.length - 10} more customers
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Product Details Modal - with Click Outside to Close */}
                </div>
            )}

            {/* Product Details Modal - with Click Outside to Close */}
            {/* Product Details Modal - with Click Outside to Close */}
            {/* Product Details Modal */}
            <Modal
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                className="bg-zinc-950 border-zinc-800 border max-w-lg p-0 overflow-hidden flex flex-col max-h-[85vh]"
            >
                {selectedProduct && (
                    <>
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                            <div>
                                <h3 className="font-bold text-lg text-white">{selectedProduct.name}</h3>
                                <p className="text-xs text-zinc-400">Customer Wise Breakdown ({rangeType})</p>
                            </div>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2 max-h-[400px]">
                            {data.transactions
                                .filter(t => (t.products?.name === selectedProduct.name))
                                .sort((a, b) => b.quantity - a.quantity)
                                .map((t, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800/50">
                                        <div>
                                            <p className="text-sm font-bold text-zinc-200">{t.customers?.name || 'Walk-in'}</p>
                                            <p className="text-[10px] text-zinc-500">{format(new Date(t.date), 'dd MMM yyyy')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-emerald-500">₹{(t.quantity * t.sell_price).toLocaleString()}</p>
                                            <p className="text-[10px] text-zinc-400">{t.quantity} {t.products?.unit}</p>
                                        </div>
                                    </div>
                                ))}
                            {data.transactions.filter(t => t.products?.name === selectedProduct.name).length === 0 && (
                                <p className="text-center text-zinc-500 py-4">No transactions found.</p>
                            )}
                        </div>
                        {/* Summary Footer */}
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                            <div className="flex justify-between items-center">
                                <p className="text-xs font-bold text-zinc-400 uppercase">Total Revenue</p>
                                <p className="text-lg font-black text-emerald-500">
                                    ₹{data.transactions
                                        .filter(t => t.products?.name === selectedProduct.name)
                                        .reduce((sum, t) => sum + (t.quantity * t.sell_price), 0)
                                        .toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </Modal>

            {/* Customer Details Modal */}
            <Modal
                isOpen={!!selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
                className="bg-zinc-950 border-zinc-800 border max-w-lg p-0 overflow-hidden flex flex-col max-h-[85vh]"
            >
                {selectedCustomer && (
                    <>
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                            <div>
                                <h3 className="font-bold text-lg text-white">{selectedCustomer.name}</h3>
                                <p className="text-xs text-zinc-400">Product Wise Breakdown ({rangeType})</p>
                            </div>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2 max-h-[400px]">
                            {(() => {
                                // Aggregate products for this customer
                                const productStats: Record<string, { name: string; quantity: number; revenue: number; unit: string }> = {};
                                data.transactions
                                    .filter(t => t.customer_id === selectedCustomer.id)
                                    .forEach(t => {
                                        const name = t.products?.name || 'Unknown';
                                        if (!productStats[name]) {
                                            productStats[name] = { name, quantity: 0, revenue: 0, unit: t.products?.unit || '' };
                                        }
                                        productStats[name].quantity += t.quantity;
                                        productStats[name].revenue += (t.quantity * t.sell_price);
                                    });

                                const sortedProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue);

                                if (sortedProducts.length === 0) {
                                    return <p className="text-center text-zinc-500 py-4">No purchases found.</p>;
                                }

                                return sortedProducts.map((prod, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800/50">
                                        <div>
                                            <p className="text-sm font-bold text-zinc-200">{prod.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded text-zinc-950 font-bold", i === 0 ? "bg-amber-500" : i === 1 ? "bg-zinc-400" : "bg-zinc-700 text-zinc-300")}>
                                                    #{i + 1}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-emerald-500">₹{prod.revenue.toLocaleString()}</p>
                                            <p className="text-[10px] text-zinc-400">{prod.quantity} {prod.unit}</p>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                        {/* Summary Footer */}
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                            <div className="flex justify-between items-center">
                                <p className="text-xs font-bold text-zinc-400 uppercase">Total Spent</p>
                                <p className="text-lg font-black text-emerald-500">
                                    ₹{selectedCustomer.revenue.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}
