import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Search, IndianRupee, Calendar, Receipt, X, Check, XCircle, Wifi, WifiOff } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import { useRealtimeTable } from "../hooks/useRealtimeSync";

type Customer = {
    id: string;
    name: string;
};

type PaymentReminder = {
    id: string;
    customer_id: string;
    amount: number;
    due_date: string;
    note?: string;
    status: 'pending' | 'paid';
    recorded_at: string;
};

export default function PaymentReminders() {
    const { toast, confirm } = useToast();

    // Data State
    const [reminders, setReminders] = useState<PaymentReminder[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [isAdding, setIsAdding] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);

    // Selection State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

    // Form State
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [amount, setAmount] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [note, setNote] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");

    // Migrate localStorage data to Supabase on first load
    const migrateLocalStorageToSupabase = useCallback(async () => {
        const stored = localStorage.getItem('vishnu_payment_reminders');
        if (stored) {
            try {
                const localReminders = JSON.parse(stored);
                if (localReminders.length > 0) {
                    // Map old format to new Supabase format
                    const remindersToInsert = localReminders.map((r: any) => ({
                        customer_id: r.customerId,
                        amount: r.amount,
                        due_date: r.dueDate,
                        note: r.note || null,
                        status: r.status,
                        recorded_at: r.recordedAt
                    }));

                    const { error } = await supabase.from('payment_reminders').insert(remindersToInsert);

                    if (!error) {
                        // Clear localStorage after successful migration
                        localStorage.removeItem('vishnu_payment_reminders');
                        console.log('[Migration] Successfully migrated payment reminders to Supabase');
                    } else {
                        console.error('[Migration] Error migrating reminders:', error);
                    }
                }
            } catch (e) {
                console.error('[Migration] Failed to parse localStorage reminders:', e);
            }
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);

        // Check and migrate localStorage data
        await migrateLocalStorageToSupabase();

        // Load Reminders from Supabase
        const { data: remindersData, error } = await supabase
            .from("payment_reminders")
            .select("*")
            .order("due_date", { ascending: true });

        if (error) {
            console.error("Error loading reminders:", error);
            toast("Failed to load reminders", "error");
        } else if (remindersData) {
            setReminders(remindersData);
        }

        // Load Customers from Supabase
        const { data: customersData } = await supabase
            .from("customers")
            .select("id, name")
            .eq('is_active', true)
            .order("name");
        if (customersData) setCustomers(customersData);

        setLoading(false);
    }, [migrateLocalStorageToSupabase, toast]);

    // Setup real-time subscription for payment_reminders table
    const { isConnected } = useRealtimeTable('payment_reminders', loadData, []);

    // Also subscribe to customers for real-time customer updates
    useEffect(() => {
        const channel = supabase
            .channel('customers-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'customers' },
                () => {
                    // Refresh customers when they change
                    supabase.from("customers").select("id, name").eq('is_active', true).order("name")
                        .then(({ data }) => {
                            if (data) setCustomers(data);
                        });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleAddReminder = async () => {
        if (!selectedCustomerId || !amount || !dueDate) {
            toast("Please fill all required fields", "warning");
            return;
        }

        if (editingId) {
            // Update existing reminder
            const { error } = await supabase
                .from('payment_reminders')
                .update({
                    customer_id: selectedCustomerId,
                    amount: parseFloat(amount),
                    due_date: dueDate,
                    note: note || null
                })
                .eq('id', editingId);

            if (error) {
                toast("Failed to update reminder", "error");
                console.error(error);
            } else {
                toast("Reminder updated", "success");
            }
        } else {
            // Create new reminder
            const { error } = await supabase
                .from('payment_reminders')
                .insert({
                    customer_id: selectedCustomerId,
                    amount: parseFloat(amount),
                    due_date: dueDate,
                    note: note || null,
                    status: 'pending',
                    recorded_at: new Date().toISOString()
                });

            if (error) {
                toast("Failed to create reminder", "error");
                console.error(error);
            } else {
                toast("Reminder added", "success");
            }
        }

        resetForm();
    };

    const resetForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setSelectedCustomerId("");
        setAmount("");
        setDueDate("");
        setNote("");
        setCustomerSearch("");
    };

    const handleEdit = (reminder: PaymentReminder) => {
        setEditingId(reminder.id);
        setSelectedCustomerId(reminder.customer_id);
        setAmount(reminder.amount.toString());
        setDueDate(reminder.due_date);
        setNote(reminder.note || "");
        setIsAdding(true);
    };

    const toggleStatus = async (id: string, currentStatus: 'pending' | 'paid') => {
        if (currentStatus === 'paid') return;

        const { error } = await supabase
            .from('payment_reminders')
            .update({ status: 'paid' })
            .eq('id', id);

        if (error) {
            toast("Failed to update status", "error");
        } else {
            toast("Marked as paid", "success");
        }
    };

    const handleDelete = async (id: string) => {
        if (!await confirm("Delete this reminder?")) return;

        const { error } = await supabase
            .from('payment_reminders')
            .delete()
            .eq('id', id);

        if (error) {
            toast("Failed to delete reminder", "error");
        } else {
            toast("Reminder deleted", "success");
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
        if (!await confirm(`Delete ${selectedIds.size} reminders?`)) return;

        const idsToDelete = Array.from(selectedIds);
        const { error } = await supabase
            .from('payment_reminders')
            .delete()
            .in('id', idsToDelete);

        if (error) {
            toast("Failed to delete reminders", "error");
        } else {
            toast(`Deleted ${selectedIds.size} reminders`, "success");
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        }
    };

    const getCustomerName = (id: string) => {
        return customers.find(c => c.id === id)?.name || "Unknown Customer";
    };

    const sortedReminders = [...reminders].sort((a, b) => {
        // Pending first
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        // Then by due date (soonest first)
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const filteredReminders = sortedReminders.filter(r => {
        const cName = getCustomerName(r.customer_id).toLowerCase();
        return cName.includes(searchQuery.toLowerCase());
    });

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase())
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

    return (
        <>
            <div className="min-h-screen bg-background text-foreground px-4 pb-32 animate-in fade-in max-w-lg mx-auto selection:bg-primary/20">
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
                                        <span className="text-zinc-900 dark:text-white">Payments</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Payment Reminders</h1>
                                        {/* Real-time connection indicator */}
                                        <div className={cn(
                                            "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider",
                                            isConnected
                                                ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                : "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                        )}>
                                            {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
                                            {isConnected ? "Live" : "Offline"}
                                        </div>
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
                <div className="h-20" />

                {/* Search */}
                {(!isAdding && reminders.length > 0) && (
                    <div className="relative mb-6 group z-10">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-600 dark:group-focus-within:text-zinc-300 transition-colors duration-200" size={18} />
                        <input
                            type="text"
                            placeholder="Search by customer name..."
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

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 bg-muted/50 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                ) : filteredReminders.length === 0 ? (
                    <div className="text-center py-16 px-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="bg-emerald-100 dark:bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-emerald-200 dark:border-emerald-500/30">
                            <IndianRupee size={26} className="text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                        </div>
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 text-base">No reminders found</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs mx-auto">Add a new payment reminder to track pending dues from customers</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredReminders.map(r => {
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
                                                        {getCustomerName(r.customer_id)}
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
                                            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 mb-4 border border-zinc-100 dark:border-zinc-800">
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 italic line-clamp-2">"{r.note}"</p>
                                            </div>
                                        )}

                                        {/* Actions - Hidden in Selection Mode */}
                                        {!isSelectionMode && (
                                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                                {!isPaid && (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleStatus(r.id, r.status); }}
                                                            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 dark:bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600 active:bg-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.98]"
                                                        >
                                                            <CheckCircle2 size={15} strokeWidth={2.5} /> Mark Paid
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
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Form Modal Overlay */}
            {isAdding && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => resetForm()}
                >
                    <div
                        className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl shadow-black/20 animate-in slide-in-from-bottom-4 duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                                    <Receipt size={18} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                                </div>
                                <h2 className="font-bold text-zinc-900 dark:text-white text-base">{editingId ? "Edit Reminder" : "New Reminder"}</h2>
                            </div>
                            <button
                                onClick={resetForm}
                                className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all duration-150 active:scale-95"
                            >
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="space-y-5">
                            {/* Customer Select */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Customer</label>
                                {selectedCustomerId ? (
                                    <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl p-2 pl-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-sm font-black">
                                                {getCustomerName(selectedCustomerId)[0]}
                                            </div>
                                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">{getCustomerName(selectedCustomerId)}</span>
                                        </div>
                                        <button
                                            onClick={() => setSelectedCustomerId("")}
                                            className="p-2 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-150 active:scale-95"
                                        >
                                            <XCircle size={18} strokeWidth={2} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative z-30">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                        <input
                                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl pl-12 pr-4 h-12 text-sm font-medium outline-none transition-all duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-white"
                                            placeholder="Search customer..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            autoFocus
                                        />
                                        {customerSearch && (
                                            <div className="absolute top-full left-0 right-0 mt-2 max-h-52 overflow-y-auto bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 p-1">
                                                {filteredCustomers.length > 0 ? (
                                                    filteredCustomers.map(c => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => {
                                                                setSelectedCustomerId(c.id);
                                                                setCustomerSearch("");
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm font-medium rounded-lg transition-all duration-100 flex items-center justify-between group"
                                                        >
                                                            {c.name}
                                                            <Check size={14} className="opacity-0 group-hover:opacity-100 text-zinc-900 dark:text-white transition-opacity" strokeWidth={2.5} />
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-6 text-center">
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">No customers found</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Amount & Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 font-bold text-lg">₹</span>
                                        <input
                                            type="number"
                                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl pl-9 pr-4 h-12 text-lg font-bold outline-none transition-all duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-white tabular-nums"
                                            placeholder="0"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Due Date</label>
                                    <input
                                        type="date"
                                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all duration-150 cursor-pointer text-zinc-900 dark:text-white dark:scheme-dark"
                                        value={dueDate}
                                        onChange={e => setDueDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Note */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 ml-1 uppercase tracking-wider">Note (Optional)</label>
                                <input
                                    placeholder="Add a note..."
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 rounded-xl px-4 h-12 text-sm outline-none transition-all duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-white"
                                />
                            </div>

                            <Button
                                onClick={handleAddReminder}
                                className="w-full h-12 text-sm font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:bg-zinc-700 dark:active:bg-zinc-200 shadow-lg shadow-zinc-900/10 dark:shadow-black/10 active:scale-[0.99] transition-all duration-150 rounded-xl mt-2"
                            >
                                {editingId ? "Update Reminder" : "Create Reminder"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
