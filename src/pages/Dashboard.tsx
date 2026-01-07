import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Plus, Minus, TrendingUp, Users, Package, FileText, ChevronRight, Edit3, Check, LogOut, Truck, Calendar, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { useRealtimeTables } from "../hooks/useRealtimeSync";
import { Modal } from "../components/ui/Modal";

export default function Dashboard() {
    const { lockApp } = useAuth();
    const [stats, setStats] = useState({
        revenue: 0,
        profit: 0,
    });

    const [userName, setUserName] = useState("Vishnu");
    const [isEditingName, setIsEditingName] = useState(false);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);

    // Date Filter State
    const [dateFilter, setDateFilter] = useState("today"); // 'today', 'yesterday', 'thisWeek', 'thisMonth', 'custom'
    const [customDateRange, setCustomDateRange] = useState({
        start: format(new Date(), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showCustomDateModal, setShowCustomDateModal] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const storedName = localStorage.getItem("dashboard_username");
        if (storedName) setUserName(storedName);

        // Click outside to close dropdown
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowFilterDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const calculateProfit = (transactions: any[], expenses: any[]) => {
        let revenue = 0;
        let costOfGoods = 0;
        let opEx = 0;

        // 1. Calculate Revenue & Product Costs (COGS)
        transactions.forEach(t => {
            revenue += (t.sell_price * t.quantity);
            costOfGoods += (t.buy_price * t.quantity);
        });

        // 2. Add Ingredient Expenses to COGS
        expenses.forEach(e => {
            if (e.is_ghee_ingredient) {
                costOfGoods += e.amount;
            } else {
                opEx += e.amount;
            }
        });

        const grossProfit = revenue - costOfGoods;
        const netProfit = grossProfit - opEx;

        return { revenue, netProfit };
    }

    const getDateRange = useCallback(() => {
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');

        switch (dateFilter) {
            case 'today':
                return { start: todayStr, end: todayStr };
            case 'yesterday':
                const yest = format(subDays(now, 1), 'yyyy-MM-dd');
                return { start: yest, end: yest };
            case 'thisWeek':
                return {
                    start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
                    end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
                };
            case 'thisMonth':
                return {
                    start: format(startOfMonth(now), 'yyyy-MM-dd'),
                    end: format(endOfMonth(now), 'yyyy-MM-dd')
                };
            case 'custom':
                return customDateRange;
            default:
                return { start: todayStr, end: todayStr };
        }
    }, [dateFilter, customDateRange]);

    const fetchStats = useCallback(async () => {
        try {
            setIsLoadingStats(true);
            setStatsError(null);

            const { start, end } = getDateRange();

            let tQuery = supabase.from('transactions').select('*').is('deleted_at', null);
            let eQuery = supabase.from('expenses').select('*').is('deleted_at', null);

            if (start === end) {
                tQuery = tQuery.eq('date', start);
                eQuery = eQuery.eq('date', start);
            } else {
                tQuery = tQuery.gte('date', start).lte('date', end);
                eQuery = eQuery.gte('date', start).lte('date', end);
            }

            const { data: transactions, error: tError } = await tQuery;
            const { data: expenses, error: eError } = await eQuery;

            if (tError || eError) {
                throw new Error('Failed to fetch data');
            }

            const { revenue, netProfit } = calculateProfit(transactions || [], expenses || []);

            setStats({
                revenue,
                profit: netProfit,
            });
        } catch (error) {
            console.error('Failed to fetch stats:', error);
            setStatsError('Failed to load statistics. Please try again.');
        } finally {
            setIsLoadingStats(false);
        }
    }, [getDateRange]);

    // Real-time sync for transactions and expenses
    useRealtimeTables(['transactions', 'expenses'], fetchStats, [fetchStats]);

    // Grayscale palette for dark mode icons
    const menuItems = [
        { title: "Customers", icon: Users, link: "/customers", color: "text-blue-600 dark:text-white", bg: "bg-blue-100 dark:bg-white/10" },
        { title: "Suppliers", icon: Truck, link: "/suppliers", color: "text-sky-600 dark:text-white", bg: "bg-sky-100 dark:bg-white/10" },
        { title: "Products", icon: Package, link: "/products", color: "text-purple-600 dark:text-white", bg: "bg-purple-100 dark:bg-white/10" },
        { title: "Reports", icon: FileText, link: "/reports", color: "text-amber-600 dark:text-white", bg: "bg-amber-100 dark:bg-white/10" },
    ];

    return (
        <div className="space-y-6 px-4 pt-6 pb-28 md:px-6 md:pt-8 md:pb-32 w-full md:max-w-lg md:mx-auto animate-in fade-in">
            {/* Header */}
            <div className="space-y-1.5">
                {/* Date at top */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.15em]">{format(new Date(), "EEEE, MMM d")}</p>

                {/* Welcome message with edit and logout */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 group flex-1">
                        {isEditingName ? (
                            <div className="flex items-center gap-3">
                                <input
                                    autoFocus
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    maxLength={30}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            localStorage.setItem("dashboard_username", userName);
                                            setIsEditingName(false);
                                        }
                                        if (e.key === "Escape") {
                                            setIsEditingName(false);
                                        }
                                    }}
                                    className="bg-transparent text-2xl font-bold text-foreground tracking-tight border-b-2 border-white/60 dark:border-white/40 outline-none min-w-[140px] py-1 placeholder:text-muted-foreground/50"
                                    placeholder="Enter name..."
                                />
                                <button
                                    onClick={() => {
                                        localStorage.setItem("dashboard_username", userName);
                                        setIsEditingName(false);
                                    }}
                                    className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 active:bg-white/25 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    aria-label="Save name"
                                >
                                    <Check size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight">
                                    Welcome back, <span className="text-white">{userName}</span>
                                </h1>
                                <button
                                    onClick={() => setIsEditingName(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setIsEditingName(true);
                                        }
                                    }}
                                    tabIndex={0}
                                    className="p-3 rounded-xl hover:bg-white/10 active:bg-white/15 text-muted-foreground hover:text-white transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    aria-label="Edit name"
                                >
                                    <Edit3 size={18} strokeWidth={2} />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Logout button */}
                    <button
                        onClick={lockApp}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                lockApp();
                            }
                        }}
                        tabIndex={0}
                        className="p-3 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-muted-foreground hover:text-white transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background border border-white/10"
                        title="Lock App"
                        aria-label="Lock App"
                    >
                        <LogOut size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </div>


            {/* Date Filter and Stats Card - Grouped with tighter spacing */}
            <div className="space-y-3">
                {/* Date Filter - Outside and above the stats card */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md rounded-lg text-xs font-medium text-white transition-all border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                    >
                        <Calendar size={14} className="opacity-70" />
                        <span>
                            {dateFilter === 'today' && 'Today'}
                            {dateFilter === 'yesterday' && 'Yesterday'}
                            {dateFilter === 'thisWeek' && 'This Week'}
                            {dateFilter === 'thisMonth' && 'This Month'}
                            {dateFilter === 'custom' && 'Custom'}
                        </span>
                        <ChevronDown size={12} className={`opacity-70 transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showFilterDropdown && (
                        <div className="absolute left-0 top-full mt-2 w-40 bg-zinc-900 border border-white/10 rounded-xl shadow-xl shadow-black/50 overflow-hidden py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                            {['today', 'yesterday', 'thisWeek', 'thisMonth', 'custom'].map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => {
                                        if (filter === 'custom') {
                                            setShowCustomDateModal(true);
                                            setShowFilterDropdown(false);
                                        } else {
                                            setDateFilter(filter);
                                            setShowFilterDropdown(false);
                                        }
                                    }}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/10 active:bg-white/15",
                                        dateFilter === filter ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    {filter === 'today' && 'Today'}
                                    {filter === 'yesterday' && 'Yesterday'}
                                    {filter === 'thisWeek' && 'This Week'}
                                    {filter === 'thisMonth' && 'This Month'}
                                    {filter === 'custom' && 'Custom Range...'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Main Stats Card - Dark Mode Grayscale */}
                <div className="relative bg-gradient-to-br from-slate-700 to-slate-900 dark:from-zinc-800 dark:to-zinc-950 rounded-[1.75rem] shadow-2xl shadow-black/40 ring-1 ring-white/5 transition-all duration-300 hover:shadow-3xl hover:shadow-black/50 hover:ring-white/10">
                    {/* Decorative Background Layer - Clipped */}
                    <div className="absolute inset-0 overflow-hidden rounded-[1.75rem] pointer-events-none">
                        {/* Background Icon */}
                        <div className="absolute top-0 right-0 p-6 opacity-[0.06] text-white">
                            <TrendingUp size={120} strokeWidth={1.5} />
                        </div>

                        {/* Decorative elements */}
                        <div className="absolute -top-12 -left-12 w-36 h-36 bg-white/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 right-0 w-44 h-44 bg-white/3 rounded-full blur-3xl" />
                    </div>


                    <div className="relative z-10 space-y-6  p-6 md:p-7">
                        {isLoadingStats ? (
                            // Loading Skeleton
                            <div className="space-y-5 animate-pulse">
                                <div className="grid grid-cols-2 gap-4 md:gap-5">
                                    <div className="space-y-2">
                                        <div className="h-3 w-20 bg-white/20 rounded" />
                                        <div className="h-9 w-32 bg-white/30 rounded" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-3 w-20 bg-white/20 rounded" />
                                        <div className="h-9 w-32 bg-white/30 rounded" />
                                    </div>
                                </div>
                                <div className="h-12 w-full bg-white/10 rounded-xl" />
                            </div>
                        ) : statsError ? (
                            // Error State
                            <div className="space-y-4 text-center py-4">
                                <div className="text-rose-400 text-sm font-medium">{statsError}</div>
                                <button
                                    onClick={fetchStats}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-[0.98] text-white text-sm font-semibold rounded-lg transition-all duration-200"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : (
                            // Stats Content
                            <>
                                <div className="grid grid-cols-2 gap-5 md:gap-6">
                                    <div className="space-y-2">
                                        <p className="text-white/50 font-medium text-[10px] uppercase tracking-wider">
                                            {dateFilter === 'today' ? 'Revenue (Today)' :
                                                dateFilter === 'yesterday' ? 'Revenue (Yesterday)' :
                                                    dateFilter === 'thisWeek' ? 'Revenue (This Week)' :
                                                        dateFilter === 'thisMonth' ? 'Revenue (This Month)' :
                                                            'Revenue (Custom)'}
                                        </p>
                                        <h2 className="text-3xl font-bold text-white tracking-tight">
                                            <span className="text-lg align-top opacity-50 font-normal mr-0.5">₹</span>
                                            {stats.revenue.toLocaleString()}
                                        </h2>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-white/50 font-medium text-[10px] uppercase tracking-wider">Net Profit</p>
                                        <h2 className={cn(
                                            "text-3xl font-bold tracking-tight flex items-center gap-1",
                                            stats.profit >= 0 ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                            {stats.profit >= 0 ? <Plus size={22} strokeWidth={2.5} /> : <Minus size={22} strokeWidth={2.5} />}
                                            <span>
                                                <span className="text-lg align-top opacity-60 font-normal mr-0.5">₹</span>
                                                {Math.abs(stats.profit).toLocaleString()}
                                            </span>
                                        </h2>
                                    </div>
                                </div>

                                <Link
                                    to="/reports"
                                    className="group flex items-center justify-center w-full py-4 md:py-3.5 bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-[0.98] backdrop-blur-sm border border-white/10 hover:border-white/20 text-white rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                    View Detailed Report
                                    <ChevronRight className="ml-1.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" size={14} strokeWidth={2.5} />
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>


            {/* Quick Actions - Dark Mode Grayscale */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    to="/sale/new"
                    className="group relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-emerald-700/60 to-emerald-900/80 p-5 md:p-6 rounded-2xl shadow-lg shadow-black/20 active:scale-[0.97] transition-all duration-200 border border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-900/30 min-h-[120px]"
                >
                    <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="bg-emerald-500/30 p-3.5 rounded-full mb-3 backdrop-blur-sm group-hover:bg-emerald-500/40 group-hover:scale-105 transition-all duration-200 border border-emerald-500/30">
                        <Plus className="text-emerald-300" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="text-emerald-50 font-semibold text-sm md:text-base tracking-wide">New Sale</p>
                </Link>

                <Link
                    to="/expense/new"
                    className="group relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-rose-700/60 to-rose-900/80 p-5 md:p-6 rounded-2xl shadow-lg shadow-black/20 active:scale-[0.97] transition-all duration-200 border border-rose-500/30 hover:border-rose-500/50 hover:shadow-xl hover:shadow-rose-900/30 min-h-[120px]"
                >
                    <div className="absolute inset-0 bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="bg-rose-500/30 p-3.5 rounded-full mb-3 backdrop-blur-sm group-hover:bg-rose-500/40 group-hover:scale-105 transition-all duration-200 border border-rose-500/30">
                        <Minus className="text-rose-300" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="text-rose-50 font-semibold text-sm md:text-base tracking-wide">New Expense</p>
                </Link>
            </div>

            {/* Navigation Cards - Dark Mode Grayscale */}
            <div className="space-y-4 pt-2">
                <h3 className="font-semibold text-muted-foreground text-[10px] uppercase tracking-[0.15em] pl-1">Management</h3>
                <div className="grid gap-2.5">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.title}
                                to={item.link}
                                className="flex items-center p-4 md:p-5 bg-zinc-900/50 dark:bg-zinc-900/40 hover:bg-zinc-800/60 active:bg-zinc-800/70 active:scale-[0.99] border border-white/5 hover:border-white/10 rounded-xl group transition-all duration-200 shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[72px]"
                            >
                                <div className={cn(
                                    "w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center mr-4 transition-all duration-200 group-hover:scale-105",
                                    item.bg, item.color
                                )}>
                                    <Icon size={22} strokeWidth={2} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-foreground text-[15px] md:text-base group-hover:text-white transition-colors duration-200">{item.title}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.1em] opacity-60">Manage {item.title}</p>
                                </div>
                                <div className="bg-white/5 group-hover:bg-white/10 p-2.5 rounded-full opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-200">
                                    <ChevronRight className="text-white" size={16} strokeWidth={2.5} />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>
            {/* Custom Date Modal */}
            <Modal
                isOpen={showCustomDateModal}
                onClose={() => setShowCustomDateModal(false)}
                title={<span className="text-lg font-bold">Select Date Range</span>}
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From</label>
                            <input
                                type="date"
                                value={customDateRange.start}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To</label>
                            <input
                                type="date"
                                value={customDateRange.end}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={() => setShowCustomDateModal(false)}
                            className="flex-1 px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-secondary rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                setDateFilter('custom');
                                setShowCustomDateModal(false);
                            }}
                            className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all"
                        >
                            Apply Filter
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
