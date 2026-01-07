import { Outlet, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Settings, Wallet } from "lucide-react";
import { cn } from "../lib/utils";
import { usePaymentNotifications } from "../hooks/usePaymentNotifications";

export default function Layout() {
    const location = useLocation();
    usePaymentNotifications();

    const RupeeTextIcon = ({ size = 24, className, strokeWidth }: any) => {
        return (
            <div
                style={{
                    fontSize: `${size}px`,
                    height: `${size}px`,
                    width: `${size}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: strokeWidth > 2 ? 800 : 600,
                    lineHeight: 1
                }}
                className={cn("select-none", className)}
            >
                ₹
            </div>
        );
    };

    // Updated Navigation with more items for easier access
    const navItems = [
        {
            path: "/",
            icon: LayoutDashboard,
            label: "Home",
            isActive: (pathname: string) =>
                pathname === "/" ||
                pathname.startsWith("/customers") ||
                pathname.startsWith("/products") ||
                pathname.startsWith("/reports") ||
                pathname.startsWith("/sale") ||
                pathname.startsWith("/expense")
        },
        {
            path: "/payment-reminders",
            icon: RupeeTextIcon,
            label: "Payments",
            isActive: (pathname: string) => pathname.startsWith("/payment-reminders")
        },
        {
            path: "/accounts-payable",
            icon: Wallet,
            label: "Payables",
            isActive: (pathname: string) => pathname.startsWith("/accounts-payable") || pathname.startsWith("/suppliers")
        },
        {
            path: "/settings",
            icon: Settings,
            label: "Settings",
            isActive: (pathname: string) => pathname.startsWith("/settings")
        },
    ];

    return (
        <div className="min-h-screen pb-28 md:pb-32 relative bg-background selection:bg-primary/20">
            <main className="h-full animate-in fade-in duration-500">
                <Outlet />
            </main>

            {/* Premium Floating Bottom Navigation */}
            <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[400px]">
                <div className="bg-zinc-900/95 dark:bg-zinc-950/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-full py-3 px-6 flex justify-around items-center ring-1 ring-white/5">
                    {navItems.filter(item => {
                        // Check if we are on a "Core" page where we want full navigation
                        const isCorePage = ["/", "/payment-reminders", "/accounts-payable", "/settings"].includes(location.pathname);
                        if (isCorePage) return true;

                        // Otherwise, ONLY show the button for the active section
                        return item.isActive(location.pathname);
                    }).map((item) => {
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
                                    strokeWidth={isActive ? 3 : 2}
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
