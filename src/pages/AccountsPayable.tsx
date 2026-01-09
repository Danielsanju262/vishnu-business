import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Wallet, IndianRupee, Calendar, WifiOff, Edit2 } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { Modal } from "../components/ui/Modal";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";

type Supplier = {
    id: string;
    name: string;
};

type Payable = {
    id: string;
    supplier_id: string;
    amount: number;
    due_date: string;
    note?: string;
    status: 'pending' | 'paid';
    recorded_at: string;
};

// Grouped supplier data for display
type GroupedSupplier = {
    supplierId: string;
    supplierName: string;
    totalBalance: number;
    earliestDueDate: string;
    payables: Payable[]; // All payables for this supplier
    primaryPayable: Payable; // The one with earliest due date (for quick actions)
};

export default function AccountsPayable() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Data State
    const [payables, setPayables] = useState<Payable[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState(false);
    const isFirstLoad = useRef(true);

    // Quick Action Modals - synced with browser history
    const [quickActionSupplier, setQuickActionSupplier] = useState<{ id: string; name: string; payable: Payable; totalBalance: number } | null>(null);
    const [actionType, setActionType] = useState<'add' | 'pay' | null>(null);
    const [amount, setAmount] = useState("");
    const [dueDate, setDueDate] = useState("");

    // New Payable Modal - synced with browser history
    const [showNewPayable, setShowNewPayable] = useHistorySyncedState(false, 'payableNewPayable');
    const [newPayableSupplier, setNewPayableSupplier] = useState<string>("");
    const [newPayableSupplierSearch, setNewPayableSupplierSearch] = useState("");
    const [newPayableAmount, setNewPayableAmount] = useState("");
    const [newPayableDueDate, setNewPayableDueDate] = useState("");
    const [showSupplierList, setShowSupplierList] = useState(false);

    // Edit Due Date Modal
    const [editDateSupplier, setEditDateSupplier] = useState<{ id: string; name: string } | null>(null);
    const [editDateValue, setEditDateValue] = useState("");
    const [pendingNewSupplierName, setPendingNewSupplierName] = useState<string | null>(null);

    // Handle back navigation for modals
    useEffect(() => {
        const handlePopState = () => {
            if (quickActionSupplier) {
                setQuickActionSupplier(null);
                setActionType(null);
                setAmount("");
                setDueDate("");
            }
            if (editDateSupplier) setEditDateSupplier(null);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [quickActionSupplier, editDateSupplier]);

    // Close dropdowns on ESC or click outside
    const listRef = useRef<HTMLDivElement>(null);
    useDropdownClose(showSupplierList, () => setShowSupplierList(false), listRef);

    const loadData = useCallback(async () => {
        if (isFirstLoad.current) setLoading(true);

        // Load Payables
        const { data: payablesData, error } = await supabase
            .from("accounts_payable")
            .select("*")
            .eq("status", "pending")
            .order("due_date", { ascending: true });

        if (error) {
            console.error("Error loading payables:", error);
            if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('relation "accounts_payable" does not exist')) {
                setSetupRequired(true);
                setLoading(false);
                return;
            }
        } else if (payablesData) {
            setPayables(payablesData);
        }

        // Load Suppliers
        const { data: suppliersData } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq('is_active', true)
            .order("name");
        if (suppliersData) setSuppliers(suppliersData);

        setLoading(false);
        isFirstLoad.current = false;
    }, []);

    useRealtimeTable('accounts_payable', loadData, []);

    useEffect(() => {
        const channel = supabase
            .channel('suppliers-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'suppliers' },
                () => {
                    supabase.from("suppliers").select("id, name").eq('is_active', true).order("name")
                        .then(({ data }) => {
                            if (data) setSuppliers(data);
                        });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const getSupplierName = (id: string) => {
        return suppliers.find(c => c.id === id)?.name || "Unknown Supplier";
    };

    // Group payables by supplier - ONE card per supplier
    const groupedSuppliers = useMemo((): GroupedSupplier[] => {
        if (!payables || !payables.length) return [];

        try {
            const supplierMap = new Map<string, Payable[]>();

            // Group payables by supplier_id
            payables.forEach(payable => {
                if (!payable || !payable.supplier_id) return;
                const existing = supplierMap.get(payable.supplier_id) || [];
                existing.push(payable);
                supplierMap.set(payable.supplier_id, existing);
            });

            // Convert to array with aggregated data
            const grouped: GroupedSupplier[] = [];
            supplierMap.forEach((supplierPayables, supplierId) => {
                if (!supplierPayables.length) return;

                // Calculate total balance
                const totalBalance = supplierPayables.reduce((sum, r) => {
                    const val = typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount;
                    return sum + (isNaN(val) ? 0 : val);
                }, 0);

                // Find the earliest due date
                const sortedByDueDate = [...supplierPayables].sort((a, b) => {
                    const t1 = new Date(a.due_date).getTime() || 0;
                    const t2 = new Date(b.due_date).getTime() || 0;
                    return t1 - t2;
                });

                const primaryPayable = sortedByDueDate[0];
                if (!primaryPayable) return;

                grouped.push({
                    supplierId,
                    supplierName: getSupplierName(supplierId),
                    totalBalance,
                    earliestDueDate: primaryPayable.due_date,
                    payables: supplierPayables,
                    primaryPayable
                });
            });

            // Sort by earliest due date
            return grouped.sort((a, b) => {
                const t1 = new Date(a.earliestDueDate).getTime() || 0;
                const t2 = new Date(b.earliestDueDate).getTime() || 0;
                return t1 - t2;
            });
        } catch (e) {
            console.error("Error grouping suppliers:", e);
            return [];
        }
    }, [payables, suppliers]);

    const handleQuickAction = async () => {
        if (!amount || !quickActionSupplier) {
            toast("Please enter an amount", "warning");
            return;
        }

        const payable = quickActionSupplier.payable;
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        if (actionType === 'add') {
            // Add new payable
            const newAmount = payable.amount + parseFloat(amount);
            let newNote = payable.note || "";
            if (newNote) newNote += "\n";
            newNote += `[${dateStr} ${timeStr}] New Payable Added: ₹${parseFloat(amount).toLocaleString()}. Balance: ₹${newAmount.toLocaleString()}`;

            const updates: any = {
                amount: newAmount,
                note: newNote
            };

            if (dueDate) {
                updates.due_date = dueDate;
            }

            const { error } = await supabase
                .from('accounts_payable')
                .update(updates)
                .eq('id', payable.id);

            if (error) {
                toast("Failed to add payable", "error");
            } else {
                toast(`Added ₹${parseFloat(amount).toLocaleString()}`, "success");
                closeQuickAction();
            }
        } else if (actionType === 'pay') {
            // Make payment
            const paid = parseFloat(amount);
            const newBalance = payable.amount - paid;
            let newNote = payable.note || "";
            if (newNote) newNote += "\n";
            newNote += `[${dateStr} ${timeStr}] Paid: ₹${paid.toLocaleString()}. Balance: ₹${Math.max(0, newBalance).toLocaleString()}`;

            const updates: any = {
                note: newNote,
                amount: Math.max(0, newBalance)
            };

            if (newBalance <= 0) {
                updates.status = 'paid';
            }

            const { error } = await supabase
                .from('accounts_payable')
                .update(updates)
                .eq('id', payable.id);

            if (error) {
                toast("Failed to record payment", "error");
            } else {
                toast(newBalance <= 0 ? "Fully paid!" : `Paid ₹${paid.toLocaleString()}`, "success");
                closeQuickAction();
            }
        }
    };

    const closeQuickAction = () => {
        setQuickActionSupplier(null);
        setActionType(null);
        setAmount("");
        setDueDate("");
    };

    const handleUpdateDueDate = async () => {
        if (!editDateSupplier || !editDateValue) return;

        const { error } = await supabase
            .from('accounts_payable')
            .update({ due_date: editDateValue })
            .eq('supplier_id', editDateSupplier.id)
            .eq('status', 'pending');

        if (error) {
            toast("Failed to update due date", "error");
        } else {
            toast("Due date updated for all pending items", "success");
            setEditDateSupplier(null);
            setEditDateValue("");
            loadData();
        }
    };

    const createPayableInternal = async (supplierId: string, amountVal: number) => {
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const noteStr = `[${dateStr} ${timeStr}] New Payable Added: \u20b9${amountVal.toLocaleString()}. Balance: \u20b9${amountVal.toLocaleString()}`;

        const { error } = await supabase.from('accounts_payable').insert({
            supplier_id: supplierId,
            amount: amountVal,
            due_date: newPayableDueDate,
            status: 'pending',
            note: noteStr
        });

        if (error) {
            toast("Failed to create payable", "error");
        } else {
            toast("Payable created successfully", "success");
            setShowNewPayable(false);
            setNewPayableSupplier("");
            setNewPayableSupplierSearch("");
            setNewPayableAmount("");
            setNewPayableDueDate("");
            setShowSupplierList(false);
            setPendingNewSupplierName(null);
            loadData();
        }
    };

    const handleConfirmAddSupplier = async () => {
        if (!pendingNewSupplierName) return;

        const { data, error } = await supabase.from('suppliers').insert({
            name: pendingNewSupplierName,
            is_active: true
        }).select().single();

        if (error || !data) {
            toast("Failed to create new supplier", "error");
            return;
        }

        const payableAmount = parseFloat(newPayableAmount);
        await createPayableInternal(data.id, payableAmount);
    };

    const handleNewPayable = async () => {
        if (!newPayableAmount || !newPayableDueDate) {
            toast("Please fill all fields", "warning");
            return;
        }

        const payableAmount = parseFloat(newPayableAmount);
        if (isNaN(payableAmount) || payableAmount <= 0) {
            toast("Please enter a valid amount", "warning");
            return;
        }

        if (!newPayableSupplier) {
            if (newPayableSupplierSearch.trim()) {
                const searchLower = newPayableSupplierSearch.trim().toLowerCase();
                const existing = suppliers.find(s => s.name.toLowerCase() === searchLower);
                if (existing) {
                    await createPayableInternal(existing.id, payableAmount);
                } else {
                    setPendingNewSupplierName(newPayableSupplierSearch.trim());
                }
            } else {
                toast("Please select a supplier", "warning");
            }
            return;
        }

        await createPayableInternal(newPayableSupplier, payableAmount);
    };

    const filteredSuppliersForNewPayable = suppliers.filter(c =>
        c.name.toLowerCase().includes(newPayableSupplierSearch.toLowerCase())
    );

    const getDueStatus = (dateStr: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dateStr);
        due.setHours(0, 0, 0, 0);

        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return {
            text: `Overdue by ${Math.abs(diffDays)} days`,
            classes: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30"
        };
        if (diffDays === 0) return {
            text: "Due Today",
            classes: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30"
        };
        if (diffDays === 1) return {
            text: "Due Tomorrow",
            classes: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30"
        };
        return {
            text: `Due in ${diffDays} days`,
            classes: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700/50"
        };
    };

    if (setupRequired) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-6">
                    <WifiOff size={32} />
                </div>
                <h1 className="text-2xl font-black text-foreground mb-2">Setup Required</h1>
                <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
                    The accounts payable table needs to be created in Supabase first.
                </p>
                <div className="bg-card p-4 rounded-xl border border-border text-left w-full max-w-md mb-6 overflow-hidden">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Run this SQL in Supabase:</p>
                    <code className="text-[10px] block bg-zinc-950 text-zinc-300 p-3 rounded-lg overflow-x-auto font-mono">
                        create table accounts_payable (<br />
                        &nbsp;&nbsp;id uuid default uuid_generate_v4() primary key,<br />
                        &nbsp;&nbsp;supplier_id uuid references suppliers(id),<br />
                        &nbsp;&nbsp;amount numeric not null,<br />
                        &nbsp;&nbsp;due_date date not null,<br />
                        &nbsp;&nbsp;note text,<br />
                        &nbsp;&nbsp;status text default 'pending',<br />
                        &nbsp;&nbsp;recorded_at timestamptz default now()<br />
                        );<br />
                        alter table accounts_payable enable row level security;<br />
                        create policy "Enable all" on accounts_payable for all using (true) with check (true);
                    </code>
                </div>
                <Button onClick={() => { setSetupRequired(false); loadData(); }} className="font-bold">
                    I've Run the SQL, Retry
                </Button>
                <Link to="/" className="mt-4 text-sm font-semibold text-muted-foreground hover:text-foreground">
                    Go Back Home
                </Link>
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-border px-3 py-3 md:px-4 md:py-4">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        <button onClick={() => window.history.back()} className="p-2 -ml-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-150 active:scale-95">
                            <ArrowLeft size={18} strokeWidth={2.5} />
                        </button>
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-500 mb-0.5">
                                <Link to="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Home</Link>
                                <span className="text-zinc-300 dark:text-zinc-700">/</span>
                                <span className="text-zinc-900 dark:text-white">Payables</span>
                            </div>
                            <h1 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white tracking-tight">Accounts Payable</h1>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowNewPayable(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setShowNewPayable(true);
                            }
                        }}
                        tabIndex={0}
                        className="p-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-all duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label="Add new payable"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            <div className="min-h-screen bg-background text-foreground px-3 md:px-4 pb-32 animate-in fade-in w-full md:max-w-2xl md:mx-auto">

                <div className="h-24 md:h-28" />

                {/* Total Stats */}
                {!loading && groupedSuppliers.length > 0 && (
                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-4 mb-6 flex items-center justify-between border border-zinc-200 dark:border-zinc-800">
                        <div>
                            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Total to be Paid</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                                {groupedSuppliers.length} pending supplier{groupedSuppliers.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                ₹{groupedSuppliers.reduce((sum, g) => sum + g.totalBalance, 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 bg-muted/50 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                ) : groupedSuppliers.length === 0 ? (
                    <div className="text-center py-16 px-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="bg-emerald-100 dark:bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-emerald-200 dark:border-emerald-500/30">
                            <IndianRupee size={26} className="text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                        </div>
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 text-base">No pending payables</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs mx-auto">All payments are up to date</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {groupedSuppliers.map(supplier => {
                            const dueStatus = getDueStatus(supplier.earliestDueDate);

                            return (
                                <div
                                    key={supplier.supplierId}
                                    onClick={() => navigate(`/accounts-payable/${supplier.supplierId}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            navigate(`/accounts-payable/${supplier.supplierId}`);
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg transition-all cursor-pointer active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    aria-label={`View payment details for ${supplier.supplierName}`}
                                >
                                    {/* Supplier Info */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-base text-zinc-900 dark:text-white truncate mb-2">
                                                {supplier.supplierName}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border", dueStatus.classes)}>
                                                    <Calendar size={10} strokeWidth={2.5} /> {dueStatus.text}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditDateSupplier({ id: supplier.supplierId, name: supplier.supplierName });
                                                        setEditDateValue(supplier.earliestDueDate);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setEditDateSupplier({ id: supplier.supplierId, name: supplier.supplierName });
                                                            setEditDateValue(supplier.earliestDueDate);
                                                        }
                                                    }}
                                                    className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
                                                    aria-label="Edit due date"
                                                >
                                                    <Edit2 size={14} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                                                ₹{supplier.totalBalance.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                {new Date(supplier.earliestDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setQuickActionSupplier({ id: supplier.supplierId, name: supplier.supplierName, payable: supplier.primaryPayable, totalBalance: supplier.totalBalance });
                                                setActionType('add');
                                            }}
                                            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-1"
                                        >
                                            <Plus size={14} strokeWidth={2.5} />
                                            Add Payable
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setQuickActionSupplier({ id: supplier.supplierId, name: supplier.supplierName, payable: supplier.primaryPayable, totalBalance: supplier.totalBalance });
                                                setActionType('pay');
                                            }}
                                            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
                                        >
                                            <Wallet size={14} strokeWidth={2.5} />
                                            Pay
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick Action Modal */}
            <Modal
                isOpen={!!quickActionSupplier && !!actionType}
                onClose={closeQuickAction}
                title={<h2 className="text-lg font-bold">{actionType === 'add' ? 'Add New Payable' : 'Make Payment'}</h2>}
            >
                <div className="space-y-4">
                    <p className="font-bold text-lg text-zinc-900 dark:text-white truncate">
                        {quickActionSupplier?.name}
                    </p>
                    {actionType === 'pay' && quickActionSupplier && (
                        <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Balance</p>
                            <p className="text-2xl font-black text-zinc-900 dark:text-white">₹{quickActionSupplier.totalBalance.toLocaleString()}</p>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                autoFocus
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-14 text-xl font-bold outline-none transition-all"
                                placeholder="0"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {actionType === 'add' && (
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Due Date (Optional)</label>
                            <input
                                type="date"
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-orange-500 rounded-xl px-4 h-14 md:h-12 text-sm font-bold outline-none transition-all mt-1"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                            />
                            <p className="text-xs text-zinc-500 mt-1 ml-1">Leave empty to keep current due date</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={closeQuickAction} className="h-12">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleQuickAction}
                            className={cn("h-12", actionType === 'add' ? "bg-orange-500 hover:bg-orange-600" : "bg-emerald-500 hover:bg-emerald-600")}
                        >
                            {actionType === 'add' ? 'Add Payable' : 'Pay'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* New Payable Modal */}
            <Modal
                isOpen={showNewPayable}
                onClose={() => {
                    setShowNewPayable(false);
                    setNewPayableSupplier("");
                    setNewPayableSupplierSearch("");
                    setNewPayableAmount("");
                    setNewPayableDueDate("");
                    setShowSupplierList(false);
                }}
                title={<h2 className="text-lg font-bold">Add New Payable</h2>}
            >
                <div className="space-y-4">
                    {/* Supplier Selection */}
                    <div className="relative">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Supplier *</label>
                        <div className="relative mt-1">
                            <input
                                type="text"
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all"
                                placeholder="Search supplier..."
                                value={newPayableSupplierSearch}
                                onChange={e => {
                                    setNewPayableSupplierSearch(e.target.value);
                                    setShowSupplierList(true);
                                }}
                                onFocus={() => setShowSupplierList(true)}
                                autoFocus
                            />
                        </div>
                        {showSupplierList && newPayableSupplierSearch && (
                            <div ref={listRef} className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg">
                                {filteredSuppliersForNewPayable.length > 0 ? (
                                    filteredSuppliersForNewPayable.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                setNewPayableSupplier(c.id);
                                                setNewPayableSupplierSearch(c.name);
                                                setShowSupplierList(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                                newPayableSupplier === c.id ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : ""
                                            )}
                                        >
                                            {c.name}
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-3 text-sm text-zinc-500 text-center">No suppliers found</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount *</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-14 text-xl font-bold outline-none transition-all"
                                placeholder="0"
                                value={newPayableAmount}
                                onChange={e => setNewPayableAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Due Date (Required) */}
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Due Date *</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-14 md:h-12 text-sm font-bold outline-none transition-all mt-1"
                            value={newPayableDueDate}
                            onChange={e => setNewPayableDueDate(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => {
                            setShowNewPayable(false);
                            setNewPayableSupplier("");
                            setNewPayableSupplierSearch("");
                            setNewPayableAmount("");
                            setNewPayableDueDate("");
                            setShowSupplierList(false);
                        }} className="h-12">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleNewPayable}
                            className="h-12 bg-emerald-500 hover:bg-emerald-600"
                        >
                            Create Payable
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Due Date Modal */}
            <Modal
                isOpen={!!editDateSupplier}
                onClose={() => setEditDateSupplier(null)}
                title={<h2 className="text-lg font-bold">Edit Due Date</h2>}
            >
                <div className="space-y-4">
                    <p className="font-bold text-lg text-zinc-900 dark:text-white truncate">
                        {editDateSupplier?.name}
                    </p>
                    <p className="text-sm text-zinc-500">
                        This will update the due date for all pending payables for this supplier.
                    </p>
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">New Due Date</label>
                        <input
                            type="date"
                            autoFocus
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-14 md:h-12 text-sm font-bold outline-none transition-all mt-1"
                            value={editDateValue}
                            onChange={e => setEditDateValue(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setEditDateSupplier(null)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateDueDate} className="h-12 bg-emerald-500 hover:bg-emerald-600">
                            Update Date
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmationModal
                isOpen={!!pendingNewSupplierName}
                onClose={() => setPendingNewSupplierName(null)}
                onConfirm={handleConfirmAddSupplier}
                title="Add New Supplier?"
                description={`"${pendingNewSupplierName}" is not in your list. Do you want to add them now?`}
                confirmText="Add & Create"
                variant="default"
            />
        </>
    );
}
