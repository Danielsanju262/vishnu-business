import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Shield, Lock, Check, Fingerprint, LogOut, KeyRound, Loader2, Smartphone, Trash2, AlertTriangle, ShieldCheck, Clock, Mail, Download, Upload, ChevronDown, Cloud } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/toast-provider";
import { Modal } from "../components/ui/Modal";
import { GoogleDriveBackup } from "../components/GoogleDriveBackup";
import { useBrowserBackButton } from "../hooks/useBrowserBackButton";

// Collapsible Section Component
const CollapsibleSection = ({
    title,
    icon: Icon,
    children,
    headerClassName,
    defaultOpen = false
}: {
    title: string;
    icon: any;
    children: React.ReactNode;
    headerClassName?: string;
    defaultOpen?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm transition-all duration-200">
            <button
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }
                }}
                className="w-full flex items-center justify-between p-4 md:p-5 text-left bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
                <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors", headerClassName)}>
                        <Icon size={16} />
                    </div>
                    <span className="font-bold text-neutral-900 dark:text-white text-base">{title}</span>
                </div>
                <ChevronDown
                    size={18}
                    className={cn(
                        "text-neutral-400 transition-transform duration-200",
                        isOpen ? "transform rotate-180" : ""
                    )}
                />
            </button>
            <div
                className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden">
                    <div className="p-4 md:p-5 pt-0">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

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

    // Deauthorize Confirmation State
    const [showDeauthConfirm, setShowDeauthConfirm] = useState(false);

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

    // Handle browser back button
    const isModalOpen = isSetupSuperAdminOpen || isChangePinOpen || isRevokeModalOpen || showDeauthConfirm || isExportModalOpen || showMigrationHelp;

    // Handle browser back button
    useBrowserBackButton(() => {
        if (isSetupSuperAdminOpen) {
            resetSuperAdminSetup();
        } else if (isChangePinOpen) {
            resetPinState();
        } else if (isRevokeModalOpen) {
            resetRevokeState();
        } else if (showDeauthConfirm) {
            setShowDeauthConfirm(false);
        } else if (isExportModalOpen) {
            setIsExportModalOpen(false);
        } else if (showMigrationHelp) {
            setShowMigrationHelp(false);
        }
    }, isModalOpen);

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
        let skippedCount = 0;
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

                // Check for Exact Duplicate
                // Criteria: Date, Customer, Product, Quantity, Sell Price, Status (Active/Deleted)
                let duplicateQuery = supabase.from('transactions').select('id')
                    .eq('date', date)
                    .eq('customer_id', customerId)
                    .eq('product_id', productId)
                    .eq('quantity', qty)
                    .eq('sell_price', sellPrice);

                if (isDeleted) {
                    duplicateQuery = duplicateQuery.not('deleted_at', 'is', null);
                } else {
                    duplicateQuery = duplicateQuery.is('deleted_at', null);
                }

                const { data: existing } = await duplicateQuery.maybeSingle();

                if (existing) {
                    skippedCount++;
                    continue;
                }

                // Transaction Insert
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

        toast(`Imported: ${successCount}, Skipped (Duplicate): ${skippedCount}, Failed: ${failCount}`, "info");
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
            toast("Device removed from authorized list.", "success");
            resetRevokeState();
        } else {
            setRevokeError(result.error || 'Failed to remove device');
        }

        setIsRevoking(false);
    };

    return (
        <div className="min-h-screen bg-background p-3 md:p-4 pb-10 animate-in fade-in w-full md:max-w-2xl md:mx-auto">
            {/* Header - Enhanced with better spacing and hover states */}
            <div className="flex items-center gap-3 mb-5 md:mb-6">
                <Link
                    to="/"
                    className="p-3 -ml-2 rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 active:bg-white/15 dark:active:bg-white/15 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-all duration-200 border border-transparent hover:border-white/10 dark:hover:border-white/10"
                >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                </Link>
                <div className="flex-1">
                    {/* Breadcrumb - Improved spacing and contrast */}
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500 mb-0.5 tracking-wide">
                        <Link to="/" className="hover:text-neutral-700 dark:hover:text-white transition-colors duration-150">Home</Link>
                        <span className="text-neutral-400 dark:text-neutral-600">/</span>
                        <span className="text-neutral-900 dark:text-white font-semibold">Settings</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">Settings</h1>
                </div>
            </div>

            <div className="space-y-4">
                {/* App Info Card - Enhanced with better contrast and spacing */}
                <div className="bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 md:p-5 shadow-sm">
                    <h2 className="font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-3 text-base">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                            <Shield size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        Application
                    </h2>
                    <div className="space-y-0">
                        <div className="flex justify-between items-center py-3 border-b border-neutral-100 dark:border-neutral-800">
                            <span className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Version</span>
                            <span className="text-sm font-semibold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md">v3.8.0</span>
                        </div>


                        <div className="flex justify-between items-center py-3">
                            <span className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Build</span>
                            <span className="text-sm font-semibold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md">Production</span>
                        </div>
                    </div>
                </div>

                {/* Security Section - Enhanced with improved contrast and hierarchy */}
                {/* Security Section - Enhanced with improved contrast and hierarchy */}
                <CollapsibleSection
                    title="Security"
                    icon={Lock}
                    headerClassName="bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                >
                    <div className="space-y-5">
                        <div>
                            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2">Biometrics</h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                                Enable FaceID or Fingerprint for quick access.
                            </p>

                            {hasBiometrics ? (
                                <div className="space-y-3">
                                    <div className="text-xs p-3 rounded-xl border font-semibold flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500 dark:bg-emerald-500 flex items-center justify-center">
                                            <Check size={12} className="text-white" strokeWidth={3} />
                                        </div>
                                        Biometrics Active
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full h-11 md:h-12 border-neutral-200 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium transition-all duration-200"
                                        onClick={disableBiometrics}
                                    >
                                        Disable Biometrics
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {!canEnableBiometrics && (
                                        <div className="p-3 md:p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                                            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                                                <AlertTriangle size={14} className="text-neutral-500 dark:text-neutral-400" />
                                                Fingerprint Unavailable
                                            </p>
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                                You must verify the Master PIN on this device before enabling fingerprint authentication.
                                            </p>
                                        </div>
                                    )}
                                    <Button
                                        variant="outline"
                                        className="w-full h-11 md:h-12 border-neutral-200 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
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
                            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                                <div className="p-3 md:p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                                            <ShieldCheck size={20} className="text-neutral-600 dark:text-neutral-300" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">Setup Super Admin</h3>
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                                                Super Admin PIN is required for critical security operations like changing the Master PIN or revoking device access.
                                            </p>
                                            <Button
                                                size="sm"
                                                className="bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold h-10 px-4 transition-all duration-200"
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

                        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2">Master PIN</h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
                                Change the main PIN used to access this app. <span className="font-semibold text-neutral-700 dark:text-neutral-300">Requires Super Admin PIN.</span>
                            </p>
                            <Button
                                className="w-full h-11 md:h-12 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                                onClick={() => setIsChangePinOpen(true)}
                                disabled={!hasSuperAdminSetup}
                            >
                                <KeyRound size={18} className="mr-2" />
                                Change Master PIN
                            </Button>
                            {!hasSuperAdminSetup && (
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 text-center font-medium">
                                    Please configure Super Admin first
                                </p>
                            )}
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Authorized Devices - Enhanced with improved card design */}
                <CollapsibleSection
                    title="Authorized Devices"
                    icon={Smartphone}
                    headerClassName="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400"
                >
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5 leading-relaxed">
                        Devices with fingerprint access. <span className="font-semibold text-neutral-700 dark:text-neutral-300">Only Super Admin can revoke access.</span>
                    </p>

                    {authorizedDevices.length > 0 ? (
                        <div className="space-y-3">
                            {authorizedDevices.map((device) => (
                                <div
                                    key={device.id}
                                    className={cn(
                                        "p-3 md:p-4 rounded-xl border-2 transition-all duration-200",
                                        device.device_id === currentDeviceId
                                            ? "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                                            : "bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                                                device.fingerprint_enabled
                                                    ? "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600"
                                                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700"
                                            )}>
                                                <Fingerprint size={20} strokeWidth={1.5} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{device.device_name}</p>
                                                    {device.device_id === currentDeviceId && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shrink-0 tracking-wide">
                                                            THIS DEVICE
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                                                    <Clock size={12} />
                                                    <span>Last active: {formatRelativeTime(device.last_active_at)}</span>
                                                </div>
                                                <p className={cn(
                                                    "text-xs mt-1.5 font-medium flex items-center gap-1.5",
                                                    device.fingerprint_enabled ? "text-neutral-700 dark:text-neutral-300" : "text-neutral-500 dark:text-neutral-500"
                                                )}>
                                                    {device.fingerprint_enabled && <Check size={12} strokeWidth={3} />}
                                                    {device.fingerprint_enabled ? "Biometrics enabled" : "PIN only"}
                                                </p>
                                            </div>
                                        </div>
                                        {device.fingerprint_enabled && hasSuperAdminSetup && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200 shrink-0 h-10 w-10 p-0 transition-all duration-200"
                                                onClick={() => handleOpenRevokeModal(device.device_id)}
                                            >
                                                <Trash2 size={18} />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-neutral-400 dark:text-neutral-500">
                            <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                                <Smartphone size={24} strokeWidth={1.5} />
                            </div>
                            <p className="text-sm font-medium">No authorized devices yet</p>
                        </div>
                    )}
                </CollapsibleSection>

                {/* Backup & Restore (Google Drive) */}
                <CollapsibleSection
                    title="Cloud Backup"
                    icon={Cloud}
                    headerClassName="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                >
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5 leading-relaxed">
                        Securely backup your entire business data to Google Drive. Restoring from a backup will <span className="font-semibold text-rose-500">RESET</span> the app to that exact state (deleting newer data).
                    </p>
                    <GoogleDriveBackup />
                </CollapsibleSection>

                {/* Data Card - Enhanced with improved styling */}
                <CollapsibleSection
                    title="Data Export (CSV)"
                    icon={Database}
                    headerClassName="bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
                >
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5 leading-relaxed">
                        Manage your data. You can export sales activity for backup or import data from CSV. <span className="font-semibold text-neutral-700 dark:text-neutral-300">Warning: Importing will append records and may create duplicates.</span>
                    </p>
                    <div className="flex gap-2.5">
                        <Button
                            variant="outline"
                            className="flex-1 h-11 md:h-12 border-neutral-200 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                            onClick={() => setIsExportModalOpen(true)}
                            disabled={isImporting || isExporting}
                        >
                            {isExporting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Download size={16} className="mr-2" />}
                            {isExporting ? "Exporting..." : "Export"}
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 h-11 md:h-12 border-neutral-200 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                            onClick={handleImportClick}
                            disabled={isImporting || isExporting}
                        >
                            {isImporting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Upload size={16} className="mr-2" />}
                            {isImporting ? "Importing..." : "Import"}
                        </Button>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleImportFile}
                        />
                    </div>
                </CollapsibleSection>

                {/* Device Deauthorize - Enhanced with improved styling */}
                <div className="bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 md:p-5 shadow-sm">
                    <h2 className="font-bold text-neutral-900 dark:text-white mb-3 flex items-center gap-2.5 text-base">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
                            <LogOut size={16} className="text-rose-600 dark:text-rose-400" />
                        </div>
                        Device
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5 leading-relaxed">
                        Remove this device's authorization. You'll need your Master PIN again.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full h-11 md:h-12 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 font-medium transition-all duration-200"
                        onClick={() => setShowDeauthConfirm(true)}
                    >
                        <LogOut size={16} className="mr-2" />
                        Deauthorize Device
                    </Button>
                </div>
            </div>

            {/* Deauthorize Confirmation Modal */}
            <Modal
                isOpen={showDeauthConfirm}
                onClose={() => setShowDeauthConfirm(false)}
            >
                <div className="text-center space-y-2 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
                        <AlertTriangle size={28} />
                    </div>
                    <h2 className="text-xl font-bold">Deauthorize This Device?</h2>
                    <p className="text-sm text-muted-foreground">
                        You'll need to enter your Master PIN again to access the app on this device.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="outline"
                        className="h-12"
                        onClick={() => setShowDeauthConfirm(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                        onClick={() => {
                            localStorage.removeItem('device_authorized');
                            localStorage.removeItem('bio_credential_id');
                            localStorage.removeItem('app_locked');
                            localStorage.removeItem('verified_pin_version');
                            window.location.reload();
                        }}
                    >
                        Deauthorize
                    </Button>
                </div>
            </Modal>

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
                        <Input
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            className="h-12 md:h-14 bg-white dark:bg-zinc-900"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">End Date</label>
                        <Input
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            className="h-12 md:h-14 bg-white dark:bg-zinc-900"
                        />
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
                            onPaste={(e) => e.preventDefault()}
                            placeholder="Enter Super Admin PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14 md:h-16"
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
                            onPaste={(e) => e.preventDefault()}
                            placeholder="Confirm PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14 md:h-16"
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
                            onPaste={(e) => e.preventDefault()}
                            placeholder="Enter Super Admin PIN"
                            className="text-center text-lg font-semibold tracking-widest h-14 md:h-16 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
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
                                    onPaste={(e) => e.preventDefault()}
                                    placeholder="New Master PIN"
                                    className="text-center text-lg font-semibold tracking-widest h-14 md:h-16 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
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
                                    onPaste={(e) => e.preventDefault()}
                                    placeholder="Confirm New PIN"
                                    className="text-center text-lg font-semibold tracking-widest h-14 md:h-16 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
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
                    <h2 className="text-xl font-bold">Remove Device</h2>
                    <p className="text-sm text-muted-foreground">
                        Enter Super Admin PIN to remove this device
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
                            This will immediately remove this device from the authorized list. The device will be logged out and must re-authenticate with the Master PIN to be added again.
                        </p>
                    </div>

                    <Input
                        type="password"
                        inputMode="numeric"
                        value={revokeSuperAdminPin}
                        onChange={(e) => setRevokeSuperAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        onPaste={(e) => e.preventDefault()}
                        placeholder="Enter Super Admin PIN"
                        className="text-center text-lg font-semibold tracking-widest h-14 md:h-16 bg-accent/50 focus:bg-background transition-colors placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
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
                            {isRevoking ? <Loader2 className="animate-spin" /> : "Remove Device"}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div >
    );
}
