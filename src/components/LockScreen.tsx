import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Fingerprint, Lock, KeyRound, Loader2, ShieldAlert, Eye, EyeOff, ShieldCheck, ArrowLeft, Clock, Timer } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from './toast-provider';

// Lockout storage keys
const LOCKOUT_STORAGE_KEY = 'pin_lockout_state';

interface LockoutState {
    failedAttempts: number;
    lockoutUntil: number | null; // timestamp
    lockoutLevel: number; // 0 = no lockout, 1 = first lockout (5 min), 2 = second lockout (10 min)
}

const getDefaultLockoutState = (): LockoutState => ({
    failedAttempts: 0,
    lockoutUntil: null,
    lockoutLevel: 0
});

const getLockoutState = (): LockoutState => {
    try {
        const stored = localStorage.getItem(LOCKOUT_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch { }
    return getDefaultLockoutState();
};

const saveLockoutState = (state: LockoutState) => {
    localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state));
};

const clearLockoutState = () => {
    localStorage.removeItem(LOCKOUT_STORAGE_KEY);
};

export default function LockScreen() {
    const {
        authenticate,
        authenticateMasterPin,
        authenticateSuperAdmin,
        enableSecurityBypass,
        hasBiometrics,
        currentPinVersion,
        devicePinVersion,
        hasSuperAdminSetup
    } = useAuth();
    const { toast } = useToast();
    const [isAnimating, setIsAnimating] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [revealPin, setRevealPin] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Forgot PIN / Super Admin mode
    const [showForgotPin, setShowForgotPin] = useState(false);
    const [superAdminPin, setSuperAdminPin] = useState("");
    const [revealSuperAdminPin, setRevealSuperAdminPin] = useState(false);

    // Security bypass mode
    const [showBypassMode, setShowBypassMode] = useState(false);
    const [bypassPin, setBypassPin] = useState("");
    const [revealBypassPin, setRevealBypassPin] = useState(false);

    // Lockout state
    const [lockoutState, setLockoutState] = useState<LockoutState>(getLockoutState);
    const [remainingTime, setRemainingTime] = useState(0);

    // Check if PIN was updated and biometrics are temporarily disabled
    const pinWasUpdated = devicePinVersion > 0 && devicePinVersion < currentPinVersion;
    const canUseBiometrics = hasBiometrics && !pinWasUpdated;

    // Check if currently locked out
    const isLockedOut = lockoutState.lockoutUntil && lockoutState.lockoutUntil > Date.now();

    // Timer for lockout countdown
    useEffect(() => {
        if (lockoutState.lockoutUntil && lockoutState.lockoutUntil > Date.now()) {
            const interval = setInterval(() => {
                const remaining = lockoutState.lockoutUntil! - Date.now();
                if (remaining <= 0) {
                    // Lockout expired, reset attempts for this level
                    const newState: LockoutState = {
                        ...lockoutState,
                        failedAttempts: 0,
                        lockoutUntil: null
                    };
                    setLockoutState(newState);
                    saveLockoutState(newState);
                    setRemainingTime(0);
                } else {
                    setRemainingTime(remaining);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [lockoutState.lockoutUntil]);

    useEffect(() => {
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        // Auto-prompt biometrics on mount if available and PIN is current
        if (canUseBiometrics && !showPin && !isLockedOut) {
            const t = setTimeout(() => {
                handleUnlock();
            }, 500);
            return () => clearTimeout(t);
        }
        // If PIN was updated, force PIN entry
        if (pinWasUpdated) {
            setShowPin(true);
        }
    }, [canUseBiometrics, pinWasUpdated, isLockedOut]);

    useEffect(() => {
        if (showPin && !showForgotPin) {
            // Force focus when PIN screen is proven to be visible
            const t = setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
            return () => clearTimeout(t);
        }
    }, [showPin, showForgotPin]);

    const handleUnlock = async () => {
        setIsAnimating(true);
        await authenticate();
        setIsAnimating(false);
    };

    const handleFailedAttempt = () => {
        const newAttempts = lockoutState.failedAttempts + 1;

        if (newAttempts >= 3) {
            // Determine lockout duration based on level
            let lockoutDuration: number;
            let newLevel = lockoutState.lockoutLevel;

            if (lockoutState.lockoutLevel === 0) {
                // First lockout: 5 minutes
                lockoutDuration = 5 * 60 * 1000;
                newLevel = 1;
            } else {
                // Second and subsequent lockouts: 10 minutes
                lockoutDuration = 10 * 60 * 1000;
                newLevel = 2;
            }

            const newState: LockoutState = {
                failedAttempts: 0,
                lockoutUntil: Date.now() + lockoutDuration,
                lockoutLevel: newLevel
            };
            setLockoutState(newState);
            saveLockoutState(newState);
            setRemainingTime(lockoutDuration);

            const minutes = Math.ceil(lockoutDuration / 60000);
            toast(`Too many failed attempts. Please wait ${minutes} minutes.`, "error");
        } else {
            const newState: LockoutState = {
                ...lockoutState,
                failedAttempts: newAttempts
            };
            setLockoutState(newState);
            saveLockoutState(newState);

            const remaining = 3 - newAttempts;
            toast(`Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`, "error");
        }
    };

    const handlePinUnlock = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLockedOut) {
            return;
        }

        setLoading(true);
        const success = await authenticateMasterPin(pin);
        setLoading(false);

        if (!success) {
            setError(true);
            setPin("");
            setTimeout(() => setError(false), 500);
            handleFailedAttempt();
        } else {
            // Clear lockout on success
            clearLockoutState();
            setLockoutState(getDefaultLockoutState());
        }
    };

    const handleSuperAdminUnlock = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLockedOut) {
            return;
        }

        setLoading(true);

        const success = await authenticateSuperAdmin(superAdminPin);

        if (!success) {
            setError(true);
            setSuperAdminPin("");
            setTimeout(() => setError(false), 500);
            handleFailedAttempt();
        } else {
            // Clear lockout on success
            clearLockoutState();
            setLockoutState(getDefaultLockoutState());
        }

        setLoading(false);
    };

    // Handle security bypass (skip login for 3 days)
    const handleSecurityBypass = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLockedOut) {
            return;
        }

        setLoading(true);

        const result = await enableSecurityBypass(bypassPin);

        if (!result.success) {
            setError(true);
            setBypassPin("");
            setTimeout(() => setError(false), 500);
            handleFailedAttempt();
            if (result.error) {
                toast(result.error, "error");
            }
        } else {
            // Clear lockout on success
            clearLockoutState();
            setLockoutState(getDefaultLockoutState());
        }

        setLoading(false);
    };

    const formatRemainingTime = (ms: number) => {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[100] bg-background backdrop-blur-xl flex flex-col items-center justify-center p-6">
            <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">

                {/* Lock Icon Circle */}
                <div className="relative">
                    <div className={`w-32 h-32 rounded-full bg-surface-elevation-2 flex items-center justify-center border border-border/50 shadow-2xl relative z-10 ${isLockedOut ? 'border-rose-500/50' : ''}`}>
                        {isLockedOut ? (
                            <Clock size={48} className="text-rose-500" />
                        ) : (
                            <Lock size={48} className="text-primary" />
                        )}
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
                    <h1 className="text-2xl font-black text-foreground tracking-tight">
                        {isLockedOut ? 'Too Many Attempts' : 'App Locked'}
                    </h1>
                    <p className="text-muted-foreground font-medium">
                        {isLockedOut
                            ? `Please wait before trying again.`
                            : 'Verify it\'s you to continue.'
                        }
                    </p>
                </div>

                {/* Lockout Timer */}
                {isLockedOut && remainingTime > 0 && (
                    <div className="w-full p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center gap-3">
                        <Clock size={20} className="text-rose-500" />
                        <div className="text-center">
                            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
                                {formatRemainingTime(remainingTime)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Time remaining
                            </p>
                        </div>
                    </div>
                )}

                {/* PIN Updated Warning */}
                {pinWasUpdated && !isLockedOut && (
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

                {/* Forgot PIN Mode - Super Admin Entry */}
                {showForgotPin && !isLockedOut && !showBypassMode ? (
                    <form onSubmit={handleSuperAdminUnlock} className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowForgotPin(false);
                                setSuperAdminPin("");
                            }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                        >
                            <ArrowLeft size={16} />
                            Back to Master PIN
                        </button>

                        {/* Super Admin label */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <ShieldCheck size={16} className="text-amber-500" />
                            <span className="text-sm font-semibold text-foreground">Enter Super Admin PIN</span>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                <strong>Emergency Access:</strong> Use your Super Admin PIN to unlock the app if you forgot your Master PIN.
                            </p>
                        </div>

                        <div
                            className="relative z-[9999]"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <input
                                type={revealSuperAdminPin ? "tel" : "password"}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                value={superAdminPin}
                                onChange={e => setSuperAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onTouchStart={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                placeholder="••••••"
                                className={`w-full h-16 text-center text-2xl font-black tracking-[0.5em] rounded-2xl bg-secondary/50 border-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all pr-12 ${error ? 'border-rose-500 animate-shake' : 'border-border'}`}
                                style={{
                                    pointerEvents: 'auto',
                                    touchAction: 'manipulation',
                                    WebkitUserSelect: 'text',
                                    userSelect: 'text'
                                }}
                                autoComplete="off"
                                readOnly={false}
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRevealSuperAdminPin(!revealSuperAdminPin);
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full transition-colors"
                                tabIndex={-1}
                            >
                                {revealSuperAdminPin ? (
                                    <EyeOff size={24} />
                                ) : (
                                    <Eye size={24} />
                                )}
                            </button>
                        </div>
                        <Button
                            className="w-full h-12 font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                            size="lg"
                            type="submit"
                            disabled={loading || superAdminPin.length < 6}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Unlock with Super Admin"}
                        </Button>
                    </form>
                ) : showBypassMode && !isLockedOut ? (
                    /* Security Bypass Mode - Skip login for 3 days */
                    <form onSubmit={handleSecurityBypass} className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowBypassMode(false);
                                setBypassPin("");
                            }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                        >
                            <ArrowLeft size={16} />
                            Back
                        </button>

                        {/* Bypass label */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Timer size={16} className="text-emerald-500" />
                            <span className="text-sm font-semibold text-foreground">Skip Login for 3 Days</span>
                        </div>

                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-left">
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                <strong>Super Admin Only:</strong> Enter your Super Admin PIN to temporarily disable security for 3 days. You can re-enable it anytime from Settings.
                            </p>
                        </div>

                        <div
                            className="relative z-[9999]"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <input
                                type={revealBypassPin ? "tel" : "password"}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                value={bypassPin}
                                onChange={e => setBypassPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onTouchStart={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                placeholder="••••••"
                                className={`w-full h-16 text-center text-2xl font-black tracking-[0.5em] rounded-2xl bg-secondary/50 border-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-12 ${error ? 'border-rose-500 animate-shake' : 'border-border'}`}
                                style={{
                                    pointerEvents: 'auto',
                                    touchAction: 'manipulation',
                                    WebkitUserSelect: 'text',
                                    userSelect: 'text'
                                }}
                                autoComplete="off"
                                readOnly={false}
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRevealBypassPin(!revealBypassPin);
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full transition-colors"
                                tabIndex={-1}
                            >
                                {revealBypassPin ? (
                                    <EyeOff size={24} />
                                ) : (
                                    <Eye size={24} />
                                )}
                            </button>
                        </div>
                        <Button
                            className="w-full h-12 font-bold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
                            size="lg"
                            type="submit"
                            disabled={loading || bypassPin.length < 6}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Enable 3-Day Bypass"}
                        </Button>
                    </form>
                ) : showPin && !isLockedOut ? (
                    <form onSubmit={handlePinUnlock} className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        {/* Clear label for Master PIN */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <KeyRound size={16} className="text-primary" />
                            <span className="text-sm font-semibold text-foreground">Enter Master PIN</span>
                        </div>

                        <div
                            className="relative z-[9999]"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <input
                                ref={inputRef}
                                type={revealPin ? "tel" : "password"}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                value={pin}
                                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onTouchStart={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.focus();
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                placeholder="••••••"
                                className={`w-full h-16 text-center text-2xl font-black tracking-[0.5em] rounded-2xl bg-secondary/50 border-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all pr-12 ${error ? 'border-rose-500 animate-shake' : 'border-border'}`}
                                style={{
                                    pointerEvents: 'auto',
                                    touchAction: 'manipulation',
                                    WebkitUserSelect: 'text',
                                    userSelect: 'text'
                                }}
                                autoComplete="off"
                                readOnly={false}
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRevealPin(!revealPin);
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full transition-colors"
                                tabIndex={-1}
                            >
                                {revealPin ? (
                                    <EyeOff size={24} />
                                ) : (
                                    <Eye size={24} />
                                )}
                            </button>
                        </div>
                        <Button
                            className="w-full h-12 font-bold rounded-xl"
                            size="lg"
                            type="submit"
                            disabled={loading || pin.length < 4}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Unlock"}
                        </Button>

                        <div className="flex flex-col gap-2">
                            {canUseBiometrics && (
                                <button
                                    type="button"
                                    onClick={() => setShowPin(false)}
                                    className="text-sm text-primary font-bold hover:underline active:underline py-2"
                                >
                                    Use Biometrics Instead
                                </button>
                            )}

                            {/* Forgot PIN option */}
                            <button
                                type="button"
                                onClick={() => setShowForgotPin(true)}
                                className="text-sm text-muted-foreground hover:text-foreground font-medium hover:underline active:underline py-2 transition-colors"
                            >
                                Forgot PIN?
                            </button>

                            {/* Skip login option - only show if Super Admin is set up */}
                            {hasSuperAdminSetup && (
                                <button
                                    type="button"
                                    onClick={() => setShowBypassMode(true)}
                                    tabIndex={-1}
                                    className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium hover:underline active:underline py-2 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Timer size={14} />
                                    Skip login for 3 days
                                </button>
                            )}
                        </div>
                    </form>
                ) : !isLockedOut ? (
                    <div className="w-full space-y-3">
                        {canUseBiometrics && (
                            <Button
                                size="lg"
                                onClick={handleUnlock}
                                className="w-full h-14 rounded-2xl text-lg font-bold bg-primary hover:bg-primary/90 active:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[1.02]"
                            >
                                <Fingerprint className="mr-2" size={24} />
                                Unlock with Fingerprint
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setShowPin(true)}
                            className="w-full h-14 rounded-2xl text-base font-bold transition-all hover:bg-accent active:bg-accent"
                        >
                            <KeyRound className="mr-2" size={20} />
                            Use Master PIN
                        </Button>

                        {/* Skip login option on main screen - only show if Super Admin is set up */}
                        {hasSuperAdminSetup && (
                            <button
                                type="button"
                                onClick={() => setShowBypassMode(true)}
                                tabIndex={-1}
                                className="w-full text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium hover:underline active:underline py-3 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <Timer size={14} />
                                Skip login for 3 days
                            </button>
                        )}
                    </div>
                ) : null}

                {/* Security note */}
                <p className="text-xs text-muted-foreground mt-4">
                    Your data is protected by device-level encryption
                </p>
            </div>
        </div>
    );
}

