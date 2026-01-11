import { useState, useEffect, useCallback } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Cloud, Upload, Download, Loader2, FileJson, CheckCircle2, RefreshCw, AlertTriangle, ArrowRight, Database, ChevronDown, ChevronUp, LogIn } from "lucide-react";
import { Button } from "./ui/Button";
import { useToast } from "./toast-provider";
import { uploadToDrive, listBackups, downloadFile } from "../lib/drive";
import { exportData, importData, getBackupStats, getCurrentStats } from "../lib/backup";
import { Modal } from "./ui/Modal";
import { cn } from "../lib/utils";
import {
    exchangeCodeForTokens,
    refreshAccessToken,
    revokeTokens,
    getStoredToken,
    isAccessTokenValid,
    hasRefreshToken,
    isTokenExpiringSoon,
    clearAllTokens,
    storeAccessToken
} from "../lib/googleOAuth";

// Token storage keys (for backward compatibility check)
const TOKEN_KEY = 'vishnu_gdrive_token';
const TOKEN_EXPIRY_KEY = 'vishnu_gdrive_token_expiry';

// Legacy token validation (for old users who haven't upgraded)
const isLegacyTokenValid = (): boolean => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!token || !expiryStr) return false;

    const expiry = parseInt(expiryStr, 10);
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < (expiry - bufferMs);
};

// Progress Modal Component
const ProgressModal = ({ isOpen, title, progress, status }: { isOpen: boolean; title: string; progress: number; status: string }) => {
    return (
        <Modal isOpen={isOpen} onClose={() => { }}>
            <div className="text-center space-y-6 py-4">
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto relative">
                    <Cloud className="w-8 h-8 text-blue-600 dark:text-blue-400 z-10" />
                    <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="3"
                            className="dark:stroke-neutral-800"
                        />
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth="3"
                            strokeDasharray={`${progress}, 100`}
                            className="transition-all duration-300 ease-out"
                        />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground animate-pulse">{status}</p>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                    <div
                        className="bg-blue-600 h-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <p className="text-xs font-mono text-muted-foreground">{progress}% Complete</p>
            </div>
        </Modal>
    );
};

