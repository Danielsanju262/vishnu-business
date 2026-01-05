import React, { createContext, useContext, useState, useEffect } from 'react';
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

interface AuthContextType {
    isLocked: boolean;
    hasBiometrics: boolean;
    registerBiometrics: () => Promise<boolean>;
    authenticate: () => Promise<boolean>;
    authenticateMasterPin: (pin: string) => Promise<boolean>;
    disableBiometrics: () => void;
    lockApp: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { toast } = useToast();
    const [isLocked, setIsLocked] = useState(false);
    const [hasBiometrics, setHasBiometrics] = useState(false);

    useEffect(() => {
        // Check if biometrics are set up on this device
        const savedCredId = localStorage.getItem('bio_credential_id');
        const wasLocked = localStorage.getItem('app_locked') === 'true';

        if (savedCredId) {
            setHasBiometrics(true);
            // Only show lock screen if explicitly locked (not on refresh)
            if (wasLocked) {
                setIsLocked(true);
            }
        }
    }, []);

    const lockApp = () => {
        localStorage.setItem('app_locked', 'true');
        setIsLocked(true);
        toast("App Locked", "success");
    };

    const registerBiometrics = async () => {
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
                localStorage.removeItem('app_locked'); // Unlock after setup
                setHasBiometrics(true);
                setIsLocked(false);
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
            const { data, error } = await supabase
                .from('app_settings')
                .select('master_pin')
                .eq('id', 1)
                .single();

            if (error) throw error;

            if (data?.master_pin === pin) {
                localStorage.removeItem('app_locked');
                setIsLocked(false);
                toast("Unlocked!", "success");
                return true;
            } else {
                toast("Incorrect PIN", "error");
                return false;
            }
        } catch (error) {
            toast("Error verifying PIN", "error");
            return false;
        }
    };

    const disableBiometrics = () => {
        localStorage.removeItem('bio_credential_id');
        localStorage.removeItem('app_locked');
        setHasBiometrics(false);
        setIsLocked(false);
        toast("Biometrics Disabled", "success");
    };

    return (
        <AuthContext.Provider value={{
            isLocked,
            hasBiometrics,
            registerBiometrics,
            authenticate,
            authenticateMasterPin,
            disableBiometrics,
            lockApp
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
