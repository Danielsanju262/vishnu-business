import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Fingerprint, Lock, KeyRound, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export default function LockScreen() {
    const { authenticate, authenticateMasterPin, hasBiometrics } = useAuth();
    const [isAnimating, setIsAnimating] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Auto-prompt biometrics on mount if available
        if (hasBiometrics && !showPin) {
            const t = setTimeout(() => {
                handleUnlock();
            }, 500);
            return () => clearTimeout(t);
        }
    }, [hasBiometrics]);

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
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
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

                {showPin ? (
                    <form onSubmit={handlePinUnlock} className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        <div className="relative">
                            <Input
                                type="password"
                                inputMode="numeric"
                                autoFocus
                                value={pin}
                                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="Master PIN"
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
                        {hasBiometrics && (
                            <button
                                type="button"
                                onClick={() => setShowPin(false)}
                                className="text-sm text-primary font-bold hover:underline py-2"
                            >
                                Use Biometrics
                            </button>
                        )}
                    </form>
                ) : (
                    <div className="w-full space-y-3">
                        {hasBiometrics && (
                            <Button
                                size="lg"
                                onClick={handleUnlock}
                                className="w-full h-14 rounded-2xl text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Fingerprint className="mr-2" size={24} />
                                Unlock with Biometrics
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
            </div>
        </div>
    );
}
