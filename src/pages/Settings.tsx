import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Shield, Moon, Sun, Laptop, Lock, Check, Fingerprint, LogOut } from "lucide-react";
import { useTheme } from "../components/theme-provider";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const { isEnabled, hasPin, hasBiometrics, registerBiometrics, registerPin, disableLock } = useAuth();
    const [pinInput, setPinInput] = useState("");
    const [isSettingPin, setIsSettingPin] = useState(false);

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pinInput.length >= 4) {
            registerPin(pinInput);
            setIsSettingPin(false);
            setPinInput("");
        }
    };

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
                            <span className="text-sm font-medium text-foreground">v1.2.0 (Beta)</span>
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
                                    <span className="text-xs font-bold">System</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-muted-foreground">Build</span>
                            <span className="text-sm font-medium text-foreground">Production</span>
                        </div>
                    </div>
                </div>

                {/* Security Card */}
                {/* Security Card */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Lock size={18} className="text-rose-500" />
                        Security
                    </h2>

                    {/* Security Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="font-bold text-foreground text-sm">App Security</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Lock app with PIN / Biometrics
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                if (isEnabled) {
                                    disableLock();
                                } else {
                                    // Start Setup Flow
                                    if (hasPin) {
                                        registerBiometrics(); // Try adding bio if PIN exists (or re-enabling)
                                    } else {
                                        setIsSettingPin(true);
                                    }
                                }
                            }}
                            className={cn(
                                "w-12 h-7 rounded-full transition-colors relative",
                                isEnabled ? "bg-primary" : "bg-muted"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 flex items-center justify-center",
                                isEnabled ? "left-6" : "left-1"
                            )}>
                                {isEnabled && <Check size={12} className="text-primary" />}
                            </div>
                        </button>
                    </div>

                    {/* PIN Setup UI */}
                    {isSettingPin && !isEnabled && (
                        <div className="mt-4 bg-accent/30 p-4 rounded-xl border border-border/50 animate-in slide-in-from-top-2">
                            <p className="text-xs font-bold text-foreground mb-3">Create a backup PIN first</p>
                            <form onSubmit={handlePinSubmit} className="flex gap-2">
                                <Input
                                    type="number"
                                    value={pinInput}
                                    onChange={e => setPinInput(e.target.value)}
                                    placeholder="Enter 4-6 digit PIN"
                                    className="h-10 text-sm font-bold tracking-widest"
                                    autoFocus
                                />
                                <Button size="sm" type="submit" disabled={pinInput.length < 4}>
                                    Save
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* Biometric Status */}
                    {isEnabled && (
                        <div className="space-y-3 mt-4">
                            {/* Current Status */}
                            <div className={cn(
                                "text-xs p-3 rounded-lg border font-medium flex items-center gap-2",
                                hasBiometrics
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            )}>
                                <Check size={14} />
                                {hasBiometrics ? "PIN + FaceID/Fingerprint Active" : "PIN Only (Add Biometrics below)"}
                            </div>

                            {/* Add Biometrics Button */}
                            {!hasBiometrics && (
                                <Button
                                    onClick={() => registerBiometrics()}
                                    className="w-full"
                                    variant="outline"
                                >
                                    <Fingerprint size={18} className="mr-2" />
                                    Add FaceID / Fingerprint
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Data Management */}
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

                {/* Sign Out */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <LogOut size={18} className="text-rose-500" />
                        Device
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        Deauthorize this device. You'll need the Master PIN again.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                        onClick={() => {
                            localStorage.removeItem('device_authorized');
                            localStorage.removeItem('is_authenticated');
                            localStorage.removeItem('bio_credential_id');
                            localStorage.removeItem('app_pin');
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
