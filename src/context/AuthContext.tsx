import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/toast-provider';
import { supabase } from '../lib/supabase';
import { showSecurityAlertNotification } from '../lib/nativeNotifications';

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
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const getDeviceId = () => {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = generateUUID();
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

export interface AuthorizedDevice {
    id: string;
    device_id: string;
    device_name: string;
    fingerprint_enabled: boolean;
    verified_pin_version: number;
    created_at: string;
    last_active_at?: string;

    last_pin_verified_at?: string;
}

// Internal helper for revocation
const clearLocalAuth = () => {
    localStorage.removeItem('bio_credential_id');
    localStorage.removeItem('verified_pin_version');
    localStorage.setItem('app_locked', 'true');
};

// Security bypass storage key - stores the expiration timestamp
const SECURITY_BYPASS_KEY = 'security_bypass_until';

// Helper to check if security bypass is active
const isSecurityBypassActive = (): boolean => {
    const bypassUntil = localStorage.getItem(SECURITY_BYPASS_KEY);
    if (!bypassUntil) return false;
    const expirationTime = parseInt(bypassUntil, 10);
    if (isNaN(expirationTime)) return false;
    return Date.now() < expirationTime;
};

// Helper to get remaining bypass time in days/hours
const getSecurityBypassRemaining = (): { days: number; hours: number; isActive: boolean } => {
    const bypassUntil = localStorage.getItem(SECURITY_BYPASS_KEY);
    if (!bypassUntil) return { days: 0, hours: 0, isActive: false };
    const expirationTime = parseInt(bypassUntil, 10);
    if (isNaN(expirationTime)) return { days: 0, hours: 0, isActive: false };
    const remaining = expirationTime - Date.now();
    if (remaining <= 0) return { days: 0, hours: 0, isActive: false };
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return { days, hours, isActive: true };
};

// Log login activity and check if device is authorized
// If not authorized, trigger a security alert notification
const logLoginActivity = async (
    deviceId: string,
    deviceName: string,
    loginMethod: 'master_pin' | 'super_admin_pin' | 'biometrics' | 'security_bypass'
): Promise<void> => {
    try {
        // Check if device is in authorized_devices table with fingerprint enabled
        const { data: deviceData } = await supabase
            .from('authorized_devices')
            .select('id, fingerprint_enabled')
            .eq('device_id', deviceId)
            .single();

        // Device is authorized if it exists AND has fingerprint enabled
        // (or if it's the device doing the login - we'll register it after)
        const isAuthorizedDevice = !!(deviceData && deviceData.fingerprint_enabled);

        // Log the login activity
        await supabase.from('login_activity').insert({
            device_id: deviceId,
            device_name: deviceName,
            login_method: loginMethod,
            is_authorized_device: isAuthorizedDevice
        });

        // If device is NOT authorized, send security alert to all devices
        if (!isAuthorizedDevice) {
            console.log('[Security] New device login detected:', deviceName);
            // Show notification (this will appear on device where login happened
            // and can be seen by user - for native devices with Capacitor)
            await showSecurityAlertNotification(deviceName);
        }
    } catch (error) {
        console.error('[Security] Failed to log login activity:', error);
    }
};


interface AuthContextType {
    isLocked: boolean;
    hasBiometrics: boolean;
    canEnableBiometrics: boolean;
    authorizedDevices: AuthorizedDevice[];
    registerBiometrics: () => Promise<boolean>;
    authenticate: () => Promise<boolean>;
    authenticateMasterPin: (pin: string) => Promise<boolean>;
    authenticateSuperAdmin: (pin: string) => Promise<boolean>;
    validateSuperAdminPin: (pin: string) => Promise<boolean>;
    disableBiometrics: () => void;
    revokeDeviceFingerprint: (deviceId: string, superAdminPin: string) => Promise<{ success: boolean; error?: string }>;
    changeMasterPin: (newPin: string, superAdminPin: string) => Promise<{ success: boolean; error?: string }>;
    lockApp: () => void;
    refreshDevices: () => Promise<void>;
    currentPinVersion: number;
    devicePinVersion: number;
    hasSuperAdminSetup: boolean;
    currentDeviceId: string;
    // Security bypass functions
    isSecurityBypassed: boolean;
    securityBypassRemaining: { days: number; hours: number; isActive: boolean };
    enableSecurityBypass: (superAdminPin: string) => Promise<{ success: boolean; error?: string }>;
    disableSecurityBypass: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { toast } = useToast();

    // Security bypass state
    const [isSecurityBypassed, setIsSecurityBypassed] = useState(isSecurityBypassActive);
    const [securityBypassRemaining, setSecurityBypassRemaining] = useState(getSecurityBypassRemaining);

    // Initialize state strictly based on SessionStorage (cleared on app close)
    // AND LocalStorage (persisted manual lock)
    // ALSO check for security bypass - if active, skip lock
    const [isLocked, setIsLocked] = useState(() => {
        // 0. If security bypass is active, never lock
        if (isSecurityBypassActive()) return false;

        // 1. If globally locked (manual lock from any tab), enforce it
        if (localStorage.getItem('app_locked') === 'true') return true;

        // 2. If session is active (app backgrounded/minimized but not closed), allow access
        if (sessionStorage.getItem('vb_session_active') === 'true') return false;

        // 3. Default: Locked (App was killed/swiped away or new tab)
        return true;
    });

    const [devicePinVersion, setDevicePinVersion] = useState(() => {
        return parseInt(localStorage.getItem('verified_pin_version') || '0');
    });

    const [hasBiometrics, setHasBiometrics] = useState(false);
    const [canEnableBiometrics, setCanEnableBiometrics] = useState(false);
    const [authorizedDevices, setAuthorizedDevices] = useState<AuthorizedDevice[]>([]);
    const [currentPinVersion, setCurrentPinVersion] = useState(1);
    const [hasSuperAdminSetup, setHasSuperAdminSetup] = useState(false);


    const deviceId = getDeviceId();

    // Force immediate local revocation and lock
    const revokeLocalBiometrics = useCallback((message: string = "Access revoked.") => {
        clearLocalAuth();
        sessionStorage.removeItem('vb_session_active'); // Clear session
        setHasBiometrics(false);
        setCanEnableBiometrics(false);
        setDevicePinVersion(0);
        setIsLocked(true);
        toast(message, "error");
    }, [toast]);

    // Check PIN version and biometrics status
    const checkAuthStatus = useCallback(async () => {
        try {
            // Get current App Settings (PIN version, etc)
            let serverPinVersion = 1;
            let hasSuperAdmin = false;
            try {
                const { data: settings } = await supabase
                    .from('app_settings')
                    .select('pin_version, super_admin_pin')
                    .eq('id', 1)
                    .single();
                serverPinVersion = settings?.pin_version || 1;
                hasSuperAdmin = !!settings?.super_admin_pin;

                // CRITICAL: If server PIN version is newer than what we know, update state immediately
                if (serverPinVersion > currentPinVersion) {
                    setCurrentPinVersion(serverPinVersion);
                }
            } catch {
                serverPinVersion = 1;
            }
            // Update state purely for UI consistency
            setCurrentPinVersion(serverPinVersion);
            setHasSuperAdminSetup(hasSuperAdmin);

            // Get device's locally verified PIN version
            const localPinVersion = parseInt(localStorage.getItem('verified_pin_version') || '0');
            setDevicePinVersion(localPinVersion);

            // IMMEDIATE SECURITY ENFORCEMENT
            // If the server PIN version is higher than our local version, we MUST consider this session invalid
            if (serverPinVersion > localPinVersion) {
                // Force Lock if not already locked
                if (!isLocked) {
                    setIsLocked(true);
                    // Don't toast if we are just loading, only if we were unlocked
                    if (localStorage.getItem('app_locked') !== 'true') {
                        toast("Security Update: Master PIN changed. Please sign in again.", "info");
                    }
                }
            }

            // Check device specific revocation
            if (deviceId) {
                const { data: deviceData } = await supabase
                    .from('authorized_devices')
                    .select('fingerprint_enabled')
                    .eq('device_id', deviceId)
                    .single();

                // If fingerprint was revoked remotely but we think we have it, disable it locally
                if (deviceData && !deviceData.fingerprint_enabled && hasBiometrics) {
                    revokeLocalBiometrics("Access revoked by administrator.");
                }
            }

            // Check if biometrics are set up on this device locally
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
    }, [currentPinVersion, deviceId, hasBiometrics, isLocked, toast]);

    // Refresh authorized devices list
    const refreshDevices = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('authorized_devices')
                .select('*')
                .order('last_active_at', { ascending: false });

            if (data) {
                // VISIBILITY RULE: The authorized view must ONLY show:
                // 1. Devices with Biometrics explicitly ENABLED
                // 2. The CURRENT device (even if PIN only) to allow management
                // All other historical/PIN-only devices must be hidden from the UI.
                const filtered = data.filter(d => d.fingerprint_enabled || d.device_id === deviceId);
                setAuthorizedDevices(filtered);
            }
        } catch (error) {
            console.error('Failed to fetch devices:', error);
        }
    }, [deviceId]);

    // Update device last active time
    const updateDeviceActivity = useCallback(async () => {
        try {
            await supabase
                .from('authorized_devices')
                .update({ last_active_at: new Date().toISOString() })
                .eq('device_id', deviceId);
        } catch (error) {
            console.error('Failed to update device activity:', error);
        }
    }, [deviceId]);

    useEffect(() => {
        checkAuthStatus();
        refreshDevices();

        // Update activity on load
        const isAuthorized = localStorage.getItem('device_authorized') === 'true';
        if (isAuthorized) {
            updateDeviceActivity();
        }
        // ... existing subscription code ...
    }, [checkAuthStatus, refreshDevices, updateDeviceActivity, deviceId, currentPinVersion, revokeLocalBiometrics]); // Re-add dependencies

    // Periodically check security bypass expiration
    useEffect(() => {
        const checkBypassExpiration = () => {
            const bypassActive = isSecurityBypassActive();
            const remaining = getSecurityBypassRemaining();

            setIsSecurityBypassed(bypassActive);
            setSecurityBypassRemaining(remaining);

            // If bypass just expired, lock the app
            if (!bypassActive && localStorage.getItem(SECURITY_BYPASS_KEY)) {
                localStorage.removeItem(SECURITY_BYPASS_KEY);
                setIsLocked(true);
                toast("Security bypass expired. Please authenticate.", "info");
            }
        };

        // Check immediately
        checkBypassExpiration();

        // Check every minute
        const interval = setInterval(checkBypassExpiration, 60 * 1000);
        return () => clearInterval(interval);
    }, [toast]);

    const lockApp = () => {
        sessionStorage.removeItem('vb_session_active'); // Kill session
        localStorage.setItem('app_locked', 'true');     // Sync other tabs
        setIsLocked(true);
        toast("App Locked", "success");
    };

    // Enable security bypass for 3 days (requires Super Admin PIN)
    const enableSecurityBypass = async (superAdminPin: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Validate Super Admin PIN
            const isValid = await validateSuperAdminPin(superAdminPin);
            if (!isValid) {
                return { success: false, error: 'Invalid Super Admin PIN' };
            }

            // Set bypass expiration to 3 days from now
            const expirationTime = Date.now() + (3 * 24 * 60 * 60 * 1000);
            localStorage.setItem(SECURITY_BYPASS_KEY, expirationTime.toString());

            // Update state
            setIsSecurityBypassed(true);
            setSecurityBypassRemaining(getSecurityBypassRemaining());

            // Unlock the app
            sessionStorage.setItem('vb_session_active', 'true');
            localStorage.setItem('app_locked', 'false');
            setIsLocked(false);

            toast("Security bypass enabled for 3 days!", "success");

            // Log login activity for security monitoring
            await logLoginActivity(deviceId, getDeviceName(), 'security_bypass');

            return { success: true };
        } catch (error) {
            console.error('Failed to enable security bypass:', error);
            return { success: false, error: 'Failed to enable security bypass' };
        }
    };

    // Disable security bypass (re-enable security)
    const disableSecurityBypass = () => {
        localStorage.removeItem(SECURITY_BYPASS_KEY);
        setIsSecurityBypassed(false);
        setSecurityBypassRemaining({ days: 0, hours: 0, isActive: false });

        // Lock the app
        sessionStorage.removeItem('vb_session_active');
        localStorage.setItem('app_locked', 'true');
        setIsLocked(true);

        toast("Security re-enabled. Please authenticate.", "success");
    };

    // Register or update this device in the database
    const registerDevice = async (fingerprintEnabled: boolean, pinVersion: number) => {
        try {
            // Always upsert to ensure current device is tracked as active
            await supabase
                .from('authorized_devices')
                .upsert({
                    device_id: deviceId,
                    device_name: getDeviceName(),
                    fingerprint_enabled: fingerprintEnabled,
                    verified_pin_version: pinVersion,
                    last_pin_verified_at: new Date().toISOString(),
                    last_active_at: new Date().toISOString()
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

    // Verify if this device is still authorized on the server
    const verifyDeviceStatus = async () => {
        try {
            const { data, error } = await supabase
                .from('authorized_devices')
                .select('fingerprint_enabled, verified_pin_version')
                .eq('device_id', deviceId)
                .single();

            if (error || !data) {
                // Device record missing or error
                return false;
            }

            // Check if fingerprint is explicitly disabled
            if (!data.fingerprint_enabled) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    };

    const authenticate = async () => {
        // 1. First Check: PIN Version Integrity
        const localPinVersion = parseInt(localStorage.getItem('verified_pin_version') || '0');
        if (localPinVersion < currentPinVersion) {
            toast("Security Update: Please log in using Master PIN", "info");
            return false;
        }

        try {
            const savedId = localStorage.getItem('bio_credential_id');
            if (!savedId) return false;

            // 2. Perform Biometric Challenge
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
                // 3. FINAL CRITICAL CHECK: Validate Server Authorization
                // Even if biometrics passed, we MUST check if the admin revoked access
                const isAuthorized = await verifyDeviceStatus();

                if (!isAuthorized) {
                    // Revoke local credentials immediately AND LOCK
                    // Previously using disableBiometrics() caused a bug where it unlocked the app
                    revokeLocalBiometrics("Biometric access has been revoked by the Super Admin. Please log in using Master PIN.");
                    return false;
                }

                // SUCCESS: Mark Session as Active
                sessionStorage.setItem('vb_session_active', 'true');
                localStorage.setItem('app_locked', 'false'); // Sync other tabs

                setIsLocked(false);

                // Update device activity
                await updateDeviceActivity();

                toast("Unlocked!", "success");

                // Log login activity for security monitoring
                await logLoginActivity(deviceId, getDeviceName(), 'biometrics');

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

                // SUCCESS: Mark Session as Active
                sessionStorage.setItem('vb_session_active', 'true');
                localStorage.setItem('app_locked', 'false'); // Sync other tabs

                setIsLocked(false);

                // Register/update device
                const hasCredential = !!localStorage.getItem('bio_credential_id');
                await registerDevice(hasCredential, serverPinVersion);

                // Re-enable biometrics if credential exists
                if (hasCredential) {
                    setHasBiometrics(true);
                }

                toast("Unlocked!", "success");

                // Log login activity for security monitoring
                await logLoginActivity(deviceId, getDeviceName(), 'master_pin');

                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('PIN verification error:', error);
            toast("Error verifying PIN", "error");
            return false;
        }
    };

    // Validate Super Admin PIN
    const validateSuperAdminPin = async (pin: string): Promise<boolean> => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('super_admin_pin')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            return data?.super_admin_pin === pin;
        } catch (error) {
            console.error('Super Admin PIN validation error:', error);
            return false;
        }
    };

    // Authenticate using Super Admin PIN (for emergency access / forgot password)
    const authenticateSuperAdmin = async (pin: string): Promise<boolean> => {
        try {
            // Validate Super Admin PIN
            const isValid = await validateSuperAdminPin(pin);
            if (!isValid) {
                return false;
            }

            // Use current pin version from state (already fetched on load)
            const serverPinVersion = currentPinVersion;

            // Update local PIN version
            localStorage.setItem('verified_pin_version', serverPinVersion.toString());
            setDevicePinVersion(serverPinVersion);
            setCanEnableBiometrics(true);

            // SUCCESS: Mark Session as Active
            sessionStorage.setItem('vb_session_active', 'true');
            localStorage.setItem('app_locked', 'false'); // Sync other tabs

            setIsLocked(false);

            // Register/update device (without biometrics)
            await registerDevice(false, serverPinVersion);

            toast("Unlocked with Super Admin PIN!", "success");

            // Log login activity for security monitoring
            await logLoginActivity(deviceId, getDeviceName(), 'super_admin_pin');

            return true;
        } catch (error) {
            console.error('Super Admin authentication error:', error);
            toast("Error verifying Super Admin PIN", "error");
            return false;
        }
    };

    // Change Master PIN (requires Super Admin PIN)
    const changeMasterPin = async (newPin: string, superAdminPin: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // First validate Super Admin PIN
            const isValidSuperAdmin = await validateSuperAdminPin(superAdminPin);
            if (!isValidSuperAdmin) {
                return { success: false, error: 'Invalid Super Admin PIN. Contact Super Admin for the correct PIN.' };
            }

            // Check against last 2 used PINs
            const pinHistoryStr = localStorage.getItem('pin_history');
            const pinHistory: string[] = pinHistoryStr ? JSON.parse(pinHistoryStr) : [];

            // Get current master PIN to add to history
            const { data: currentSettings } = await supabase
                .from('app_settings')
                .select('master_pin, pin_version')
                .eq('id', 1)
                .single();

            if (pinHistory.includes(newPin) || currentSettings?.master_pin === newPin) {
                return { success: false, error: 'Cannot reuse recent PINs. Please choose a different PIN.' };
            }

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

            // Invalidate all device fingerprints by resetting their verified_pin_version
            await supabase
                .from('authorized_devices')
                .update({
                    fingerprint_enabled: false,
                    verified_pin_version: 0
                })
                .neq('device_id', 'none'); // Update all devices

            // Update PIN history in localStorage (keep last 2)
            const updatedHistory = [...pinHistory, currentSettings?.master_pin].filter(Boolean).slice(-2);
            localStorage.setItem('pin_history', JSON.stringify(updatedHistory));

            // Update this device's verified version
            localStorage.setItem('verified_pin_version', newVersion.toString());
            setCurrentPinVersion(newVersion);

            // Disable biometrics on current device too
            localStorage.removeItem('bio_credential_id');
            setHasBiometrics(false);

            await refreshDevices();

            return { success: true };
        } catch (error) {
            console.error('Master PIN change failed:', error);
            return { success: false, error: 'Failed to update Master PIN. Please try again.' };
        }
    };

    const disableBiometrics = async () => {
        localStorage.removeItem('bio_credential_id');
        localStorage.removeItem('app_locked'); // Don't force lock, just clear
        // Don't kill session here, just removing biometrics
        setHasBiometrics(false);
        setIsLocked(false);

        // Update device in database
        await registerDevice(false, devicePinVersion);

        toast("Biometrics Disabled", "success");
    };

    // Revoke fingerprint access for a specific device (requires Super Admin PIN)
    const revokeDeviceFingerprint = async (targetDeviceId: string, superAdminPin: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // First validate Super Admin PIN
            const isValidSuperAdmin = await validateSuperAdminPin(superAdminPin);
            if (!isValidSuperAdmin) {
                return { success: false, error: 'Invalid Super Admin PIN. Only Super Admin can remove device access.' };
            }

            await supabase
                .from('authorized_devices')
                .delete()
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
            return { success: true };
        } catch (error) {
            console.error('Failed to revoke fingerprint:', error);
            return { success: false, error: 'Failed to revoke device access. Please try again.' };
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
            authenticateSuperAdmin,
            validateSuperAdminPin,
            disableBiometrics,
            revokeDeviceFingerprint,
            changeMasterPin,
            lockApp,
            refreshDevices,
            currentPinVersion,
            devicePinVersion,
            hasSuperAdminSetup,
            currentDeviceId: deviceId,
            // Security bypass
            isSecurityBypassed,
            securityBypassRemaining,
            enableSecurityBypass,
            disableSecurityBypass
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
