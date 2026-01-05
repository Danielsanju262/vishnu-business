import { Link } from "react-router-dom";
import { ArrowLeft, Database, Shield, Moon, Sun, Laptop, Lock, Check, Fingerprint, LogOut } from "lucide-react";
import { useTheme } from "../components/theme-provider";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const { hasBiometrics, registerBiometrics, disableBiometrics } = useAuth();

    return (
        <div className="min-h-screen bg-background p-4 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-accent text-muted-foreground transition">
                    <ArrowLeft />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-foreground">Settings</h1>
                    <p className="text-muted-foreground text-xs">App preferences</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* App Info Card */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Shield size={18} className="text-emerald-500" />
                        Application
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-border">
                            <span className="text-sm text-muted-foreground">Version</span>
                            <span className="text-sm font-medium text-foreground">v1.3.0</span>
                        </div>

                        <div className="py-2 border-b border-border">
                            <span className="text-sm text-muted-foreground mb-3 block">Theme</span>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setTheme("light")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "light"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Sun size={20} />
                                    <span className="text-xs font-bold">Light</span>
                                </button>
                                <button
                                    onClick={() => setTheme("dark")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "dark"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Moon size={20} />
                                    <span className="text-xs font-bold">Dark</span>
                                </button>
                                <button
                                    onClick={() => setTheme("system")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "system"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Laptop size={20} />
                                    <span className="text-xs font-bold">Auto</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-muted-foreground">Build</span>
                            <span className="text-sm font-medium text-foreground">Production</span>
                        </div>
                    </div>
                </div>

                {/* Security Card - Simplified */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Lock size={18} className="text-rose-500" />
                        Quick Unlock
                    </h2>

                    <p className="text-xs text-muted-foreground mb-4">
                        Add biometric unlock for quick access when you lock the app. You can always unlock with your Master PIN.
                    </p>

                    {hasBiometrics ? (
                        <div className="space-y-3">
                            <div className="text-xs p-3 rounded-lg border font-medium flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                <Check size={14} />
                                FaceID / Fingerprint Active
                            </div>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={disableBiometrics}
                            >
                                Remove Biometrics
                            </Button>
                        </div>
                    ) : (
                        <Button
                            className="w-full"
                            onClick={registerBiometrics}
                        >
                            <Fingerprint size={18} className="mr-2" />
                            Enable FaceID / Fingerprint
                        </Button>
                    )}
                </div>

                {/* Data Card */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Database size={18} className="text-blue-500" />
                        Data
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        All your business data is securely stored in your Supabase cloud database.
                    </p>
                    <button disabled className="w-full py-2 bg-accent text-muted-foreground rounded-lg text-sm font-medium cursor-not-allowed opacity-50">
                        Backup Data (Coming Soon)
                    </button>
                </div>

                {/* Device Deauthorize */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <LogOut size={18} className="text-rose-500" />
                        Device
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        Remove this device's authorization. You'll need your Master PIN again.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                        onClick={() => {
                            localStorage.removeItem('device_authorized');
                            localStorage.removeItem('bio_credential_id');
                            localStorage.removeItem('app_locked');
                            window.location.reload();
                        }}
                    >
                        <LogOut size={16} className="mr-2" />
                        Deauthorize Device
                    </Button>
                </div>

                {/* Footer */}
                <div className="text-center pt-8">
                    <p className="text-xs text-muted-foreground">Designed for Vishnu Business</p>
                </div>
            </div>
        </div>
    );
}
