import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '../components/toast-provider';

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

// Random challenge generator for WebAuthn (Client-side usage)
const getChallenge = () => {
    return Uint8Array.from(window.crypto.getRandomValues(new Uint8Array(32)));
};

interface AuthContextType {
    isLocked: boolean;
    isEnabled: boolean;
    isAuthenticated: boolean;
    hasPin: boolean;
    hasBiometrics: boolean;
    registerBiometrics: () => Promise<boolean>;
    registerPin: (pin: string) => void;
    authenticate: () => Promise<boolean>;
    authenticatePin: (pin: string) => boolean;
    disableLock: () => void;
    lockApp: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { toast } = useToast();
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [hasPin, setHasPin] = useState(false);
    const [hasBiometrics, setHasBiometrics] = useState(false);

    useEffect(() => {
        // Init State
        const savedCredId = localStorage.getItem('bio_credential_id');
        const storedPin = localStorage.getItem('app_pin');
        const sessionAuth = localStorage.getItem('is_authenticated');

        if (savedCredId || storedPin) {
            setIsEnabled(true);
            setHasPin(!!storedPin);
            setHasBiometrics(!!savedCredId);

            if (sessionAuth === 'true') {
                setIsLocked(false);
                setIsAuthenticated(true);
            } else {
                setIsLocked(true);
            }
        }
    }, []);

    const lockApp = () => {
        if (isEnabled) {
            localStorage.removeItem('is_authenticated');
            setIsLocked(true);
            setIsAuthenticated(false);
            toast("App Locked", "success");
        }
    };

    const registerPin = (pin: string) => {
        localStorage.setItem('app_pin', pin);
        localStorage.setItem('is_authenticated', 'true');
        setHasPin(true);
        setIsEnabled(true);
        setIsAuthenticated(true);
        setIsLocked(false);
        toast("PIN Security Enabled", "success");
    };

    const authenticatePin = (pin: string) => {
        const storedPin = localStorage.getItem('app_pin');
        if (storedPin === pin) {
            localStorage.setItem('is_authenticated', 'true');
            setIsLocked(false);
            setIsAuthenticated(true);
            toast("Unlocked", "success");
            return true;
        }
        return false;
    };

    const registerBiometrics = async () => {
        try {
            // Check if available
            if (!window.PublicKeyCredential) {
                toast("Biometrics not supported", "error");
                return false;
            }

            // Create credential options
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
                    authenticatorAttachment: "platform", // Forces built-in (TouchID, Windows Hello)
                    userVerification: "required", // Forces PIN/Biometric
                    residentKey: "preferred",
                    requireResidentKey: false
                },
                timeout: 60000,
                attestation: "none"
            };

            const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;

            if (credential) {
                // Store the ID safely
                const credentialId = bufferToBase64url(credential.rawId);
                localStorage.setItem('bio_credential_id', credentialId);

                setHasBiometrics(true);
                setIsEnabled(true);
                setIsAuthenticated(true);
                setIsLocked(false);
                toast("Device Security Linked!", "success");
                return true;
            }
        } catch (error: any) {
            console.error(error);
            if (error.name === 'NotAllowedError') {
                toast("Setup Canceled", "info");
            } else {
                toast("Setup failed. Try using HTTPS.", "error");
            }
        }
        return false;
    };

    const authenticate = async () => {
        try {
            const savedId = localStorage.getItem('bio_credential_id');
            if (!savedId) return false;

            // Verify platform credential
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
                setIsLocked(false);
                setIsAuthenticated(true);
                toast("Welcome back!", "success");
                return true;
            }
        } catch (error: any) {
            console.error(error);
            // Don't show error toast on simple cancellation, just stay locked
        }
        return false;
    };

    const disableLock = () => {
        if (isAuthenticated) {
            localStorage.removeItem('bio_credential_id');
            localStorage.removeItem('app_pin');
            localStorage.removeItem('is_authenticated');
            setIsEnabled(false);
            setIsLocked(false);
            setHasPin(false);
            setHasBiometrics(false);
            toast("Security Disabled", "success");
        }
    };

    return (
        <AuthContext.Provider value={{ isLocked, isEnabled, isAuthenticated, hasPin, hasBiometrics, registerBiometrics, registerPin, authenticate, authenticatePin, disableLock, lockApp }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
