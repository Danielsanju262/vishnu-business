import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Fingerprint, Lock, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export default function LockScreen() {
    const {
        authenticate,
        authenticateMasterPin,
        hasBiometrics,
        currentPinVersion,
        devicePinVersion
    } = useAuth();
    const [isAnimating, setIsAnimating] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    // Check if PIN was updated and biometrics are temporarily disabled
    const pinWasUpdated = devicePinVersion > 0 && devicePinVersion < currentPinVersion;
    const canUseBiometrics = hasBiometrics && !pinWasUpdated;

    useEffect(() => {
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        // Auto-prompt biometrics on mount if available and PIN is current
        if (canUseBiometrics && !showPin) {
            const t = setTimeout(() => {
                handleUnlock();
            }, 500);
            return () => clearTimeout(t);
        }
        // If PIN was updated, force PIN entry
        if (pinWasUpdated) {
            setShowPin(true);
        }
    }, [canUseBiometrics, pinWasUpdated]);

    const handleUnlock = async () => {
        setIsAnimating(true);
        await authenticate();
        setIsAnimating(false);
    };

    const handlePinUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const success = await authenticateMasterPin(pin);
        setLoading(false);

        if (!success) {
            setError(true);
            setPin("");
            setTimeout(() => setError(false), 500);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-background backdrop-blur-xl flex flex-col items-center justify-center p-6">
            <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">

                {/* Lock Icon Circle */}
                <div className="relative">
                    <div className="w-32 h-32 rounded-full bg-surface-elevation-2 flex items-center justify-center border border-border/50 shadow-2xl relative z-10">
                        <Lock size={48} className="text-primary" />
                    </div>
                    {/* Ripple Effects */}
                    {isAnimating && (
                        <>
                            <div className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping opacity-20" />
                            <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping delay-150 opacity-10" />
                        </>
                    )}
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-foreground tracking-tight">App Locked</h1>
                    <p className="text-muted-foreground font-medium">Verify it's you to continue.</p>
                </div>

                {/* PIN Updated Warning */}
                {pinWasUpdated && (
                    <div className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                        <ShieldAlert size={20} className="text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-left">
                            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                Master PIN Updated
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Please enter the new Master PIN to re-enable fingerprint access on this device.
                            </p>
                        </div>
                    </div>
                )}

                {showPin ? (
                    <form onSubmit={handlePinUnlock} className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        {/* Clear label for Master PIN */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <KeyRound size={16} className="text-primary" />
                            <span className="text-sm font-semibold text-foreground">Enter Master PIN</span>
                        </div>

                        <div className="relative">
                            <Input
                                type="password"
                                inputMode="numeric"
                                autoFocus
                                value={pin}
                                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="••••••"
                                className={`h-14 text-center text-2xl font-black tracking-[0.5em] rounded-2xl ${error ? 'border-rose-500 animate-shake' : ''}`}
                            />
                        </div>
                        <Button
                            className="w-full h-12 font-bold rounded-xl"
                            size="lg"
                            type="submit"
                            disabled={loading || pin.length < 4}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Unlock"}
                        </Button>
                        {canUseBiometrics && (
                            <button
                                type="button"
                                onClick={() => setShowPin(false)}
                                className="text-sm text-primary font-bold hover:underline py-2"
                            >
                                Use Biometrics Instead
                            </button>
                        )}
                    </form>
                ) : (
                    <div className="w-full space-y-3">
                        {canUseBiometrics && (
                            <Button
                                size="lg"
                                onClick={handleUnlock}
                                className="w-full h-14 rounded-2xl text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Fingerprint className="mr-2" size={24} />
                                Unlock with Fingerprint
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setShowPin(true)}
                            className="w-full h-14 rounded-2xl text-base font-bold transition-all hover:bg-accent"
                        >
                            <KeyRound className="mr-2" size={20} />
                            Use Master PIN
                        </Button>
                    </div>
                )}

                {/* Security note */}
                <p className="text-xs text-muted-foreground mt-4">
                    Your data is protected by device-level encryption
                </p>
            </div>
        </div>
    );
}
