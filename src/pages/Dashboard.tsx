import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Plus, Minus, TrendingUp, Users, Package, FileText, ChevronRight, Edit3, Check, LogOut, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { format, subDays } from "date-fns";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { useRealtimeTables } from "../hooks/useRealtimeSync";

export default function Dashboard() {
    const { lockApp } = useAuth();
    const [stats, setStats] = useState({
        todayRevenue: 0,
        todayProfit: 0,
        yesterdayRevenue: 0,
        yesterdayProfit: 0,
    });

    const [userName, setUserName] = useState("Vishnu");
    const [isEditingName, setIsEditingName] = useState(false);

    useEffect(() => {
        const storedName = localStorage.getItem("dashboard_username");
        if (storedName) setUserName(storedName);
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

    const fetchStats = useCallback(async () => {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = subDays(new Date(), 1).toISOString().split('T')[0];

        // Fetch Today
        const { data: tToday } = await supabase.from('transactions').select('*').is('deleted_at', null).eq('date', today);
        const { data: eToday } = await supabase.from('expenses').select('*').is('deleted_at', null).eq('date', today);
        const statToday = calculateProfit(tToday || [], eToday || []);

        // Fetch Yesterday
        const { data: tYest } = await supabase.from('transactions').select('*').is('deleted_at', null).eq('date', yesterday);
        const { data: eYest } = await supabase.from('expenses').select('*').is('deleted_at', null).eq('date', yesterday);
        const statYest = calculateProfit(tYest || [], eYest || []);

        setStats({
            todayRevenue: statToday.revenue,
            todayProfit: statToday.netProfit,
            yesterdayRevenue: statYest.revenue,
            yesterdayProfit: statYest.netProfit,
        });
    }, []);

    // Real-time sync for transactions and expenses - auto-refreshes stats when data changes on any device
    useRealtimeTables(['transactions', 'expenses'], fetchStats, []);

    // Grayscale palette for dark mode icons
    const menuItems = [
        { title: "Customers", icon: Users, link: "/customers", color: "text-blue-600 dark:text-white", bg: "bg-blue-100 dark:bg-white/10" },
        { title: "Suppliers", icon: Truck, link: "/suppliers", color: "text-sky-600 dark:text-white", bg: "bg-sky-100 dark:bg-white/10" },
        { title: "Products", icon: Package, link: "/products", color: "text-purple-600 dark:text-white", bg: "bg-purple-100 dark:bg-white/10" },
        { title: "Reports", icon: FileText, link: "/reports", color: "text-amber-600 dark:text-white", bg: "bg-amber-100 dark:bg-white/10" },
    ];

    return (
        <div className="space-y-6 px-4 pt-8 pb-32 max-w-lg mx-auto animate-in fade-in">
            {/* Header */}
            <div className="flex justify-between items-end mb-8">
                <div className="flex-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-2">{format(new Date(), "EEEE, MMM d")}</p>
                    <div className="flex items-center gap-2 group">
                        {isEditingName ? (
                            <div className="flex items-center gap-3">
                                <input
                                    autoFocus
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    onBlur={() => {
                                        localStorage.setItem("dashboard_username", userName);
                                        setIsEditingName(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            localStorage.setItem("dashboard_username", userName);
                                            setIsEditingName(false);
                                        }
                                    }}
                                    className="bg-transparent text-2xl font-bold text-foreground tracking-tight border-b-2 border-white/60 dark:border-white/40 outline-none min-w-[180px] py-1 placeholder:text-muted-foreground/50"
                                    placeholder="Enter name..."
                                />
                                <button
                                    onClick={() => {
                                        localStorage.setItem("dashboard_username", userName);
                                        setIsEditingName(false);
                                    }}
                                    className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 active:bg-white/25 transition-all duration-200"
                                    aria-label="Save name"
                                >
                                    <Check size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight">
                                    Welcome back, <span className="text-white">{userName}</span>
                                </h1>
                                <button
                                    onClick={() => setIsEditingName(true)}
                                    className="p-2 rounded-xl hover:bg-white/10 active:bg-white/15 text-muted-foreground hover:text-white transition-all duration-200"
                                    aria-label="Edit name"
                                >
                                    <Edit3 size={16} strokeWidth={2} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex bg-white/5 p-1 rounded-full backdrop-blur-sm border border-white/10 items-center gap-1">
                    <button
                        onClick={lockApp}
                        className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 text-muted-foreground hover:text-white transition-all duration-200"
                        title="Lock App"
                        aria-label="Lock App"
                    >
                        <LogOut size={16} strokeWidth={2.5} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/30 to-white/10 border border-white/20" />
                </div>
            </div>

            {/* Main Stats Card - Dark Mode Grayscale */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 dark:from-zinc-800 dark:to-zinc-950 rounded-[1.75rem] p-6 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                {/* Background Icon */}
                <div className="absolute top-0 right-0 p-6 opacity-[0.06] text-white pointer-events-none">
                    <TrendingUp size={120} strokeWidth={1.5} />
                </div>

                {/* Decorative elements */}
                <div className="absolute -top-12 -left-12 w-36 h-36 bg-white/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-0 w-44 h-44 bg-white/3 rounded-full blur-3xl" />

                <div className="relative z-10 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <p className="text-white/50 font-medium text-[10px] uppercase tracking-[0.12em]">Total Revenue</p>
                            <h2 className="text-3xl font-bold text-white tracking-tight">
                                <span className="text-lg align-top opacity-50 font-normal mr-0.5">₹</span>
                                {stats.todayRevenue.toLocaleString()}
                            </h2>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-white/50 font-medium text-[10px] uppercase tracking-[0.12em]">Net Profit</p>
                            <h2 className={cn(
                                "text-3xl font-bold tracking-tight flex items-center gap-1",
                                stats.todayProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {stats.todayProfit >= 0 ? <Plus size={22} strokeWidth={2.5} /> : <Minus size={22} strokeWidth={2.5} />}
                                <span>
                                    <span className="text-lg align-top opacity-60 font-normal mr-0.5">₹</span>
                                    {Math.abs(stats.todayProfit).toLocaleString()}
                                </span>
                            </h2>
                        </div>
                    </div>

                    <Link
                        to="/reports"
                        className="group flex items-center justify-center w-full py-3 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-sm border border-white/10 hover:border-white/20 text-white rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
                    >
                        View Detailed Report
                        <ChevronRight className="ml-1.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" size={14} strokeWidth={2.5} />
                    </Link>
                </div>
            </div>

            {/* Quick Actions - Dark Mode Grayscale */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    to="/sale/new"
                    className="group relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 p-5 rounded-2xl shadow-lg shadow-black/20 active:scale-[0.97] transition-all duration-200 border border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-900/20"
                >
                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="bg-emerald-500/20 p-3 rounded-full mb-3 backdrop-blur-sm group-hover:bg-emerald-500/30 group-hover:scale-105 transition-all duration-200 border border-emerald-500/20">
                        <Plus className="text-emerald-400" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="text-emerald-100 font-semibold text-sm tracking-wide">New Sale</p>
                </Link>

                <Link
                    to="/expense/new"
                    className="group relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-rose-900/40 to-rose-950/60 p-5 rounded-2xl shadow-lg shadow-black/20 active:scale-[0.97] transition-all duration-200 border border-rose-500/20 hover:border-rose-500/40 hover:shadow-xl hover:shadow-rose-900/20"
                >
                    <div className="absolute inset-0 bg-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="bg-rose-500/20 p-3 rounded-full mb-3 backdrop-blur-sm group-hover:bg-rose-500/30 group-hover:scale-105 transition-all duration-200 border border-rose-500/20">
                        <Minus className="text-rose-400" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="text-rose-100 font-semibold text-sm tracking-wide">New Expense</p>
                </Link>
            </div>

            {/* Navigation Cards - Dark Mode Grayscale */}
            <div className="space-y-4 pt-3">
                <h3 className="font-semibold text-muted-foreground text-[10px] uppercase tracking-[0.15em] pl-1">Management</h3>
                <div className="grid gap-2.5">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.title}
                                to={item.link}
                                className="flex items-center p-4 bg-zinc-900/50 dark:bg-zinc-900/40 hover:bg-zinc-800/60 active:bg-zinc-800/70 border border-white/5 hover:border-white/10 rounded-xl group transition-all duration-200 shadow-sm hover:shadow-md"
                            >
                                <div className={cn(
                                    "w-11 h-11 rounded-xl flex items-center justify-center mr-4 transition-all duration-200 group-hover:scale-105",
                                    item.bg, item.color
                                )}>
                                    <Icon size={20} strokeWidth={2} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-foreground text-[15px] group-hover:text-white transition-colors duration-200">{item.title}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.1em] opacity-60">Manage {item.title}</p>
                                </div>
                                <div className="bg-white/5 group-hover:bg-white/10 p-2 rounded-full opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-200">
                                    <ChevronRight className="text-white" size={14} strokeWidth={2.5} />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
