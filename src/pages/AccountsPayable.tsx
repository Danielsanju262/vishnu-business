import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Trash2, Search, Calendar, Wallet, X, Check, WifiOff, History } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { Modal } from "../components/ui/Modal";

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

export default function AccountsPayable() {
    const { toast, confirm } = useToast();

    // Data State
    const [payables, setPayables] = useState<Payable[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState(false);

    // UI State
    const [isAdding, setIsAdding] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);

    // Selection State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
    const isFirstLoad = useRef(true);

    // Form State
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
    const [amount, setAmount] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [note, setNote] = useState("");
    const [supplierSearch, setSupplierSearch] = useState("");

    // Partial Payment State
    const [makePaymentId, setMakePaymentId] = useState<string | null>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentNextDate, setPaymentNextDate] = useState("");

    const handleMakePayment = async (payable: Payable) => {
        const paid = parseFloat(paymentAmount);
        if (isNaN(paid) || paid <= 0) {
            toast("Please enter a valid amount", "warning");
            return;
        }

        const newBalance = payable.amount - paid;
        const isFullPayment = newBalance <= 0;

        if (!isFullPayment && !paymentNextDate) {
            toast("Please set a next due date for the remaining balance", "warning");
            return;
        }

        // Append to existing note or create new
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        let newNote = payable.note || "";
        if (newNote) newNote += "\n";
        newNote += `[${dateStr} ${timeStr}] Paid: ₹${paid.toLocaleString()}. Balance: ₹${isFullPayment ? 0 : newBalance.toLocaleString()}`;

        const updates: any = {
            note: newNote,
            amount: isFullPayment ? 0 : newBalance
        };

        if (isFullPayment) {
            updates.status = 'paid';
        } else if (paymentNextDate) {
            // Update due date for the remaining balance
            updates.due_date = paymentNextDate;
        }

        const { error } = await supabase
            .from('accounts_payable')
            .update(updates)
            .eq('id', payable.id);

        if (error) {
            console.error(error);
            toast("Failed to update payment", "error");
        } else {
            toast(isFullPayment ? "Marked as fully paid" : `Updated balance: ₹${newBalance.toLocaleString()}`, "success");
            setMakePaymentId(null);
            setPaymentAmount("");
            setPaymentNextDate("");
        }
    };

    const loadData = useCallback(async () => {
        if (isFirstLoad.current) setLoading(true);

        // Load Payables from Supabase
        const { data: payablesData, error } = await supabase
            .from("accounts_payable")
            .select("*")
            .order("due_date", { ascending: true });

        if (error) {
            console.error("Error loading payables:", error);
            if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('relation "accounts_payable" does not exist')) {
                setSetupRequired(true);
                setLoading(false);
                return;
            } else {
                toast(`Error: ${error.message} (${error.code})`, "error");
                setTimeout(async () => {
                    const { data } = await supabase.from("accounts_payable").select("*");
                    if (data) setPayables(data);
                }, 2000);
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
    }, [toast]);

    // Setup real-time subscription
    useRealtimeTable('accounts_payable', loadData, []);

    // Subscribe to suppliers changes
    useEffect(() => {
        const channel = supabase
            .channel('suppliers-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'suppliers' },
                () => {
                    supabase.from("suppliers").select("id, name").order("name")
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



    const handleAddPayable = async () => {
        if (!selectedSupplierId || !amount || !dueDate) {
            toast("Please fill all required fields", "warning");
            return;
        }

        if (editingId) {
            const { error } = await supabase
                .from('accounts_payable')
                .update({
                    supplier_id: selectedSupplierId,
                    amount: parseFloat(amount),
                    due_date: dueDate,
                    note: note || null
                })
                .eq('id', editingId);

            if (error) {
                toast(`Failed to update payable: ${error.message}`, "error");
                console.error(error);
            } else {
                toast("Payable updated", "success");
            }
        } else {
            const { error } = await supabase
                .from('accounts_payable')
                .insert({
                    supplier_id: selectedSupplierId,
                    amount: parseFloat(amount),
                    due_date: dueDate,
                    note: note || null,
                    status: 'pending',
                    recorded_at: new Date().toISOString()
                });

            if (error) {
                toast(`Failed to create payable: ${error.message}`, "error");
                console.error(error);
            } else {
                toast("Payable added", "success");
            }
        }

        resetForm();
    };

    const resetForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setSelectedSupplierId("");
        setAmount("");
        setDueDate("");
        setNote("");
        setSupplierSearch("");
    };

    const handleEdit = (payable: Payable) => {
        setEditingId(payable.id);
        setSelectedSupplierId(payable.supplier_id);
        setAmount(payable.amount.toString());
        setDueDate(payable.due_date);
        setNote(payable.note || "");
        setIsAdding(true);
    };

    const handleDelete = async (id: string) => {
        if (!await confirm("Delete this payable entry?")) return;

        const { error } = await supabase
            .from('accounts_payable')
            .delete()
            .eq('id', id);

        if (error) {
            toast("Failed to delete", "error");
        } else {
            toast("Deleted successfully", "success");
        }
    };

    // Bulk Actions
    const handleTouchStart = (id: string) => {
        if (isSelectionMode) return;
        const timer = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            setIsSelectionMode(true);
            const newSet = new Set(selectedIds);
            newSet.add(id);
            setSelectedIds(newSet);
        }, 500);
        setLongPressTimer(timer);
    };

    const handleTouchEnd = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
            if (newSet.size === 0) setIsSelectionMode(false);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        if (!await confirm(`Delete ${selectedIds.size} entries?`)) return;
        const idsToDelete = Array.from(selectedIds);
        const { error } = await supabase
            .from('accounts_payable')
            .delete()
            .in('id', idsToDelete);

        if (error) {
            toast("Failed to delete entries", "error");
        } else {
            toast(`Deleted ${selectedIds.size} entries`, "success");
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        }
    };

    const getSupplierName = (id: string) => {
        return suppliers.find(v => v.id === id)?.name || "Unknown Supplier";
    };

    const sortedPayables = [...payables].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const filteredPayables = sortedPayables.filter(p => {
        const vName = getSupplierName(p.supplier_id).toLowerCase();
        return vName.includes(searchQuery.toLowerCase());
    });

    const filteredSuppliers = suppliers.filter(v =>
        v.name.toLowerCase().includes(supplierSearch.toLowerCase())
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
                    The accounts payable tables need to be created in Supabase first.
                </p>
                <div className="bg-card p-4 rounded-xl border border-border text-left w-full max-w-md mb-6 overflow-hidden">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Run this SQL in Supabase:</p>
                    <code className="text-[10px] block bg-zinc-950 text-zinc-300 p-3 rounded-lg overflow-x-auto font-mono">
                        create table suppliers (<br />
                        &nbsp;&nbsp;id uuid default uuid_generate_v4() primary key,<br />
                        &nbsp;&nbsp;name text not null,<br />
                        &nbsp;&nbsp;is_active boolean default true,<br />
                        &nbsp;&nbsp;created_at timestamptz default now()<br />
                        );<br />
                        alter table suppliers enable row level security;<br />
                        create policy "Enable all" on suppliers for all using (true) with check (true);<br /><br />

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
            <div className={cn("min-h-screen bg-background text-foreground px-4 pb-32 animate-in fade-in max-w-lg mx-auto selection:bg-primary/20", setupRequired ? "hidden" : "")}>
                {/* Header - Fixed on Top */}
                <div className={cn(
                    "fixed top-0 left-0 right-0 z-50 border-b px-4 py-4 flex items-center justify-between transition-all duration-300 max-w-lg mx-auto backdrop-blur-xl",
                    isSelectionMode
                        ? "bg-white/95 dark:bg-zinc-900/95 border-zinc-300 dark:border-zinc-700"
                        : "bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800"
                )}>
                    {isSelectionMode ? (
                        <div className="flex items-center gap-3 w-full">
                            <button
                                onClick={() => {
                                    setIsSelectionMode(false);
                                    setSelectedIds(new Set());
                                }}
                                className="p-2.5 -ml-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-150 active:scale-95"
                            >
                                <X size={18} strokeWidth={2.5} />
                            </button>
                            <span className="font-bold text-base text-violet-600 dark:text-violet-400">{selectedIds.size} Selected</span>
                            <div className="flex-1" />
                            <button
                                onClick={handleBulkDelete}
                                className="p-2.5 rounded-xl bg-red-500 dark:bg-red-500 text-white hover:bg-red-600 dark:hover:bg-red-600 transition-all duration-150 active:scale-95"
                            >
                                <Trash2 size={18} strokeWidth={2} />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                <Link to="/" className="p-2.5 -ml-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-150 active:scale-95">
                                    <ArrowLeft size={18} strokeWidth={2.5} />
                                </Link>
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-500 mb-0.5">
                                        <Link to="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Home</Link>
                                        <span className="text-zinc-300 dark:text-zinc-700">/</span>
                                        <span className="text-zinc-900 dark:text-white">Payables</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Accounts Payable</h1>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    resetForm();
                                    setIsAdding(!isAdding);
                                }}
                                className={cn(
                                    "rounded-xl w-10 h-10 flex items-center justify-center transition-all duration-200 active:scale-95 border-2",
                                    isAdding
                                        ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900 rotate-45"
                                        : "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/20 dark:shadow-black/20 hover:bg-zinc-800 dark:hover:bg-zinc-100"
                                )}
                            >
                                <Plus size={20} strokeWidth={2.5} />
                            </button>
                        </>
                    )}
                </div>

                {/* Spacer for fixed header */}
                <div className="h-28" />

                {/* Search */}
                {(!isAdding && payables.length > 0) && (
                    <div className="relative mb-6 group z-10">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-600 dark:group-focus-within:text-zinc-300 transition-colors duration-200" size={18} />
                        <input
                            type="text"
                            placeholder="Search by supplier name..."
                            className="w-full pl-12 pr-12 h-13 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:border-zinc-400 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-800 outline-none transition-all duration-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100 text-sm font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all duration-150 active:scale-95"
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                )}



                {/* Total Stats - Always visible when not loading */}
                {!loading && (
                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-4 mb-6 flex items-center justify-between border border-zinc-200 dark:border-zinc-800">
                        <div>
                            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Total to be Paid</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                                {filteredPayables.filter(p => p.status === 'pending').length} pending payments
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                ₹{filteredPayables
                                    .filter(p => p.status === 'pending')
                                    .reduce((sum, p) => sum + p.amount, 0)
                                    .toLocaleString()}
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
                ) : filteredPayables.length === 0 ? (
                    <div className="text-center py-16 px-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="bg-emerald-100 dark:bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-emerald-200 dark:border-emerald-500/30">
                            <Wallet size={26} className="text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                        </div>
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 text-base">No payables found</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs mx-auto mb-6">Add a new payable to track money you owe to suppliers</p>
                        <Button onClick={() => { resetForm(); setIsAdding(true); }} className="mx-auto font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
                            <Plus size={16} className="mr-2" strokeWidth={3} /> Add Payable
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredPayables.map(r => {
                            const isPaid = r.status === 'paid';
                            const dueStatus = getDueStatus(r.due_date);
                            const isSelected = selectedIds.has(r.id);

                            return (
                                <div
                                    key={r.id}
                                    className={cn(
                                        "group relative overflow-hidden bg-white dark:bg-zinc-900 border-2 transition-all duration-200 rounded-2xl",
                                        isSelected
                                            ? "border-violet-500 dark:border-violet-400 ring-2 ring-violet-500/20 dark:ring-violet-400/20 bg-violet-50 dark:bg-violet-500/10"
                                            : isPaid
                                                ? "border-zinc-200 dark:border-zinc-800 opacity-50 hover:opacity-75"
                                                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg hover:shadow-zinc-900/5 dark:hover:shadow-black/20",
                                        isSelectionMode ? "cursor-pointer active:scale-[0.99]" : ""
                                    )}
                                    onTouchStart={() => handleTouchStart(r.id)}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={() => handleTouchStart(r.id)}
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                    onClick={(e) => {
                                        if (isSelectionMode) {
                                            e.preventDefault();
                                            toggleSelection(r.id);
                                        }
                                    }}
                                >
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            {/* Selection Checkbox */}
                                            {isSelectionMode && (
                                                <div className="absolute top-4 right-4 z-20">
                                                    <div className={cn(
                                                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-150",
                                                        isSelected ? "bg-violet-500 dark:bg-violet-500 border-violet-500 dark:border-violet-500" : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
                                                    )}>
                                                        {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0 pr-10">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className={cn("font-bold text-base truncate", isPaid ? "text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-400/50" : "text-zinc-900 dark:text-white")}>
                                                        {getSupplierName(r.supplier_id)}
                                                    </h3>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {isPaid ? (
                                                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-emerald-200 dark:border-emerald-500/30">
                                                            <Check size={10} strokeWidth={3} /> Paid
                                                        </span>
                                                    ) : (
                                                        <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border", dueStatus.classes)}>
                                                            <Calendar size={10} strokeWidth={2.5} /> {dueStatus.text}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {!isSelectionMode && (
                                                <div className="text-right shrink-0">
                                                    <span className={cn(
                                                        "text-xl font-bold block tracking-tight tabular-nums",
                                                        isPaid ? "text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-400/50" : "text-zinc-900 dark:text-white"
                                                    )}>
                                                        ₹{r.amount.toLocaleString()}
                                                    </span>
                                                    <div className="flex items-center justify-end gap-1.5 mt-1 text-zinc-500 dark:text-zinc-400">
                                                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                                                            {new Date(r.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {r.note && (
                                            <div className="mb-4 space-y-2">
                                                {/* Helper to separate history logs from actual user notes */}
                                                {(() => {
                                                    const lines = r.note.split('\n');
                                                    const historyLines = lines.filter(l => l.startsWith('[') && l.includes('Paid:'));
                                                    const noteLines = lines.filter(l => !l.startsWith('[') || !l.includes('Paid:'));

                                                    return (
                                                        <>
                                                            {/* Regular Notes */}
                                                            {noteLines.length > 0 && (
                                                                <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3 border border-amber-100 dark:border-amber-500/20">
                                                                    <p className="text-xs text-amber-900 dark:text-amber-200 font-medium italic">
                                                                        {noteLines.join('\n')}
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {/* Payment History */}
                                                            {historyLines.length > 0 && (
                                                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                                                                    <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                                                                        <History size={12} className="text-zinc-500" />
                                                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Payment History</span>
                                                                    </div>
                                                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                                                        {historyLines.map((line, i) => {
                                                                            try {
                                                                                const dateMatch = line.match(/\[(.*?)\]/);
                                                                                const date = dateMatch ? dateMatch[1] : "Unknown Date";
                                                                                const amountMatch = line.match(/Paid: (.*?)\./);
                                                                                const amount = amountMatch ? amountMatch[1] : "0";
                                                                                const balanceMatch = line.match(/Balance: (.*)/);
                                                                                const balance = balanceMatch ? balanceMatch[1] : "0";

                                                                                return (
                                                                                    <div key={i} className="px-3 py-2 flex items-center justify-between hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">{date}</span>
                                                                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Paid {amount}</span>
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            <span className="text-[10px] font-medium text-zinc-400 block">Balance</span>
                                                                                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{balance}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            } catch (e) {
                                                                                return <div key={i} className="px-3 py-2 text-xs text-zinc-500">{line}</div>
                                                                            }
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                            {!isPaid && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMakePaymentId(r.id); setPaymentAmount(""); setPaymentNextDate(""); }}
                                                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 dark:bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600 active:bg-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.98]"
                                                    >
                                                        <Wallet size={15} strokeWidth={2.5} /> Make Payment
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
                                                        className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:bg-zinc-300 dark:active:bg-zinc-600 text-zinc-700 dark:text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.98]"
                                                    >
                                                        Edit
                                                    </button>
                                                </>
                                            )}

                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                                                className={cn(
                                                    "flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-red-100 dark:hover:bg-red-500/20 active:bg-red-200 dark:active:bg-red-500/30 text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.98]",
                                                    isPaid ? "flex-1" : ""
                                                )}
                                            >
                                                <Trash2 size={15} strokeWidth={2} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Make Payment Modal */}
            <Modal
                isOpen={!!makePaymentId}
                onClose={() => setMakePaymentId(null)}
                title={<h2 className="text-lg font-bold">Make Payment</h2>}
            >
                {(() => {
                    const payable = payables.find(r => r.id === makePaymentId);
                    if (!payable) return null;

                    return (
                        <div className="space-y-4">
                            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl text-center border-2 border-zinc-100 dark:border-zinc-800">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider mb-1">Current Balance Due</p>
                                <p className="text-2xl font-black text-zinc-900 dark:text-white">₹{payable.amount.toLocaleString()}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Amount Paid</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 font-bold text-lg">₹</span>
                                    <input
                                        type="number"
                                        autoFocus
                                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl pl-9 pr-20 h-14 text-xl font-bold outline-none transition-all duration-150 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-white tabular-nums"
                                        placeholder="0"
                                        value={paymentAmount}
                                        onChange={e => setPaymentAmount(e.target.value)}
                                    />
                                    <button
                                        onClick={() => setPaymentAmount(payable.amount.toString())}
                                        className="absolute right-2 top-2 bottom-2 px-3 bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-600 hover:bg-emerald-50 dark:hover:bg-zinc-600 transition-colors"
                                    >
                                        FULL
                                    </button>
                                </div>
                            </div>

                            {(() => {
                                const paid = parseFloat(paymentAmount || "0");
                                const remaining = payable.amount - paid;

                                if (remaining > 0 && paid > 0) {
                                    return (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Next Due Date (For Remaining ₹{remaining.toLocaleString()})</label>
                                            <input
                                                type="date"
                                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all duration-150 cursor-pointer text-zinc-900 dark:text-white dark:scheme-dark"
                                                value={paymentNextDate}
                                                onChange={e => setPaymentNextDate(e.target.value)}
                                            />
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setMakePaymentId(null)}
                                    className="h-12 font-bold"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => handleMakePayment(payable)}
                                    disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                                    className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                                >
                                    Confirm
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Add Payable Modal/Form */}
            <Modal
                isOpen={isAdding}
                onClose={() => resetForm()}
                title={<h2 className="text-lg font-bold">{editingId ? "Edit Payable" : "Add Payable"}</h2>}
            >
                <div className="space-y-4">
                    {/* Supplier Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Supplier</label>
                        {!selectedSupplierId ? (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search or add supplier..."
                                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl pl-10 pr-4 h-12 text-sm font-bold outline-none transition-all duration-150 text-zinc-900 dark:text-white"
                                        value={supplierSearch}
                                        onChange={e => setSupplierSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                {supplierSearch.trim() && (
                                    <div className="max-h-48 overflow-y-auto border-2 border-zinc-100 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {filteredSuppliers.length > 0 ? (
                                            filteredSuppliers.map(v => (
                                                <button
                                                    key={v.id}
                                                    onClick={() => { setSelectedSupplierId(v.id); setSupplierSearch(""); }}
                                                    className="w-full text-left px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold text-zinc-700 dark:text-zinc-200"
                                                >
                                                    {v.name}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-4 text-center">
                                                <p className="text-xs text-zinc-500 mb-2">No supplier found named "{supplierSearch}"</p>
                                                <Link to="/suppliers" className="text-xs font-bold text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300">
                                                    Go to Suppliers List to add new
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl border-2 border-zinc-200 dark:border-zinc-700">
                                <span className="font-bold text-zinc-900 dark:text-white text-sm">{getSupplierName(selectedSupplierId)}</span>
                                <button
                                    onClick={() => setSelectedSupplierId("")}
                                    className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1"
                                >
                                    Change
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Amount</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 font-bold text-lg">₹</span>
                            <input
                                type="number"
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl pl-9 pr-4 h-12 text-lg font-bold outline-none transition-all duration-150 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-white tabular-nums"
                                placeholder="0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Due Date */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Due Date</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all duration-150 cursor-pointer text-zinc-900 dark:text-white dark:scheme-dark"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                        />
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Note (Optional)</label>
                        <textarea
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl p-4 min-h-[100px] text-sm font-medium outline-none transition-all duration-150 resize-none text-zinc-900 dark:text-white"
                            placeholder="Add payment details..."
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                    </div>

                    <Button onClick={handleAddPayable} className="w-full h-12 text-base font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90">
                        {editingId ? "Update Payable" : "Add Payable"}
                    </Button>
                </div>
            </Modal>
        </>
    );
}
