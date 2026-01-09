import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Cloud, Upload, Download, Loader2, FileJson, CheckCircle2, RefreshCw, AlertTriangle, ArrowRight, Database } from "lucide-react";
import { Button } from "./ui/Button";
import { useToast } from "./toast-provider";
import { uploadToDrive, listBackups, downloadFile } from "../lib/drive";
import { exportData, importData, getBackupStats, getCurrentStats } from "../lib/backup";
import { Modal } from "./ui/Modal";
import { cn } from "../lib/utils";

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
    const [token, setToken] = useState<string | null>(localStorage.getItem('vishnu_gdrive_token'));
    const [isLoading, setIsLoading] = useState(false);
    const [backups, setBackups] = useState<any[]>([]);
    const [showBackups, setShowBackups] = useState(false);
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(false);

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
        fileData: any; // We store the downloaded file here to pass it to confirm
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
        toast(newState ? "Daily auto-backup enabled" : "Auto-backup disabled", "success");
    };

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
        setShowProgress(true);
        setProgress(0);
        setProgressStatus("Preparing data...");

        try {
            // 1. Export Data (0-90%)
            const data = await exportData((p) => {
                setProgress(Math.round(p * 0.9)); // Scale to 90%
                setProgressStatus(`Backing up data... ${Math.round(p)}%`);
            });

            // 2. Upload (90-100%)
            setProgress(90);
            setProgressStatus("Uploading to Drive...");
            const fileName = `vishnu_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            await uploadToDrive(token, fileName, data);

            setProgress(100);
            setProgressStatus("Complete!");
            toast("Backup successful!", "success");

            setTimeout(() => {
                setShowProgress(false);
                fetchBackups(token);
            }, 1000);

        } catch (e) {
            console.error(e);
            toast("Backup failed", "error");
            setShowProgress(false);
        }
    };

    const handleRestoreClick = async (fileId: string, fileName: string) => {
        if (!token) return;
        setShowProgress(true);
        setProgress(0);
        setProgressStatus("Downloading backup...");

        try {
            // 1. Download
            // We fake progress for download since it's one fetch
            const interval = setInterval(() => {
                setProgress(p => p < 90 ? p + 5 : p);
            }, 150);

            const file = await downloadFile(token, fileId);
            clearInterval(interval);
            setProgress(100);

            // 2. Prepare Preview
            setProgressStatus("Analyzing backup...");
            const jsonString = JSON.stringify(file);
            const backupStats = getBackupStats(jsonString);
            const currentStats = await getCurrentStats();

            // Close progress to show preview
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
            toast("Failed to download backup", "error");
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

                <div className="flex gap-3">
                    <Button
                        onClick={handleBackup}
                        disabled={showProgress}
                        className="flex-1 h-11 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 font-semibold shadow-sm transition-all active:scale-[0.98]"
                    >
                        {showProgress ? <Loader2 className="animate-spin mr-2" size={18} /> : <Upload className="mr-2" size={18} />}
                        Manual Backup
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowBackups(!showBackups)}
                        className="flex-1 h-11 font-medium border-neutral-200 dark:border-neutral-700 bg-white dark:bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-all active:scale-[0.98]"
                    >
                        {showBackups ? "Hide Backups" : "View Backups"}
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
