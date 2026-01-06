import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Shield, Moon, Sun, Laptop, Lock, Check, Fingerprint, LogOut, KeyRound, Loader2, Smartphone, Trash2, AlertTriangle, ShieldCheck, Clock, Mail, Download, Upload, Calendar } from "lucide-react";
import { useTheme } from "../components/theme-provider";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/toast-provider";
import { Modal } from "../components/ui/Modal";

// Format relative time
const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const {
        hasBiometrics,
        registerBiometrics,
        disableBiometrics,
        canEnableBiometrics,
        authorizedDevices,
        revokeDeviceFingerprint,
        changeMasterPin,
        refreshDevices,
        hasSuperAdminSetup,
        currentDeviceId
    } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        refreshDevices();
    }, [refreshDevices]);

    // Super Admin Setup State
    const [isSetupSuperAdminOpen, setIsSetupSuperAdminOpen] = useState(false);
    const [superAdminEmail, setSuperAdminEmail] = useState('');
    const [superAdminPin, setSuperAdminPin] = useState('');
    const [confirmSuperAdminPin, setConfirmSuperAdminPin] = useState('');
    const [isSettingUpSuperAdmin, setIsSettingUpSuperAdmin] = useState(false);

    // PIN Change State
    const [isChangePinOpen, setIsChangePinOpen] = useState(false);
    const [pinStep, setPinStep] = useState<'super_admin' | 'new' | 'confirm'>('super_admin');
    const [superAdminPinInput, setSuperAdminPinInput] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmNewPin, setConfirmNewPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pinError, setPinError] = useState('');

    // Device Revoke State
    const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
    const [deviceToRevoke, setDeviceToRevoke] = useState<string | null>(null);
    const [revokeSuperAdminPin, setRevokeSuperAdminPin] = useState('');
    const [isRevoking, setIsRevoking] = useState(false);
    const [revokeError, setRevokeError] = useState('');

    const resetPinState = () => {
        setIsChangePinOpen(false);
        setPinStep('super_admin');
        setSuperAdminPinInput('');
        setNewPin('');
        setConfirmNewPin('');
        setIsLoading(false);
        setPinError('');
    };

    const resetRevokeState = () => {
        setIsRevokeModalOpen(false);
        setDeviceToRevoke(null);
        setRevokeSuperAdminPin('');
        setIsRevoking(false);
        setRevokeError('');
    };

    const resetSuperAdminSetup = () => {
        setIsSetupSuperAdminOpen(false);
        setSuperAdminEmail('');
        setSuperAdminPin('');
        setConfirmSuperAdminPin('');
        setIsSettingUpSuperAdmin(false);
    };

    // Setup Super Admin
    // State for showing migration instructions
    const [showMigrationHelp, setShowMigrationHelp] = useState(false);

    // Data Management State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const REQUIRED_CSV_HEADERS = [
        "Date", "Customer Name", "Product Name", "Quantity", "Unit", "Sell Price", "Buy Price", "Is Deleted"
    ];

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const { data: transactions, error } = await supabase
                .from('transactions')
                .select('*, customers(name), products(name, unit)')
                .gte('date', exportStartDate)
                .lte('date', exportEndDate)
                .order('date', { ascending: true });

            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                toast("No data found for selected range", "error");
                setIsExporting(false);
                return;
            }

            const csvData = transactions.map(t => ({
                "Date": t.date,
                "Customer Name": t.customers?.name || 'Unknown',
                "Product Name": t.products?.name || 'Unknown',
                "Quantity": t.quantity,
                "Unit": t.products?.unit || 'pcs',
                "Sell Price": t.sell_price,
                "Buy Price": t.buy_price,
                "Is Deleted": t.deleted_at ? "true" : "false"
            }));

            const csv = Papa.unparse(csvData, { columns: REQUIRED_CSV_HEADERS });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `vishnu_sales_export_${exportStartDate}_to_${exportEndDate}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast("Export successful", "success");
            setIsExportModalOpen(false);
        } catch (err) {
            console.error(err);
            toast("Export failed", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                await processImport(results.data);
                if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
                setIsImporting(false);
            },
            error: (err: any) => {
                toast("Failed to parse CSV", "error");
                console.error(err);
                setIsImporting(false);
            }
        });
    };

    const processImport = async (rows: any[]) => {
        // Validate Headers
        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            const missing = REQUIRED_CSV_HEADERS.filter(h => !headers.includes(h));
            if (missing.length > 0) {
                toast(`Invalid CSV format. Missing column(s): ${missing.join(', ')}`, "error");
                return;
            }
            if (headers.length !== REQUIRED_CSV_HEADERS.length) {
                toast(`Invalid CSV format. Header count mismatch. Found ${headers.length}, expected ${REQUIRED_CSV_HEADERS.length}. No extra columns allowed.`, "error");
                return;
            }
        }

        let successCount = 0;
        let failCount = 0;
        let newCustomers = 0;
        let newProducts = 0;
        const totalRows = rows.length;

        toast(`Processing ${totalRows} records...`, "info");

        // Fetch all current map to minimize queries
        const { data: allCustomers } = await supabase.from('customers').select('id, name');
        const { data: allProducts } = await supabase.from('products').select('id, name');

        // Case-insensitive maps
        const customerMap = new Map(allCustomers?.map(c => [c.name.toLowerCase(), c.id]));
        const productMap = new Map(allProducts?.map(p => [p.name.toLowerCase(), p.id]));

        for (const row of rows) {
            try {
                const date = row["Date"];
                const custName = row["Customer Name"]?.trim();
                const prodName = row["Product Name"]?.trim();
                const qty = parseFloat(row["Quantity"]);
                // Use imported unit or default to 'pcs'
                const unit = row["Unit"] || 'pcs';
                const sellPrice = parseFloat(row["Sell Price"]);
                const buyPrice = parseFloat(row["Buy Price"]);
                const isDeleted = row["Is Deleted"]?.toLowerCase() === 'true';

                if (!date || !custName || !prodName || isNaN(qty) || isNaN(sellPrice)) {
                    failCount++;
                    continue;
                }

                // Customer
                let customerId = customerMap.get(custName.toLowerCase());
                if (!customerId) {
                    const { data: newCust, error: cErr } = await supabase
                        .from('customers')
                        .insert({ name: custName, is_active: true })
                        .select('id')
                        .single();
                    if (cErr) throw cErr;
                    customerId = newCust.id;
                    customerMap.set(custName.toLowerCase(), customerId);
                    customerMap.set(custName.toLowerCase(), customerId); // Ensure map is updated
                    newCustomers++;
                }

                // Product
                let productId = productMap.get(prodName.toLowerCase());
                if (!productId) {
                    const { data: newProd, error: pErr } = await supabase
                        .from('products')
                        .insert({ name: prodName, unit: unit, category: 'general', is_active: true })
                        .select('id')
                        .single();
                    if (pErr) throw pErr;
                    productId = newProd.id;
                    productMap.set(prodName.toLowerCase(), productId);
                    newProducts++;
                }

                // Transaction
                const { error: tErr } = await supabase.from('transactions').insert({
                    date,
                    customer_id: customerId,
                    product_id: productId,
                    quantity: qty,
                    sell_price: sellPrice,
                    buy_price: isNaN(buyPrice) ? 0 : buyPrice,
                    deleted_at: isDeleted ? new Date().toISOString() : null
                });

                if (tErr) throw tErr;
                successCount++;

            } catch (err) {
                console.error("Row import error", row, err);
                failCount++;
            }
        }

        toast(`Imported: ${successCount}, Failed: ${failCount}, New Customers: ${newCustomers}, New Products: ${newProducts}`, "success");
    };

    const handleSetupSuperAdmin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (superAdminPin.length < 6) {
            toast("Super Admin PIN must be at least 6 digits", "error");
            return;
        }

        if (superAdminPin !== confirmSuperAdminPin) {
            toast("PINs don't match", "error");
            return;
        }

        if (!superAdminEmail.includes('@')) {
            toast("Please enter a valid email", "error");
            return;
        }

        setIsSettingUpSuperAdmin(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .update({
                    super_admin_pin: superAdminPin,
                    super_admin_email: superAdminEmail
                })
                .eq('id', 1);

            if (error) {
                // Check if it's a column doesn't exist error
                if (error.message?.includes('column') || error.code === '42703') {
                    setShowMigrationHelp(true);
                    toast("Database migration needed. See instructions below.", "error");
                    return;
                }
                throw error;
            }

            toast("Super Admin configured! PIN has been set.", "success");
            resetSuperAdminSetup();
            // Refresh to update hasSuperAdminSetup
            window.location.reload();
        } catch (error: any) {
            console.error("Super Admin setup failed:", error);
            // Show migration help for any error as it's likely a schema issue
            setShowMigrationHelp(true);
            toast("Database needs to be updated. See instructions.", "error");
        } finally {
            setIsSettingUpSuperAdmin(false);
        }
    };

    // Change Master PIN - Now requires Super Admin PIN
    const handleVerifySuperAdminPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinError('');
        setIsLoading(true);

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('super_admin_pin')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data?.super_admin_pin === superAdminPinInput) {
                setPinStep('new');
            } else {
                setPinError('Invalid Super Admin PIN');
                setSuperAdminPinInput('');
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            setPinError('Verification failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePin = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinError('');

        if (newPin !== confirmNewPin) {
            setPinError("New PINs don't match");
            return;
        }
        if (newPin.length < 4) {
            setPinError("PIN must be at least 4 digits");
            return;
        }

        setIsLoading(true);
        const result = await changeMasterPin(newPin, superAdminPinInput);
        setIsLoading(false);

        if (result.success) {
            toast("Master PIN updated! All devices have been logged out and must re-authenticate.", "success");
            resetPinState();
        } else {
            setPinError(result.error || 'Failed to update PIN');
        }
    };

    // Revoke Device Fingerprint
    const handleOpenRevokeModal = (deviceId: string) => {
        setDeviceToRevoke(deviceId);
        setIsRevokeModalOpen(true);
    };

    const handleRevokeDevice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deviceToRevoke) return;

        setRevokeError('');
        setIsRevoking(true);

        const result = await revokeDeviceFingerprint(deviceToRevoke, revokeSuperAdminPin);

        if (result.success) {
            toast("Device fingerprint access revoked. Device must re-authenticate with Master PIN.", "success");
            resetRevokeState();
        } else {
            setRevokeError(result.error || 'Failed to revoke access');
        }

        setIsRevoking(false);
    };

    return (
        <div className="min-h-screen bg-background p-4 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-accent text-muted-foreground transition">
                    <ArrowLeft />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-foreground">Settings</h1>
                    <p className="text-muted-foreground text-xs">App preferences</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* App Info Card */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Shield size={18} className="text-emerald-500" />
                        Application
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-border">
                            <span className="text-sm text-muted-foreground">Version</span>
                            <span className="text-sm font-medium text-foreground">v1.4.0</span>
                        </div>

                        <div className="py-2 border-b border-border">
                            <span className="text-sm text-muted-foreground mb-3 block">Theme</span>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setTheme("light")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "light"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Sun size={20} />
                                    <span className="text-xs font-bold">Light</span>
                                </button>
                                <button
                                    onClick={() => setTheme("dark")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "dark"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Moon size={20} />
                                    <span className="text-xs font-bold">Dark</span>
                                </button>
                                <button
                                    onClick={() => setTheme("system")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        theme === "system"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <Laptop size={20} />
                                    <span className="text-xs font-bold">Auto</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-muted-foreground">Build</span>
                            <span className="text-sm font-medium text-foreground">Production</span>
                        </div>
                    </div>
                </div>

                {/* Security Section */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
                    <div>
                        <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                            <Lock size={18} className="text-rose-500" />
                            Security
                        </h2>

                        <h3 className="text-sm font-semibold mb-2">Biometrics</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Enable FaceID or Fingerprint for quick access.
                        </p>

                        {hasBiometrics ? (
                            <div className="space-y-3">
                                <div className="text-xs p-3 rounded-lg border font-medium flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                    <Check size={14} />
                                    Biometrics Active
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={disableBiometrics}
                                >
                                    Disable Biometrics
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {!canEnableBiometrics && (
                                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                                            ⚠️ Fingerprint Unavailable
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            You must verify the Master PIN on this device before enabling fingerprint authentication.
                                        </p>
                                    </div>
                                )}
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={registerBiometrics}
                                    disabled={!canEnableBiometrics}
                                >
                                    <Fingerprint size={18} className="mr-2" />
                                    Enable Biometrics
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Super Admin Setup (if not configured) */}
                    {!hasSuperAdminSetup && (
                        <div className="pt-4 border-t border-border">
                            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-rose-500/10 border border-amber-500/30">
                                <div className="flex items-start gap-3">
                                    <ShieldCheck size={20} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground mb-1">Setup Super Admin</h3>
                                        <p className="text-xs text-muted-foreground mb-3">
                                            Super Admin PIN is required for critical security operations like changing the Master PIN or revoking device access.
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={() => setIsSetupSuperAdminOpen(true)}
                                        >
                                            <ShieldCheck size={16} className="mr-2" />
                                            Configure Super Admin
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 border-t border-border">
                        <h3 className="text-sm font-semibold mb-2">Master PIN</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Change the main PIN used to access this app. <span className="font-semibold text-amber-600 dark:text-amber-400">Requires Super Admin PIN.</span>
                        </p>
                        <Button
                            className="w-full"
                            onClick={() => setIsChangePinOpen(true)}
                            disabled={!hasSuperAdminSetup}
                        >
                            <KeyRound size={18} className="mr-2" />
                            Change Master PIN
                        </Button>
                        {!hasSuperAdminSetup && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                                Please configure Super Admin first
                            </p>
                        )}
                    </div>
                </div>

                {/* Authorized Devices */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Smartphone size={18} className="text-blue-500" />
                        Authorized Devices
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        Devices with fingerprint access. <span className="font-semibold text-amber-600 dark:text-amber-400">Only Super Admin can revoke access.</span>
                    </p>

                    {authorizedDevices.length > 0 ? (
                        <div className="space-y-3">
                            {authorizedDevices.map((device) => (
                                <div
                                    key={device.id}
                                    className={cn(
                                        "p-4 rounded-xl border transition-all",
                                        device.device_id === currentDeviceId
                                            ? "bg-primary/5 border-primary/30"
                                            : "bg-accent/50 border-border"
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                device.fingerprint_enabled ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Fingerprint size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold truncate">{device.device_name}</p>
                                                    {device.device_id === currentDeviceId && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary shrink-0">
                                                            THIS DEVICE
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                                    <Clock size={12} />
                                                    <span>Last active: {formatRelativeTime(device.last_active_at)}</span>
                                                </div>
                                                <p className={cn(
                                                    "text-xs mt-1 font-medium",
                                                    device.fingerprint_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                                )}>
                                                    {device.fingerprint_enabled ? "✓ Fingerprint enabled" : "PIN only"}
                                                </p>
                                            </div>
                                        </div>
                                        {device.fingerprint_enabled && hasSuperAdminSetup && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10 shrink-0"
                                                onClick={() => handleOpenRevokeModal(device.device_id)}
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <Smartphone size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No authorized devices yet</p>
                        </div>
                    )}
                </div>

                {/* Data Card */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Database size={18} className="text-blue-500" />
                        Data
                    </h2>

                    <p className="text-xs text-muted-foreground mb-4">
                        Manage your data. You can export sales activity for backup or import data from CSV. <span className="font-semibold text-amber-600 dark:text-amber-400">Warning: Importing will append records and may create duplicates.</span>
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setIsExportModalOpen(true)}
                            disabled={isImporting || isExporting}
                        >
                            <Download size={16} className="mr-2" />
                            {isExporting ? <Loader2 className="animate-spin" size={16} /> : "Export Data"}
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={handleImportClick}
                            disabled={isImporting || isExporting}
                        >
                            <Upload size={16} className="mr-2" />
                            {isImporting ? <Loader2 className="animate-spin" size={16} /> : "Import Data"}
                        </Button>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleImportFile}
                        />
                    </div>
                </div>

                {/* Device Deauthorize */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <LogOut size={18} className="text-rose-500" />
                        Device
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        Remove this device's authorization. You'll need your Master PIN again.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                        onClick={() => {
                            localStorage.removeItem('device_authorized');
                            localStorage.removeItem('bio_credential_id');
                            localStorage.removeItem('app_locked');
                            localStorage.removeItem('verified_pin_version');
                            window.location.reload();
                        }}
                    >
                        <LogOut size={16} className="mr-2" />
                        Deauthorize Device
                    </Button>
                </div>
            </div>

            {/* Export Modal */}
            {/* Export Modal */}
            <Modal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
            >
                <div className="text-center space-y-2 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                        <Database size={28} />
                    </div>
                    <h2 className="text-xl font-bold">Export Data</h2>
                    <p className="text-sm text-muted-foreground">
                        Select date range to export sales activity
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">Start Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <Input
                                type="date"
                                value={exportStartDate}
                                onChange={(e) => setExportStartDate(e.target.value)}
                                className="pl-10 h-12"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">End Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <Input
                                type="date"
                                value={exportEndDate}
                                onChange={(e) => setExportEndDate(e.target.value)}
                                className="pl-10 h-12"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleExport}
                        className="w-full h-12 font-bold shadow-lg shadow-primary/25"
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="animate-spin mr-2" /> : "Export CSV"}
                    </Button>
                </div>
            </Modal>

            {/* Super Admin Setup Modal */}
            <Modal
                isOpen={isSetupSuperAdminOpen}
                onClose={resetSuperAdminSetup}
            >
                <div className="text-center space-y-2 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex items-center justify-center mx-auto">
                        <ShieldCheck size={28} className="text-amber-500" />
                    </div>
                    <h2 className="text-xl font-bold">Setup Super Admin</h2>
                    <p className="text-sm text-muted-foreground">
                        This PIN is required for critical security operations
                    </p>
                </div>

                <form onSubmit={handleSetupSuperAdmin} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Mail size={12} />
                            Super Admin Email
                        </label>
                        <Input
                            type="email"
                            value={superAdminEmail}
                            onChange={(e) => setSuperAdminEmail(e.target.value)}
                            placeholder="admin@example.com"
                            className="h-12"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                            Super Admin PIN (min 6 digits)
                        </label>
                        <Input
                            type="password"
                            inputMode="numeric"
                            value={superAdminPin}
                            onChange={(e) => setSuperAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder="Enter Super Admin PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                            Confirm Super Admin PIN
                        </label>
                        <Input
                            type="password"
                            inputMode="numeric"
                            value={confirmSuperAdminPin}
                            onChange={(e) => setConfirmSuperAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder="Confirm PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14"
                            required
                        />
                    </div>

                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            <strong>Important:</strong> Store this PIN securely. It's required for changing Master PIN and revoking device access.
                        </p>
                    </div>

                    {showMigrationHelp && (
                        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-rose-500">Database Migration Required</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Please run the following SQL in your Supabase Dashboard → SQL Editor:
                                    </p>
                                </div>
                            </div>
                            <pre className="text-[10px] bg-black/50 p-2 rounded overflow-x-auto text-emerald-400 font-mono">
                                {`ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS super_admin_pin TEXT;

ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS super_admin_email TEXT;`}
                            </pre>
                            <p className="text-xs text-muted-foreground">After running the SQL, try again.</p>
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full h-12 text-white font-bold shadow-lg shadow-primary/25"
                        disabled={isSettingUpSuperAdmin || superAdminPin.length < 6}
                    >
                        {isSettingUpSuperAdmin ? <Loader2 className="animate-spin" /> : "Setup Super Admin"}
                    </Button>
                </form>
            </Modal>

            {/* Change Master PIN Modal */}
            <Modal
                isOpen={isChangePinOpen}
                onClose={resetPinState}
            >
                <div className="text-center space-y-2 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                        <KeyRound size={28} />
                    </div>
                    <h2 className="text-xl font-bold">Change Master PIN</h2>
                    <p className="text-sm text-muted-foreground">
                        {pinStep === 'super_admin' && "Enter Super Admin PIN to continue"}
                        {pinStep === 'new' && "Enter your new Master PIN"}
                        {pinStep === 'confirm' && "Confirm your new Master PIN"}
                    </p>
                </div>

                {pinError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
                        <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-rose-500">{pinError}</p>
                    </div>
                )}

                {pinStep === 'super_admin' && (
                    <form onSubmit={handleVerifySuperAdminPin} className="space-y-4">
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                <strong>Super Admin Required:</strong> Only Super Admin can change the Master PIN to protect against unauthorized access.
                            </p>
                        </div>
                        <Input
                            type="password"
                            inputMode="numeric"
                            value={superAdminPinInput}
                            onChange={(e) => setSuperAdminPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder="Enter Super Admin PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                            autoFocus
                        />
                        <Button type="submit" className="w-full h-12 text-white font-bold shadow-lg shadow-primary/25" disabled={isLoading || superAdminPinInput.length < 6}>
                            {isLoading ? <Loader2 className="animate-spin" /> : "Verify & Continue"}
                        </Button>
                    </form>
                )}

                {(pinStep === 'new' || pinStep === 'confirm') && (
                    <form onSubmit={handleUpdatePin} className="space-y-4">
                        {pinStep === 'new' ? (
                            <div className="space-y-4">
                                <Input
                                    type="password"
                                    inputMode="numeric"
                                    value={newPin}
                                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="New Master PIN"
                                    className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                                    autoFocus
                                />
                                <Button
                                    type="button"
                                    className="w-full h-12 text-white font-bold shadow-lg shadow-primary/25"
                                    disabled={newPin.length < 4}
                                    onClick={() => setPinStep('confirm')}
                                >
                                    Continue
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Input
                                    type="password"
                                    inputMode="numeric"
                                    value={confirmNewPin}
                                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="Confirm New PIN"
                                    className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                                    autoFocus
                                />

                                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                                    <p className="text-xs text-rose-600 dark:text-rose-400">
                                        <strong>Warning:</strong> Changing the Master PIN will immediately log out ALL devices and disable ALL fingerprint access.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Button type="button" variant="outline" className="h-12 border-border hover:bg-accent hover:text-foreground" onClick={() => setPinStep('new')}>
                                        Back
                                    </Button>
                                    <Button type="submit" className="h-12 text-white font-bold shadow-lg shadow-primary/25" disabled={isLoading || confirmNewPin.length < 4}>
                                        {isLoading ? <Loader2 className="animate-spin" /> : "Save New PIN"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </form>
                )}
            </Modal>

            {/* Revoke Device Modal */}
            <Modal
                isOpen={isRevokeModalOpen}
                onClose={resetRevokeState}
            >
                <div className="text-center space-y-2 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto text-rose-500">
                        <Trash2 size={28} />
                    </div>
                    <h2 className="text-xl font-bold">Remove Device Access</h2>
                    <p className="text-sm text-muted-foreground">
                        Enter Super Admin PIN to revoke fingerprint access
                    </p>
                </div>

                {revokeError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
                        <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-rose-500">{revokeError}</p>
                    </div>
                )}

                <form onSubmit={handleRevokeDevice} className="space-y-4">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            This will immediately log out the device and disable its fingerprint access. The device will need to re-authenticate with the Master PIN.
                        </p>
                    </div>

                    <Input
                        type="password"
                        inputMode="numeric"
                        value={revokeSuperAdminPin}
                        onChange={(e) => setRevokeSuperAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="Enter Super Admin PIN"
                        className="text-center text-lg font-semibold tracking-widest h-14 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
                        autoFocus
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="outline" className="h-12" onClick={resetRevokeState}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="h-12 bg-rose-500 hover:bg-rose-600 text-white font-bold"
                            disabled={isRevoking || revokeSuperAdminPin.length < 6}
                        >
                            {isRevoking ? <Loader2 className="animate-spin" /> : "Revoke Access"}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div >
    );
}
