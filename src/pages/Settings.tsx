import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Shield, Moon, Sun, Laptop, Lock, Check, Fingerprint, LogOut, KeyRound, X, Loader2, Smartphone, Trash2 } from "lucide-react";
import { useTheme } from "../components/theme-provider";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/toast-provider";

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const {
        hasBiometrics,
        registerBiometrics,
        disableBiometrics,
        canEnableBiometrics,
        authorizedDevices,
        revokeDeviceFingerprint,
        refreshDevices
    } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        refreshDevices();
    }, [refreshDevices]);

    // PIN Change State
    const [isChangePinOpen, setIsChangePinOpen] = useState(false);
    const [pinStep, setPinStep] = useState<'verify' | 'new' | 'confirm'>('verify');
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmNewPin, setConfirmNewPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const resetPinState = () => {
        setIsChangePinOpen(false);
        setPinStep('verify');
        setCurrentPin('');
        setNewPin('');
        setConfirmNewPin('');
        setIsLoading(false);
    };

    const handleVerifyCurrentPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('master_pin')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data?.master_pin === currentPin) {
                setPinStep('new');
            } else {
                console.log('Mismatch:', { input: currentPin, stored: data?.master_pin });
                toast("Incorrect PIN", "error");
                setCurrentPin('');
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            toast("Verification failed", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin !== confirmNewPin) {
            toast("PINs don't match", "error");
            return;
        }
        if (newPin.length < 4) {
            toast("PIN must be at least 4 digits", "error");
            return;
        }

        // Check against last 2 used PINs (stored in localStorage)
        const pinHistoryStr = localStorage.getItem('pin_history');
        const pinHistory: string[] = pinHistoryStr ? JSON.parse(pinHistoryStr) : [];

        if (pinHistory.includes(newPin)) {
            toast("Try a new PIN - this matches one of the last 2 PINs", "error");
            return;
        }

        setIsLoading(true);
        try {
            // First get current pin_version
            const { data: currentSettings } = await supabase
                .from('app_settings')
                .select('pin_version')
                .eq('id', 1)
                .single();

            const newVersion = (currentSettings?.pin_version || 1) + 1;

            // Update PIN and increment version (forces all devices to re-auth)
            const { error } = await supabase
                .from('app_settings')
                .update({
                    master_pin: newPin,
                    pin_version: newVersion
                })
                .eq('id', 1);

            if (error) throw error;

            // Update PIN history in localStorage (keep last 2)
            const updatedHistory = [...pinHistory, currentPin].slice(-2);
            localStorage.setItem('pin_history', JSON.stringify(updatedHistory));

            // Update this device's verified version
            localStorage.setItem('verified_pin_version', newVersion.toString());

            toast("Master PIN updated! All devices must re-authenticate.", "success");
            resetPinState();
        } catch (error) {
            console.error("Update failed:", error);
            toast("Failed to update PIN", "error");
        } finally {
            setIsLoading(false);
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

                {/* Security Section */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
                    <div>
                        <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                            <Lock size={18} className="text-rose-500" />
                            Security
                        </h2>

                        <h3 className="text-sm font-semibold mb-2">Biometrics</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Enable FaceID or Fingerprint for quick access.
                        </p>

                        {hasBiometrics ? (
                            <div className="space-y-3">
                                <div className="text-xs p-3 rounded-lg border font-medium flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                    <Check size={14} />
                                    Biometrics Active
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={disableBiometrics}
                                >
                                    Disable Biometrics
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {!canEnableBiometrics && (
                                    <p className="text-xs p-2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                        Please verify Master PIN first to enable biometrics.
                                    </p>
                                )}
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={registerBiometrics}
                                    disabled={!canEnableBiometrics}
                                >
                                    <Fingerprint size={18} className="mr-2" />
                                    Enable Biometrics
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-border">
                        <h3 className="text-sm font-semibold mb-2">Master PIN</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Change the main PIN used to access this device.
                        </p>
                        <Button
                            className="w-full"
                            onClick={() => setIsChangePinOpen(true)}
                        >
                            <KeyRound size={18} className="mr-2" />
                            Change Master PIN
                        </Button>
                    </div>
                </div>

                {/* Authorized Devices */}
                {authorizedDevices.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                            <Smartphone size={18} className="text-blue-500" />
                            Authorized Devices
                        </h2>
                        <p className="text-xs text-muted-foreground mb-4">
                            Devices with fingerprint access. You can revoke access anytime.
                        </p>
                        <div className="space-y-2">
                            {authorizedDevices.map((device) => (
                                <div
                                    key={device.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border border-border"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center",
                                            device.fingerprint_enabled ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Fingerprint size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{device.device_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {device.fingerprint_enabled ? "Fingerprint enabled" : "PIN only"}
                                            </p>
                                        </div>
                                    </div>
                                    {device.fingerprint_enabled && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                                            onClick={() => revokeDeviceFingerprint(device.device_id)}
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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

            {/* Change PIN Modal */}
            {
                isChangePinOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-w-sm bg-popover border border-border rounded-2xl shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200 relative">
                            <button
                                onClick={resetPinState}
                                className="absolute right-4 top-4 p-2 text-muted-foreground hover:bg-accent rounded-full transition"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                                    <KeyRound size={24} />
                                </div>
                                <h2 className="text-xl font-bold">Change Master PIN</h2>
                                <p className="text-sm text-muted-foreground">
                                    {pinStep === 'verify' && "Enter your current PIN to continue"}
                                    {pinStep === 'new' && "Enter your new Master PIN"}
                                    {pinStep === 'confirm' && "Confirm your new Master PIN"}
                                </p>
                            </div>

                            {pinStep === 'verify' && (
                                <form onSubmit={handleVerifyCurrentPin} className="space-y-4">
                                    <Input
                                        type="password"
                                        inputMode="numeric"
                                        value={currentPin}
                                        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="Current PIN"
                                        className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                                        autoFocus
                                    />
                                    <Button type="submit" className="w-full h-12 text-white font-bold shadow-lg shadow-primary/25">
                                        {isLoading ? <Loader2 className="animate-spin" /> : "Verify & Continue"}
                                    </Button>
                                </form>
                            )}

                            {(pinStep === 'new' || pinStep === 'confirm') && (
                                <form onSubmit={handleUpdatePin} className="space-y-4">
                                    {pinStep === 'new' ? (
                                        <div className="space-y-4">
                                            <Input
                                                type="password"
                                                inputMode="numeric"
                                                value={newPin}
                                                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="New PIN"
                                                className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                className="w-full h-12 text-white font-bold shadow-lg shadow-primary/25"
                                                disabled={newPin.length < 4}
                                                onClick={() => setPinStep('confirm')}
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <Input
                                                type="password"
                                                inputMode="numeric"
                                                value={confirmNewPin}
                                                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="Confirm PIN"
                                                className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                                                autoFocus
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <Button type="button" variant="outline" className="h-12 border-border hover:bg-accent hover:text-foreground" onClick={() => setPinStep('new')}>
                                                    Back
                                                </Button>
                                                <Button type="submit" className="h-12 text-white font-bold shadow-lg shadow-primary/25" disabled={isLoading || confirmNewPin.length < 4}>
                                                    {isLoading ? <Loader2 className="animate-spin" /> : "Save New PIN"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
}
