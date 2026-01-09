import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/toast-provider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Shield, Loader2, KeyRound, Fingerprint } from 'lucide-react';

export default function MasterPinSetup({ onSuccess }: { onSuccess: () => void }) {
    const { toast } = useToast();
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasExistingPin, setHasExistingPin] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        checkExistingPin();
    }, []);

    useEffect(() => {
        // Try to focus immediately when component becomes visible
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, hasExistingPin]);

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

                toast("Device authorized!", "success");
                onSuccess();
            } else {
                toast("Incorrect PIN", "error");
                setPin('');
            }
        } catch (error: any) {
            toast("Verification failed", "error");
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
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-xl shadow-primary/30">
                        {hasExistingPin ? <KeyRound className="text-white" size={36} /> : <Shield className="text-white" size={36} />}
                    </div>
                    <h1 className="text-2xl font-black text-foreground tracking-tight">
                        {hasExistingPin ? "Enter Master PIN" : "Create Master PIN"}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {hasExistingPin
                            ? "Enter your PIN to authorize this device"
                            : "This PIN protects access to your business data"}
                    </p>
                </div>

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
                                    type="tel"
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
                                    className="w-full px-4 h-16 text-center text-2xl font-black tracking-[0.5em] bg-secondary/50 border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
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
                        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                            <Fingerprint size={18} className="text-primary" />
                            <p className="text-xs text-primary font-medium">
                                Fingerprint login available after PIN verification
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
