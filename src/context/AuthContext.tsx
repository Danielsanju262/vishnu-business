import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/toast-provider';
import { supabase } from '../lib/supabase';

// Helper to encode ArrayBuffer to Base64URL string
const bufferToBase64url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// Helper to decode Base64URL string to ArrayBuffer
const base64urlToBuffer = (base64url: string) => {
    const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

// Random challenge generator for WebAuthn
const getChallenge = () => {
    return Uint8Array.from(window.crypto.getRandomValues(new Uint8Array(32)));
};

// Generate a unique device ID
const getDeviceId = () => {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
};

// Get device name for display
const getDeviceName = () => {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac';
    return 'Unknown Device';
};

interface AuthorizedDevice {
    id: string;
    device_id: string;
    device_name: string;
    fingerprint_enabled: boolean;
    verified_pin_version: number;
    created_at: string;
}

interface AuthContextType {
    isLocked: boolean;
    hasBiometrics: boolean;
    canEnableBiometrics: boolean;
    authorizedDevices: AuthorizedDevice[];
    registerBiometrics: () => Promise<boolean>;
    authenticate: () => Promise<boolean>;
    authenticateMasterPin: (pin: string) => Promise<boolean>;
    disableBiometrics: () => void;
    revokeDeviceFingerprint: (deviceId: string) => Promise<boolean>;
    lockApp: () => void;
    refreshDevices: () => Promise<void>;
    currentPinVersion: number;
    devicePinVersion: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { toast } = useToast();
    const [isLocked, setIsLocked] = useState(false);
    const [hasBiometrics, setHasBiometrics] = useState(false);
    const [canEnableBiometrics, setCanEnableBiometrics] = useState(false);
    const [authorizedDevices, setAuthorizedDevices] = useState<AuthorizedDevice[]>([]);
    const [currentPinVersion, setCurrentPinVersion] = useState(1);
    const [devicePinVersion, setDevicePinVersion] = useState(0);

    const deviceId = getDeviceId();

    // Check PIN version and biometrics status
    const checkAuthStatus = useCallback(async () => {
        try {
            // Get current PIN version from server (handle if column doesn't exist)
            let serverPinVersion = 1;
            try {
                const { data: settings } = await supabase
                    .from('app_settings')
                    .select('pin_version')
                    .eq('id', 1)
                    .single();
                serverPinVersion = settings?.pin_version || 1;
            } catch {
                // pin_version column might not exist yet, use default
                serverPinVersion = 1;
            }
            setCurrentPinVersion(serverPinVersion);

            // Get device's verified PIN version from localStorage
            const localPinVersion = parseInt(localStorage.getItem('verified_pin_version') || '0');
            setDevicePinVersion(localPinVersion);

            // Check if biometrics are set up on this device
            const savedCredId = localStorage.getItem('bio_credential_id');
            const wasLocked = localStorage.getItem('app_locked') === 'true';

            // Device can only use biometrics if it has verified the current PIN version
            const isPinVerified = localPinVersion >= serverPinVersion;
            setCanEnableBiometrics(isPinVerified);

            if (savedCredId && isPinVerified) {
                setHasBiometrics(true);
                if (wasLocked) {
                    setIsLocked(true);
                }
            } else if (savedCredId && !isPinVerified) {
                // Biometrics exist but PIN version mismatch - disable until re-verified
                setHasBiometrics(false);
            }
        } catch (error) {
            console.error('Auth status check failed:', error);
        }
    }, []);

    // Refresh authorized devices list
    const refreshDevices = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('authorized_devices')
                .select('*')
                .order('created_at', { ascending: false });

            if (data) {
                setAuthorizedDevices(data);
            }
        } catch (error) {
            console.error('Failed to fetch devices:', error);
        }
    }, []);

    useEffect(() => {
        checkAuthStatus();
        refreshDevices();
    }, [checkAuthStatus, refreshDevices]);

    const lockApp = () => {
        localStorage.setItem('app_locked', 'true');
        setIsLocked(true);
        toast("App Locked", "success");
    };

    // Register or update this device in the database
    const registerDevice = async (fingerprintEnabled: boolean, pinVersion: number) => {
        try {
            await supabase
                .from('authorized_devices')
                .upsert({
                    device_id: deviceId,
                    device_name: getDeviceName(),
                    fingerprint_enabled: fingerprintEnabled,
                    verified_pin_version: pinVersion,
                    last_pin_verified_at: new Date().toISOString()
                }, { onConflict: 'device_id' });

            await refreshDevices();
        } catch (error) {
            console.error('Failed to register device:', error);
        }
    };

    const registerBiometrics = async () => {
        // Check if device has verified current PIN version
        const localPinVersion = parseInt(localStorage.getItem('verified_pin_version') || '0');
        if (localPinVersion < currentPinVersion) {
            toast("Please verify Master PIN first", "error");
            return false;
        }

        try {
            if (!window.PublicKeyCredential) {
                toast("Biometrics not supported", "error");
                return false;
            }

            const publicKey: PublicKeyCredentialCreationOptions = {
                challenge: getChallenge(),
                rp: { name: "Vishnu Business", id: window.location.hostname },
                user: {
                    id: Uint8Array.from("USER_ID", c => c.charCodeAt(0)),
                    name: "admin@vishnubusiness",
                    displayName: "Business Admin"
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required",
                    residentKey: "preferred",
                    requireResidentKey: false
                },
                timeout: 60000,
                attestation: "none"
            };

            const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;

            if (credential) {
                const credentialId = bufferToBase64url(credential.rawId);
                localStorage.setItem('bio_credential_id', credentialId);
                localStorage.removeItem('app_locked');
                setHasBiometrics(true);
                setIsLocked(false);

                // Register device with fingerprint enabled
                await registerDevice(true, currentPinVersion);

                toast("Biometrics Enabled!", "success");
                return true;
            }
        } catch (error: any) {
            console.error(error);
            if (error.name === 'NotAllowedError') {
                toast("Setup Canceled", "info");
            } else {
                toast("Setup failed", "error");
            }
        }
        return false;
    };

    const authenticate = async () => {
        // Check PIN version before allowing biometric auth
        const localPinVersion = parseInt(localStorage.getItem('verified_pin_version') || '0');
        if (localPinVersion < currentPinVersion) {
            toast("PIN updated. Please enter new PIN.", "info");
            return false;
        }

        try {
            const savedId = localStorage.getItem('bio_credential_id');
            if (!savedId) return false;

            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: getChallenge(),
                    rpId: window.location.hostname,
                    userVerification: "required",
                    allowCredentials: [{
                        type: 'public-key',
                        id: base64urlToBuffer(savedId),
                        transports: ['internal']
                    }]
                }
            });

            if (credential) {
                localStorage.removeItem('app_locked');
                setIsLocked(false);
                toast("Unlocked!", "success");
                return true;
            }
        } catch (error: any) {
            console.error(error);
        }
        return false;
    };

    // Use Master PIN from Supabase to unlock
    const authenticateMasterPin = async (pin: string) => {
        try {
            // Only select master_pin to avoid errors if pin_version doesn't exist
            const { data, error } = await supabase
                .from('app_settings')
                .select('master_pin')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data?.master_pin === pin) {
                // Use current pin version from state (already fetched on load)
                const serverPinVersion = currentPinVersion;

                // Update local PIN version
                localStorage.setItem('verified_pin_version', serverPinVersion.toString());
                setDevicePinVersion(serverPinVersion);
                setCanEnableBiometrics(true);

                localStorage.removeItem('app_locked');
                setIsLocked(false);

                // Register/update device
                const hasCredential = !!localStorage.getItem('bio_credential_id');
                await registerDevice(hasCredential, serverPinVersion);

                // Re-enable biometrics if credential exists
                if (hasCredential) {
                    setHasBiometrics(true);
                }

                toast("Unlocked!", "success");
                return true;
            } else {
                toast("Incorrect PIN", "error");
                return false;
            }
        } catch (error) {
            console.error('PIN verification error:', error);
            toast("Error verifying PIN", "error");
            return false;
        }
    };

    const disableBiometrics = async () => {
        localStorage.removeItem('bio_credential_id');
        localStorage.removeItem('app_locked');
        setHasBiometrics(false);
        setIsLocked(false);

        // Update device in database
        await registerDevice(false, devicePinVersion);

        toast("Biometrics Disabled", "success");
    };

    // Revoke fingerprint access for a specific device
    const revokeDeviceFingerprint = async (targetDeviceId: string) => {
        try {
            await supabase
                .from('authorized_devices')
                .update({
                    fingerprint_enabled: false,
                    verified_pin_version: 0 // Force re-verification
                })
                .eq('device_id', targetDeviceId);

            // If revoking current device, disable locally too
            if (targetDeviceId === deviceId) {
                localStorage.removeItem('bio_credential_id');
                localStorage.removeItem('verified_pin_version');
                setHasBiometrics(false);
                setCanEnableBiometrics(false);
                setDevicePinVersion(0);
            }

            await refreshDevices();
            toast("Fingerprint access revoked", "success");
            return true;
        } catch (error) {
            console.error('Failed to revoke fingerprint:', error);
            toast("Failed to revoke access", "error");
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{
            isLocked,
            hasBiometrics,
            canEnableBiometrics,
            authorizedDevices,
            registerBiometrics,
            authenticate,
            authenticateMasterPin,
            disableBiometrics,
            revokeDeviceFingerprint,
            lockApp,
            refreshDevices,
            currentPinVersion,
            devicePinVersion
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
