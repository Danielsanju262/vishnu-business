import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/toast-provider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Lock, Shield, Loader2, KeyRound } from 'lucide-react';

export default function MasterPinSetup({ onSuccess }: { onSuccess: () => void }) {
    const { toast } = useToast();
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasExistingPin, setHasExistingPin] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        checkExistingPin();
    }, []);

    const checkExistingPin = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('master_pin')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error(error);
            }

            setHasExistingPin(!!data?.master_pin);
        } catch (e) {
            console.error(e);
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
                .upsert({ id: 1, master_pin: pin });

            if (error) throw error;

            localStorage.setItem('device_authorized', 'true');
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
                .select('master_pin')
                .eq('id', 1)
                .single();

            if (error) throw error;

            if (data?.master_pin === pin) {
                localStorage.setItem('device_authorized', 'true');
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
                        <label className="text-sm font-medium text-foreground">
                            {hasExistingPin ? "Master PIN" : "Create PIN (4-6 digits)"}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <Input
                                type="password"
                                inputMode="numeric"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="••••••"
                                className="pl-10 h-14 text-center text-2xl font-black tracking-[0.5em]"
                                required
                                autoFocus
                            />
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
                <p className="text-xs text-center text-muted-foreground">
                    {hasExistingPin
                        ? "Once authorized, you can set up fingerprint for quick access"
                        : "Remember this PIN! You'll need it to access from new devices"}
                </p>
            </div>
        </div>
    );
}
