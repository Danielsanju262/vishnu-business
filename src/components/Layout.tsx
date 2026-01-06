import { Outlet, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Settings, IndianRupee } from "lucide-react";
import { cn } from "../lib/utils";

export default function Layout() {
    const location = useLocation();

    // Updated Navigation with more items for easier access
    const navItems = [
        {
            path: "/",
            icon: LayoutDashboard,
            label: "Home",
            isActive: (pathname: string) => pathname === "/" || pathname.startsWith("/customers") || pathname.startsWith("/products") || pathname.startsWith("/reports")
        },
        {
            path: "/payment-reminders",
            icon: IndianRupee,
            label: "Payments",
            isActive: (pathname: string) => pathname.startsWith("/payment-reminders")
        },
        {
            path: "/settings",
            icon: Settings,
            label: "Settings",
            isActive: (pathname: string) => pathname.startsWith("/settings")
        },
    ];

    return (
        <div className="min-h-screen pb-24 relative bg-background selection:bg-primary/20">
            <main className="h-full animate-in fade-in duration-500">
                <Outlet />
            </main>

            {/* Premium Floating Bottom Navigation */}
            <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[400px]">
                <div className="bg-zinc-900/95 dark:bg-zinc-950/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-full py-3 px-6 flex justify-around items-center ring-1 ring-white/5">
                    {navItems.map((item) => {
                        const isActive = item.isActive(location.pathname);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "relative flex flex-col items-center justify-center w-12 h-12 transition-all duration-200 interactive group",
                                    isActive ? "text-white" : "text-white/50 hover:text-white/80 active:text-white"
                                )}
                            >
                                <div className={cn(
                                    "absolute inset-0 rounded-full transition-all duration-200 opacity-0 scale-50",
                                    isActive ? "bg-white/10 opacity-100 scale-100" : "group-hover:bg-white/5 group-hover:opacity-100 group-hover:scale-75 group-active:bg-white/10 group-active:opacity-100 group-active:scale-75"
                                )} />
                                <Icon
                                    size={22}
                                    className={cn("relative z-10 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-105 group-active:scale-105")}
                                    strokeWidth={isActive ? 2.5 : 2}
                                />
                                {isActive && (
                                    <span className="absolute -bottom-0.5 w-1.5 h-1.5 bg-white rounded-full animate-in zoom-in" />
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav >
        </div >
    );
}
