import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Cloud, Upload, Download, Loader2, FileJson, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";
import { useToast } from "./toast-provider";
import { uploadToDrive, listBackups, downloadFile } from "../lib/drive";
import { exportData, importData } from "../lib/backup";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import { cn } from "../lib/utils";

export function GoogleDriveBackup() {
    const { toast } = useToast();
    const [token, setToken] = useState<string | null>(localStorage.getItem('vishnu_gdrive_token'));
    const [isLoading, setIsLoading] = useState(false);
    const [backups, setBackups] = useState<any[]>([]);
    const [showBackups, setShowBackups] = useState(false);
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(false);

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
        toast(newState ? "Daily auto-backup enabled" : "Auto-backup disabled", "success");
    };

    // Confirmation State
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
        variant?: "default" | "destructive";
        confirmText?: string;
    }>({
        isOpen: false,
        title: "",
        description: "",
        onConfirm: () => { },
        variant: "destructive",
    });

    const closeConfirm = () => setConfirmConfig(prev => ({ ...prev, isOpen: false }));

    const login = useGoogleLogin({
        onSuccess: (codeResponse) => {
            setToken(codeResponse.access_token);
            localStorage.setItem('vishnu_gdrive_token', codeResponse.access_token);
            toast("Connected to Google Drive", "success");
            fetchBackups(codeResponse.access_token);
        },
        onError: () => toast("Login Failed", "error"),
        scope: 'https://www.googleapis.com/auth/drive.file'
    });

    const fetchBackups = async (accessToken: string) => {
        setIsLoading(true);
        try {
            const data = await listBackups(accessToken);
            setBackups(data.files || []);
        } catch (e) {
            console.error(e);
            if (String(e).includes('401')) {
                // Token expired
                setToken(null);
                localStorage.removeItem('vishnu_gdrive_token');
                toast("Session expired. Please reconnect.", "warning");
            } else {
                toast("Failed to list backups", "error");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-fetch on mount if token exists
    useEffect(() => {
        if (token) {
            fetchBackups(token);
        }
    }, []);

    const handleBackup = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = await exportData();
            const fileName = `vishnu_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            await uploadToDrive(token, fileName, data);
            toast("Backup successful!", "success");
            fetchBackups(token);
        } catch (e) {
            console.error(e);
            toast("Backup failed", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = (fileId: string, fileName: string) => {
        setConfirmConfig({
            isOpen: true,
            title: "Restore from Backup?",
            description: `This will WIPE current data and restore state from "${fileName}". This cannot be undone.`,
            variant: "destructive",
            confirmText: "Yes, Restore",
            onConfirm: async () => {
                if (!token) return;
                setIsLoading(true);
                try {
                    const file = await downloadFile(token, fileId);
                    // drive api returns json object directly if alt=media not handled perfectly by browser fetch for json? 
                    // actually `downloadFile` calls .json(), so we get the object.
                    // `importData` expects string (if parsing) or object?
                    // Let's check `importData` signature. It parses string.
                    // But `res.json()` returns object.
                    // So we should stringify it again or adjust importData.
                    // Adjusting importData is cleaner, but let's just stringify here for safety matching signature.

                    await importData(JSON.stringify(file));

                    toast("Restore complete! Reloading...", "success");
                    setTimeout(() => window.location.reload(), 1500);
                } catch (e) {
                    console.error(e);
                    toast("Restore failed: " + String(e), "error");
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    if (!token) {
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
                <Button onClick={() => login()} className="font-bold bg-blue-600 hover:bg-blue-700 text-white w-full max-w-xs">
                    Connect Google Drive
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Status Card */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl">
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-foreground">Drive Connected</h3>
                            <p className="text-xs text-muted-foreground">{backups.length} backups found</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setToken(null); localStorage.removeItem('vishnu_gdrive_token'); }}>
                        Disconnect
                    </Button>
                </div>

                {/* Regular Backup Toggle */}
                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-4 border border-neutral-100 dark:border-neutral-800">
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
                    <button
                        onClick={toggleAutoBackup}
                        className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                            isAutoBackupEnabled ? "bg-primary" : "bg-neutral-200 dark:bg-neutral-700"
                        )}
                    >
                        <span
                            className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                isAutoBackupEnabled ? "translate-x-6" : "translate-x-1"
                            )}
                        />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        onClick={handleBackup}
                        disabled={isLoading}
                        className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                    >
                        {isLoading ? <Loader2 className="animate-spin mr-2" /> : <Upload className="mr-2" size={18} />}
                        Backup Now
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowBackups(!showBackups)}
                        className="h-12 font-bold border-2"
                    >
                        {showBackups ? "Hide Files" : "View Backups"}
                    </Button>
                </div>
            </div>

            {/* Backups List */}
            {showBackups && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center px-1">
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">Available Backups</h4>
                        <button onClick={() => fetchBackups(token)} className="p-1 text-muted-foreground hover:text-primary transition">
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
                                        onClick={() => handleRestore(file.id, file.name)}
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

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={closeConfirm}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                description={confirmConfig.description}
                variant={confirmConfig.variant}
                confirmText={confirmConfig.confirmText}
            />
        </div>
    );
}
