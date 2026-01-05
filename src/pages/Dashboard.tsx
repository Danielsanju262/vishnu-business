import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Plus, Minus, TrendingUp, Users, Package, FileText, ChevronRight, Edit3, Check, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { format, subDays } from "date-fns";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

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
        fetchStats();
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

    const fetchStats = async () => {
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
    };

    const menuItems = [
        { title: "Customers", icon: Users, link: "/customers", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-400/10" },
        { title: "Products", icon: Package, link: "/products", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-400/10" },
        { title: "Reports", icon: FileText, link: "/reports", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-400/10" },
    ];

    return (
        <div className="space-y-6 px-4 pt-8 pb-32 max-w-lg mx-auto animate-in fade-in">
            {/* Header */}
            <div className="flex justify-between items-end mb-6">
                <div className="flex-1">
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1.5 opacity-80">{format(new Date(), "EEEE, MMM d")}</p>
                    <div className="flex items-center gap-2 group">
                        {isEditingName ? (
                            <div className="flex items-center gap-2">
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
                                    className="bg-transparent text-3xl font-black text-foreground tracking-tighter border-b-2 border-primary outline-none min-w-[200px]"
                                />
                                <button
                                    onClick={() => {
                                        localStorage.setItem("dashboard_username", userName);
                                        setIsEditingName(false);
                                    }}
                                    className="p-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition"
                                >
                                    <Check size={20} strokeWidth={3} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black text-foreground tracking-tighter shadow-sm">
                                    Welcome back, {userName}
                                </h1>
                                <button
                                    onClick={() => setIsEditingName(true)}
                                    className="p-1.5 rounded-xl hover:bg-accent text-muted-foreground/50 hover:text-primary transition-all"
                                >
                                    <Edit3 size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex bg-accent/50 p-1.5 rounded-full backdrop-blur-sm border border-border/50 items-center gap-1">
                    <button
                        onClick={lockApp}
                        className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-rose-500 transition-colors"
                        title="Lock App"
                    >
                        <LogOut size={16} strokeWidth={3} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-blue-400 opacity-80" />
                </div>
            </div>

            {/* Main Stats Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-900 dark:to-indigo-950 rounded-[2rem] p-7 shadow-2xl shadow-blue-900/20 ring-1 ring-white/10">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-white pointer-events-none">
                    <TrendingUp size={140} />
                </div>

                {/* Decorative circles */}
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl opacity-50" />

                <div className="relative z-10 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <p className="text-blue-100/80 font-bold text-[10px] uppercase tracking-wider">Total Revenue</p>
                            <h2 className="text-4xl font-black text-white tracking-tighter drop-shadow-sm">
                                <span className="text-xl align-top opacity-60 font-medium mr-0.5">₹</span>
                                {stats.todayRevenue.toLocaleString()}
                            </h2>
                        </div>
                        <div className="space-y-1">
                            <p className="text-blue-100/80 font-bold text-[10px] uppercase tracking-wider">Net Profit</p>
                            <h2 className={cn(
                                "text-4xl font-black tracking-tighter flex items-center gap-1 drop-shadow-sm",
                                stats.todayProfit >= 0 ? "text-emerald-300" : "text-rose-300"
                            )}>
                                {stats.todayProfit >= 0 ? <Plus size={28} strokeWidth={3} /> : <Minus size={28} strokeWidth={3} />}
                                <span>
                                    <span className="text-xl align-top opacity-60 font-medium mr-0.5">₹</span>
                                    {Math.abs(stats.todayProfit).toLocaleString()}
                                </span>
                            </h2>
                        </div>
                    </div>

                    <Link to="/reports" className="group flex items-center justify-center w-full py-3.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98]">
                        View Detailed Report
                        <ChevronRight className="ml-1 opacity-70 group-hover:translate-x-1 transition-transform" size={16} />
                    </Link>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <Link to="/sale/new" className="group relative overflow-hidden flex flex-col items-center justify-between bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-900/50 dark:to-emerald-800/50 p-5 rounded-3xl shadow-lg shadow-emerald-900/10 active:scale-95 transition-all duration-300 border border-emerald-400/20">
                    <div className="absolute inset-0 bg-emerald-400/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="bg-white/20 p-3 rounded-full mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                        <Plus className="text-white" size={28} strokeWidth={3} />
                    </div>
                    <p className="text-emerald-50 dark:text-emerald-100 font-bold text-sm tracking-wide">New Sale</p>
                </Link>

                <Link to="/expense/new" className="group relative overflow-hidden flex flex-col items-center justify-between bg-gradient-to-br from-rose-500 to-rose-600 dark:from-rose-900/50 dark:to-rose-800/50 p-5 rounded-3xl shadow-lg shadow-rose-900/10 active:scale-95 transition-all duration-300 border border-rose-400/20">
                    <div className="absolute inset-0 bg-rose-400/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="bg-white/20 p-3 rounded-full mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                        <Minus className="text-white" size={28} strokeWidth={3} />
                    </div>
                    <p className="text-rose-50 dark:text-rose-100 font-bold text-sm tracking-wide">New Expense</p>
                </Link>
            </div>

            {/* Navigation Cards */}
            <div className="space-y-4 pt-2">
                <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-widest pl-1">Management</h3>
                <div className="grid gap-3">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link key={item.title} to={item.link} className="flex items-center p-4 bg-card hover:bg-accent/50 border border-border/60 rounded-2xl group transition-all duration-300 interactive shadow-sm hover:shadow-md hover:border-border">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mr-5 transition-transform group-hover:scale-110 duration-300", item.bg, item.color)}>
                                    <Icon size={22} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-foreground text-base group-hover:text-primary transition-colors">{item.title}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider opacity-70">Manage {item.title}</p>
                                </div>
                                <div className="bg-accent/50 p-2 rounded-full opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                    <ChevronRight className="text-primary" size={16} strokeWidth={3} />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