// Restore Preview Modal
const RestorePreviewModal = ({ isOpen, onClose, onConfirm, currentStats, backupStats, backupName }: any) => {
    const [selected, setSelected] = useState<Record<string, boolean>>({
        transactions: true,
        customers: true,
        products: true,
        expenses: true,
        suppliers: true,
        accounts_payable: true
    });

    useEffect(() => {
        if (isOpen) {
            setSelected({
                transactions: true,
                customers: true,
                products: true,
                expenses: true,
                suppliers: true,
                accounts_payable: true
            });
        }
    }, [isOpen]);

    if (!currentStats || !backupStats) return null;

    const toggleAll = () => {
        const allSelected = Object.values(selected).every(Boolean);
        const newState = !allSelected;
        setSelected({
            transactions: newState,
            customers: newState,
            products: newState,
            expenses: newState,
            suppliers: newState,
            accounts_payable: newState
        });
    };

    const handleConfirm = () => {
        // Create excluded list from unchecked items
        const excluded = Object.entries(selected)
            .filter(([_, isSelected]) => !isSelected)
            .map(([key]) => key);
        onConfirm(excluded);
    };

    const StatRow = ({ id, label, current, backup }: any) => {
        const diff = backup - current;
        return (
            <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={selected[id]}
                        onChange={() => setSelected(prev => ({ ...prev, [id]: !prev[id] }))}
                        className="w-4 h-4 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="font-medium text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-neutral-500 line-through decoration-rose-500/50">{current}</span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <span className={cn(
                        "font-bold",
                        diff < 0 ? "text-rose-500" : diff > 0 ? "text-emerald-500" : "text-foreground"
                    )}>
                        {backup}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="space-y-4">
                <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500 mb-3">
                        <Database size={24} />
                    </div>
                    <h2 className="text-lg font-bold">Confirm Restore</h2>
                    <p className="text-xs text-muted-foreground">
                        Restoring <span className="font-semibold text-foreground">"{backupName}"</span>
                    </p>
                </div>

                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3 flex gap-3">
                    <AlertTriangle className="text-rose-600 dark:text-rose-400 shrink-0" size={18} />
                    <div className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                        <span className="font-bold">Warning:</span> Overwrites current data.
                        <br />Uncheck items you want to keep as-is (SKIP restore).
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 pb-2 border-b border-border">
                        <div className="flex items-center gap-3">
                            <button onClick={toggleAll} className="hover:text-primary underline">
                                {Object.values(selected).every(Boolean) ? "Deselect All" : "Select All"}
                            </button>
                        </div>
                        <span>Change</span>
                    </div>
                    <StatRow id="transactions" label="Sales" current={currentStats.transactions} backup={backupStats.transactions} />
                    <StatRow id="customers" label="Customers" current={currentStats.customers} backup={backupStats.customers} />
                    <StatRow id="products" label="Products" current={currentStats.products} backup={backupStats.products} />
                    <StatRow id="expenses" label="Expenses" current={currentStats.expenses} backup={backupStats.expenses} />
                    <StatRow id="suppliers" label="Suppliers" current={currentStats.suppliers} backup={backupStats.suppliers} />
                    <StatRow id="accounts_payable" label="Payables" current={currentStats.accounts_payable} backup={backupStats.accounts_payable} />
                </div>

                <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
                    <Button className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold" onClick={handleConfirm}>
                        Restore Selected
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export function GoogleDriveBackup() {
    const { toast } = useToast();
    const [token, setToken] = useState<string | null>(() => {
        // Check for valid token (new flow or legacy)
        if (isAccessTokenValid() || isLegacyTokenValid()) {
            return getStoredToken();
        }
        return null;
    });
    const [isLoading, setIsLoading] = useState(false);
    const [backups, setBackups] = useState<any[]>([]);
    const [showBackups, setShowBackups] = useState(false);
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(false);
    const [tokenExpiringSoon, setTokenExpiringSoon] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPersistentConnection, setIsPersistentConnection] = useState(hasRefreshToken());

    // Progress State
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState("");
    const [showProgress, setShowProgress] = useState(false);

    // Restore Preview State
    const [restorePreview, setRestorePreview] = useState<{
        isOpen: boolean;
        backupName: string;
        currentStats: any;
        backupStats: any;
        fileData: any;
    }>({
        isOpen: false,
        backupName: "",
        currentStats: null,
        backupStats: null,
        fileData: null
    });

    // Load Auto Backup Config
    useEffect(() => {
        const configStr = localStorage.getItem('vishnu_backup_config');
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                setIsAutoBackupEnabled(config.enabled || false);
            } catch (e) {
                console.error("Failed to parse backup config", e);
            }
        }
    }, []);

    const toggleAutoBackup = () => {
        const newState = !isAutoBackupEnabled;
        setIsAutoBackupEnabled(newState);
        localStorage.setItem('vishnu_backup_config', JSON.stringify({ enabled: newState }));

        if (newState) {
            localStorage.setItem('vishnu_last_auto_backup', new Date().toDateString());
        }

        toast(newState ? "Daily auto-backup enabled" : "Auto-backup disabled", "success");
    };

    // Handle token refresh and expiry checking
    useEffect(() => {
        const checkAndRefreshToken = async () => {
            // If we have a refresh token and access token is expiring soon, auto-refresh
            if (hasRefreshToken() && isTokenExpiringSoon()) {
                setIsRefreshing(true);
                try {
                    const result = await refreshAccessToken();
                    setToken(result.access_token);
                    setTokenExpiringSoon(false);
                    console.log("Token auto-refreshed successfully");
                } catch (e) {
                    console.error("Auto-refresh failed:", e);
                    // If refresh fails, clear everything
                    handleDisconnect(false);
                }
                setIsRefreshing(false);
            } else if (!hasRefreshToken() && token && !isAccessTokenValid() && !isLegacyTokenValid()) {
                // Legacy flow: token expired and no refresh token
                handleDisconnect(true);
            }

            // Update expiring soon state
            if (token) {
                setTokenExpiringSoon(isTokenExpiringSoon() && !hasRefreshToken());
            }
        };

        checkAndRefreshToken();
        const interval = setInterval(checkAndRefreshToken, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [token]);

    // Authorization Code Flow login (for persistent connection)
    const loginWithAuthCode = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setIsLoading(true);
            try {
                // Exchange code for tokens via Edge Function
                const redirectUri = window.location.origin;
                const result = await exchangeCodeForTokens(codeResponse.code, redirectUri);
                setToken(result.access_token);
                setIsPersistentConnection(true);
                setTokenExpiringSoon(false);
                toast("Connected to Google Drive (persistent)", "success");
                fetchBackups(result.access_token);
            } catch (e) {
                console.error("Token exchange failed:", e);
                toast("Failed to connect: " + (e as Error).message, "error");
            }
            setIsLoading(false);
        },
        onError: () => toast("Login Failed", "error"),
        scope: 'https://www.googleapis.com/auth/drive.file',
    });

    // Implicit Flow login (fallback for quick connection)
    const loginImplicit = useGoogleLogin({
        onSuccess: (codeResponse) => {
            const expiresIn = codeResponse.expires_in || 3600;
            storeAccessToken(codeResponse.access_token, expiresIn);
            setToken(codeResponse.access_token);
            setIsPersistentConnection(false);
            setTokenExpiringSoon(false);
            toast("Connected to Google Drive", "success");
            fetchBackups(codeResponse.access_token);
        },
        onError: () => toast("Login Failed", "error"),
        scope: 'https://www.googleapis.com/auth/drive.file'
    });

    const handleDisconnect = useCallback(async (showToast: boolean = true) => {
        if (hasRefreshToken()) {
            await revokeTokens();
        } else {
            clearAllTokens();
        }
        setToken(null);
        setIsPersistentConnection(false);
        setTokenExpiringSoon(false);
        setBackups([]);
        if (showToast) {
            toast("Disconnected from Google Drive", "info");
        }
    }, [toast]);

    // Get a valid access token (refreshes if needed)
    const ensureValidToken = async (): Promise<string | null> => {
        // If current token is valid, return it
        if (isAccessTokenValid() || isLegacyTokenValid()) {
            return getStoredToken();
        }

        // Try to refresh if we have a refresh token
        if (hasRefreshToken()) {
            try {
                setIsRefreshing(true);
                const result = await refreshAccessToken();
                setToken(result.access_token);
                setIsRefreshing(false);
                return result.access_token;
            } catch (e) {
                console.error("Token refresh failed:", e);
                setIsRefreshing(false);
                handleDisconnect(false);
                toast("Session expired. Please reconnect.", "warning");
                return null;
            }
        }

        // No valid token and no refresh token
        toast("Session expired. Please reconnect.", "warning");
        handleDisconnect(false);
        return null;
    };

    const fetchBackups = async (accessToken: string) => {
        setIsLoading(true);
        try {
            const data = await listBackups(accessToken);
            setBackups((data.files || []).slice(0, 5));
        } catch (e) {
            console.error(e);
            const errorStr = String(e).toLowerCase();
            if (errorStr.includes('401') || errorStr.includes('auth') || errorStr.includes('invalid_token') || errorStr.includes('expired')) {
                // Try to refresh token
                if (hasRefreshToken()) {
                    try {
                        const result = await refreshAccessToken();
                        setToken(result.access_token);
                        // Retry the fetch
                        const retryData = await listBackups(result.access_token);
                        setBackups((retryData.files || []).slice(0, 5));
                    } catch (refreshError) {
                        handleDisconnect(false);
                        toast("Session expired. Please reconnect.", "warning");
                    }
                } else {
                    handleDisconnect(false);
                    toast("Session expired. Please reconnect.", "warning");
                }
            } else {
                console.error("Backup listing error:", e);
                toast("Failed to fetch backups: " + (e as Error).message, "error");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-fetch on mount if token exists
    useEffect(() => {
        const initFetch = async () => {
            const validToken = await ensureValidToken();
            if (validToken) {
                fetchBackups(validToken);
            }
        };
        if (token || hasRefreshToken()) {
            initFetch();
        }
    }, []);

    const handleBackup = async () => {
        const validToken = await ensureValidToken();
        if (!validToken) return;

        setShowProgress(true);
        setProgress(0);
        setProgressStatus("Preparing data...");

        try {
            const data = await exportData((p) => {
                setProgress(Math.round(p * 0.9));
                setProgressStatus(`Backing up data... ${Math.round(p)}%`);
            });

            setProgress(90);
            setProgressStatus("Uploading to Drive...");
            const fileName = `vishnu_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            await uploadToDrive(validToken, fileName, data);

            setProgress(100);
            setProgressStatus("Complete!");
            toast("Backup successful!", "success");

            setTimeout(() => {
                setShowProgress(false);
                fetchBackups(validToken);
            }, 1000);

        } catch (e) {
            console.error(e);
            const errorStr = String(e).toLowerCase();
            if (errorStr.includes('401') || errorStr.includes('auth') || errorStr.includes('expired')) {
                // Try refresh and retry
                if (hasRefreshToken()) {
                    try {
                        const newToken = await refreshAccessToken();
                        setToken(newToken.access_token);
                        toast("Token refreshed. Please try again.", "info");
                    } catch {
                        handleDisconnect(false);
                        toast("Session expired. Please reconnect.", "warning");
                    }
                } else {
                    handleDisconnect(false);
                    toast("Session expired. Please reconnect.", "warning");
                }
            } else {
                toast("Backup failed: " + (e as Error).message, "error");
            }
            setShowProgress(false);
        }
    };

    const handleRestoreClick = async (fileId: string, fileName: string) => {
        const validToken = await ensureValidToken();
        if (!validToken) return;

        setShowProgress(true);
        setProgress(0);
        setProgressStatus("Downloading backup...");

        try {
            const interval = setInterval(() => {
                setProgress(p => p < 90 ? p + 5 : p);
            }, 150);

            const file = await downloadFile(validToken, fileId);
            clearInterval(interval);
            setProgress(100);

            setProgressStatus("Analyzing backup...");
            const jsonString = JSON.stringify(file);
            const backupStats = getBackupStats(jsonString);
            const currentStats = await getCurrentStats();

            setShowProgress(false);

            if (backupStats) {
                setRestorePreview({
                    isOpen: true,
                    backupName: fileName,
                    currentStats,
                    backupStats,
                    fileData: jsonString
                });
            } else {
                toast("Invalid backup file", "error");
            }

        } catch (e) {
            console.error(e);
            const errorStr = String(e).toLowerCase();
            if (errorStr.includes('401') || errorStr.includes('auth') || errorStr.includes('expired')) {
                if (hasRefreshToken()) {
                    try {
                        await refreshAccessToken();
                        toast("Token refreshed. Please try again.", "info");
                    } catch {
                        handleDisconnect(false);
                        toast("Session expired. Please reconnect.", "warning");
                    }
                } else {
                    handleDisconnect(false);
                    toast("Session expired. Please reconnect.", "warning");
                }
            } else {
                toast("Failed to download backup: " + (e as Error).message, "error");
            }
            setShowProgress(false);
        }
    };

    const confirmRestore = async (excludedTables: string[]) => {
        if (!restorePreview.fileData) return;
        setRestorePreview(prev => ({ ...prev, isOpen: false }));

        setShowProgress(true);
        setProgress(0);
        setProgressStatus("Restoring database...");

        try {
            await importData(restorePreview.fileData, (p) => {
                setProgress(p);
                setProgressStatus(`Restoring... ${p}%`);
            }, excludedTables);

            setProgress(100);
            setProgressStatus("Restore Complete!");
            toast("Restore complete! Reloading...", "success");

            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            console.error(e);
            toast("Restore failed: " + String(e), "error");
            setShowProgress(false);
        }
    };


    if (!token && !hasRefreshToken()) {
        return (
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full">
                    <Cloud size={32} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-foreground">Google Drive Backup</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                        Connect your Google Drive to keep your business data safe.
                    </p>
                </div>
                <div className="w-full max-w-xs space-y-2">
                    <Button
                        onClick={() => loginWithAuthCode()}
                        className="font-bold bg-blue-600 hover:bg-blue-700 text-white w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                        Connect (Stay Signed In)
                    </Button>
                    <button
                        onClick={() => loginImplicit()}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                        Quick connect (expires in 1 hour)
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Status Card */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-xl",
                            isPersistentConnection
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        )}>
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-foreground">
                                {isPersistentConnection ? "Drive Connected" : "Drive Connected (Temporary)"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {isPersistentConnection
                                    ? `${backups.length} backups • Auto-renewing`
                                    : `${backups.length} backups • Expires soon`}
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDisconnect()}>
                        Disconnect
                    </Button>
                </div>

                {/* Upgrade to persistent connection banner */}
                {!isPersistentConnection && (
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-4 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg">
                                <RefreshCw size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Upgrade Connection</p>
                                <p className="text-[10px] text-blue-600 dark:text-blue-400">
                                    Stay signed in permanently
                                </p>
                            </div>
                        </div>
                        <Button size="sm" onClick={() => loginWithAuthCode()} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold h-8 px-3">
                            <LogIn size={14} className="mr-1.5" /> Upgrade
                        </Button>
                    </div>
                )}

                {/* Token refreshing indicator */}
                {isRefreshing && (
                    <div className="flex items-center gap-2 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-4 border border-neutral-100 dark:border-neutral-800">
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Refreshing connection...</span>
                    </div>
                )}

                {/* Token expiring soon warning (only for non-persistent) */}
                {tokenExpiringSoon && !isPersistentConnection && (
                    <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-4 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg">
                                <AlertTriangle size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Session Expiring Soon</p>
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                    Reconnect to continue using backup
                                </p>
                            </div>
                        </div>
                        <Button size="sm" onClick={() => loginWithAuthCode()} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold h-8 px-3">
                            <LogIn size={14} className="mr-1.5" /> Refresh
                        </Button>
                    </div>
                )}

                {/* Regular Backup Toggle */}
                <div
                    onClick={toggleAutoBackup}
                    className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-4 border border-neutral-100 dark:border-neutral-800 cursor-pointer active:scale-[0.98] transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg">
                            <RefreshCw size={18} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Regular Daily Backup</p>
                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                Automatically back up when you open the app
                            </p>
                        </div>
                    </div>
                    <div
                        className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            isAutoBackupEnabled
                                ? "border-primary bg-primary"
                                : "border-neutral-300 dark:border-neutral-600 bg-transparent"
                        )}
                    >
                        {isAutoBackupEnabled && <div className="w-2.5 h-2.5 rounded-full bg-white animate-in zoom-in-50" />}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        onClick={handleBackup}
                        disabled={showProgress || isRefreshing}
                        className="flex-1 h-12 sm:h-11 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 font-semibold shadow-sm transition-all active:scale-[0.98]"
                    >
                        {showProgress ? <Loader2 className="animate-spin mr-2" size={18} /> : <Upload className="mr-2" size={18} />}
                        Manual Backup
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowBackups(!showBackups)}
                        className="flex-1 h-12 sm:h-11 font-medium border-neutral-200 dark:border-neutral-700 bg-white dark:bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-all active:scale-[0.98]"
                    >
                        {showBackups ? (
                            <>
                                Hide Backups <ChevronUp size={16} className="ml-2" />
                            </>
                        ) : (
                            <>
                                View Backups <ChevronDown size={16} className="ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Backups List */}
            {showBackups && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center px-1">
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">Available Backups</h4>
                        <button onClick={() => token && fetchBackups(token)} className="p-1 text-muted-foreground hover:text-primary transition">
                            <RefreshCw size={14} className={cn(isLoading && "animate-spin")} />
                        </button>
                    </div>

                    {backups.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border/50 rounded-xl">
                            No backups found in Drive.
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {backups.map(file => (
                                <div key={file.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl hover:border-primary/30 transition-colors group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2 bg-accent rounded-lg text-muted-foreground">
                                            <FileJson size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-foreground truncate">{file.name}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {new Date(file.createdTime).toLocaleString()} • {(parseInt(file.size) / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRestoreClick(file.id, file.name)}
                                        className="h-8 text-xs font-bold border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/20"
                                    >
                                        <Download size={12} className="mr-1.5" /> Restore
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <ProgressModal
                isOpen={showProgress}
                title={progressStatus}
                progress={progress}
                status={progress < 100 ? "Please wait..." : "Done!"}
            />

            <RestorePreviewModal
                isOpen={restorePreview.isOpen}
                onClose={() => setRestorePreview(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmRestore}
                backupName={restorePreview.backupName}
                currentStats={restorePreview.currentStats}
                backupStats={restorePreview.backupStats}
            />
        </div>
    );
}
