import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/toast-provider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Shield, Loader2, KeyRound, Fingerprint, Eye, EyeOff, ShieldCheck, ArrowLeft, Clock } from 'lucide-react';

// Lockout storage keys (shared with LockScreen)
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

export default function MasterPinSetup({ onSuccess }: { onSuccess: () => void }) {
    const { toast } = useToast();
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasExistingPin, setHasExistingPin] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showPin, setShowPin] = useState(false);

    // Forgot PIN / Super Admin mode
    const [showForgotPin, setShowForgotPin] = useState(false);
    const [superAdminPin, setSuperAdminPin] = useState("");
    const [revealSuperAdminPin, setRevealSuperAdminPin] = useState(false);

    // Lockout state
    const [lockoutState, setLockoutState] = useState<LockoutState>(getLockoutState);
    const [remainingTime, setRemainingTime] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);

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
        checkExistingPin();
    }, []);

    useEffect(() => {
        // Try to focus immediately when component becomes visible
        if (!isLoading && !showForgotPin && !isLockedOut) {
            inputRef.current?.focus();
        }
    }, [isLoading, hasExistingPin, showForgotPin, isLockedOut]);

    const checkExistingPin = async () => {
        try {
            const checkQuery = supabase
                .from('app_settings')
                .select('master_pin')
                .eq('id', 1)
                .single();

            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );

            // Use race to prevent hanging
            const { data, error } = await Promise.race([checkQuery, timeout]) as any;

            if (error && error.code !== 'PGRST116') {
                console.error(error);
            }

            setHasExistingPin(!!data?.master_pin);
        } catch (e) {
            console.error(e);
            // On timeout/error, assume no pin (or just let them try to create/enter)
            // But for safety, if we can't connect, maybe we shouldn't assume 'no pin'.
            // However, infinite loading is worse.
            setHasExistingPin(false);
        } finally {
            setIsLoading(false);
        }
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

    const formatRemainingTime = (ms: number) => {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleCreatePin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (pin.length < 4) {
            toast("PIN must be at least 4 digits", "error");
            return;
        }

        if (pin !== confirmPin) {
            toast("PINs don't match", "error");
            return;
        }

        setIsCreating(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ id: 1, master_pin: pin, pin_version: 1 });

            if (error) throw error;

            localStorage.setItem('device_authorized', 'true');
            localStorage.setItem('verified_pin_version', '1');
            toast("Master PIN created!", "success");
            onSuccess();
        } catch (error: any) {
            toast(error.message || "Failed to save", "error");
        } finally {
            setIsCreating(false);
        }
    };

    const handleVerifyPin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLockedOut) {
            return;
        }

        setIsCreating(true);

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('master_pin, pin_version')
                .eq('id', 1)
                .single();

            if (error) throw error;

            if (data?.master_pin === pin) {
                const currentPinVersion = data?.pin_version || 1;

                localStorage.setItem('device_authorized', 'true');
                localStorage.setItem('verified_pin_version', currentPinVersion.toString());

                // Register this device
                const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
                localStorage.setItem('device_id', deviceId);

                const ua = navigator.userAgent;
                let deviceName = 'Unknown Device';
                if (ua.includes('iPhone')) deviceName = 'iPhone';
                else if (ua.includes('iPad')) deviceName = 'iPad';
                else if (ua.includes('Android')) deviceName = 'Android Device';
                else if (ua.includes('Windows')) deviceName = 'Windows PC';
                else if (ua.includes('Mac')) deviceName = 'Mac';

                await supabase
                    .from('authorized_devices')
                    .upsert({
                        device_id: deviceId,
                        device_name: deviceName,
                        fingerprint_enabled: false,
                        verified_pin_version: currentPinVersion,
                        last_pin_verified_at: new Date().toISOString(),
                        last_active_at: new Date().toISOString()
                    }, { onConflict: 'device_id' });

                // Clear lockout on success
                clearLockoutState();
                setLockoutState(getDefaultLockoutState());

                toast("Device authorized!", "success");
                onSuccess();
            } else {
                setPin('');
                handleFailedAttempt();
            }
        } catch (error: any) {
            toast("Verification failed", "error");
        } finally {
            setIsCreating(false);
        }
    };

    const handleSuperAdminUnlock = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLockedOut) {
            return;
        }

        setIsCreating(true);

        try {
            // Verify Super Admin PIN
            const { data, error: fetchError } = await supabase
                .from('app_settings')
                .select('super_admin_pin, pin_version')
                .eq('id', 1)
                .single();

            if (fetchError) {
                toast("Failed to verify. Please try again.", "error");
                setIsCreating(false);
                return;
            }

            if (!data?.super_admin_pin) {
                toast("Super Admin PIN not configured. Please contact administrator.", "error");
                setIsCreating(false);
                return;
            }

            if (data.super_admin_pin === superAdminPin) {
                // Super Admin PIN verified - authorize this device
                const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
                localStorage.setItem('device_id', deviceId);
                localStorage.setItem('device_authorized', 'true');

                const currentVersion = data?.pin_version || 1;
                localStorage.setItem('verified_pin_version', currentVersion.toString());

                // Update device in database
                const ua = navigator.userAgent;
                let deviceName = 'Unknown Device';
                if (ua.includes('iPhone')) deviceName = 'iPhone';
                else if (ua.includes('iPad')) deviceName = 'iPad';
                else if (ua.includes('Android')) deviceName = 'Android Device';
                else if (ua.includes('Windows')) deviceName = 'Windows PC';
                else if (ua.includes('Mac')) deviceName = 'Mac';

                await supabase
                    .from('authorized_devices')
                    .upsert({
                        device_id: deviceId,
                        device_name: deviceName,
                        fingerprint_enabled: false,
                        verified_pin_version: currentVersion,
                        last_pin_verified_at: new Date().toISOString(),
                        last_active_at: new Date().toISOString()
                    }, { onConflict: 'device_id' });

                // Clear lockout on success
                clearLockoutState();
                setLockoutState(getDefaultLockoutState());

                toast("Device authorized with Super Admin PIN!", "success");
                onSuccess();
            } else {
                setSuperAdminPin("");
                handleFailedAttempt();
            }
        } catch (err) {
            console.error("Super Admin unlock error:", err);
            toast("Something went wrong. Please try again.", "error");
        } finally {
            setIsCreating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-8">
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center shadow-xl ${isLockedOut
                            ? 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/30'
                            : showForgotPin
                                ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30'
                                : 'bg-gradient-to-br from-primary to-blue-600 shadow-primary/30'
                        }`}>
                        {isLockedOut ? (
                            <Clock className="text-white" size={36} />
                        ) : showForgotPin ? (
                            <ShieldCheck className="text-white" size={36} />
                        ) : hasExistingPin ? (
                            <KeyRound className="text-white" size={36} />
                        ) : (
                            <Shield className="text-white" size={36} />
                        )}
                    </div>
                    <h1 className="text-2xl font-black text-foreground tracking-tight">
                        {isLockedOut
                            ? "Too Many Attempts"
                            : showForgotPin
                                ? "Super Admin Access"
                                : hasExistingPin
                                    ? "Enter Master PIN"
                                    : "Create Master PIN"
                        }
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {isLockedOut
                            ? "Please wait before trying again."
                            : showForgotPin
                                ? "Use your Super Admin PIN for emergency access"
                                : hasExistingPin
                                    ? "Enter your PIN to authorize this device"
                                    : "This PIN protects access to your business data"
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

                {/* Forgot PIN Mode - Super Admin Entry */}
                {showForgotPin && hasExistingPin && !isLockedOut ? (
                    <form onSubmit={handleSuperAdminUnlock} className="space-y-4">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowForgotPin(false);
                                setSuperAdminPin("");
                            }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft size={16} />
                            Back to Master PIN
                        </button>

                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                <strong>Emergency Access:</strong> Use your Super Admin PIN to authorize this device if you forgot your Master PIN.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground block mb-2">
                                Super Admin PIN
                            </label>
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
                                    className="w-full px-4 h-16 text-center text-2xl font-black tracking-[0.5em] bg-secondary/50 border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all pr-12"
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
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-bold bg-amber-500 hover:bg-amber-600 text-white"
                            disabled={isCreating || superAdminPin.length < 6}
                        >
                            {isCreating ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                "Authorize with Super Admin"
                            )}
                        </Button>
                    </form>
                ) : !isLockedOut ? (
                    <>
                        {/* Form */}
                        <form onSubmit={hasExistingPin ? handleVerifyPin : handleCreatePin} className="space-y-4">
                            <div className="space-y-2">
                                <div
                                    onClick={() => inputRef.current?.focus()}
                                    onTouchEnd={() => inputRef.current?.focus()}
                                    className="cursor-pointer"
                                >
                                    <label
                                        htmlFor="master-pin-input"
                                        className="text-sm font-medium text-foreground block mb-2"
                                    >
                                        {hasExistingPin ? "Master PIN" : "Create PIN (4-6 digits)"}
                                    </label>
                                    <div
                                        className="relative z-[9999]"
                                        style={{ pointerEvents: 'auto' }}
                                    >
                                        <input
                                            id="master-pin-input"
                                            ref={inputRef}
                                            type={showPin ? "tel" : "password"}
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                                            className="w-full px-4 h-16 text-center text-2xl font-black tracking-[0.5em] bg-secondary/50 border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all pr-12"
                                            style={{
                                                pointerEvents: 'auto',
                                                touchAction: 'manipulation',
                                                WebkitUserSelect: 'text',
                                                userSelect: 'text'
                                            }}
                                            required
                                            autoFocus
                                            autoComplete="off"
                                            readOnly={false}
                                        />
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setShowPin(!showPin);
                                            }}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPin ? (
                                                <EyeOff size={24} />
                                            ) : (
                                                <Eye size={24} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {!hasExistingPin && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Confirm PIN</label>
                                    <Input
                                        type="password"
                                        inputMode="numeric"
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="••••••"
                                        className="h-14 text-center text-2xl font-black tracking-[0.5em]"
                                        required
                                    />
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-12 text-base font-bold"
                                disabled={isCreating || pin.length < 4}
                            >
                                {isCreating ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    hasExistingPin ? "Unlock" : "Create & Continue"
                                )}
                            </Button>
                        </form>

                        {/* Info */}
                        <div className="space-y-3">
                            <p className="text-xs text-center text-muted-foreground">
                                {hasExistingPin
                                    ? "Once authorized, you can set up fingerprint for quick access"
                                    : "Remember this PIN! You'll need it to access from new devices"}
                            </p>

                            {hasExistingPin && (
                                <>
                                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                                        <Fingerprint size={18} className="text-primary" />
                                        <p className="text-xs text-primary font-medium">
                                            Fingerprint login available after PIN verification
                                        </p>
                                    </div>

                                    {/* Forgot PIN option */}
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotPin(true)}
                                        className="w-full text-sm text-muted-foreground hover:text-foreground font-medium hover:underline active:underline py-2 transition-colors text-center"
                                    >
                                        Forgot PIN?
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}

