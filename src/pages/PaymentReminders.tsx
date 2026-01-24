import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Receipt, IndianRupee, Calendar, WifiOff, Edit2, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { Modal } from "../components/ui/Modal";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";

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

// Grouped customer data for display
type GroupedCustomer = {
    customerId: string;
    customerName: string;
    totalBalance: number;
    earliestDueDate: string;
    reminders: PaymentReminder[]; // All reminders for this customer
    primaryReminder: PaymentReminder; // The one with earliest due date (for quick actions)
};

export default function PaymentReminders() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Data State
    const [reminders, setReminders] = useState<PaymentReminder[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState(false);
    const isFirstLoad = useRef(true);

    // Quick Action Modals - synced with browser history
    const [quickActionCustomer, setQuickActionCustomer] = useState<{ id: string; name: string; reminder: PaymentReminder; totalBalance: number } | null>(null);
    const [isQuickActionOpen, setIsQuickActionOpen] = useHistorySyncedState(false, 'paymentQuickAction');
    const [actionType, setActionType] = useState<'add' | 'receive' | null>(null);
    const [amount, setAmount] = useState("");
    const [dueDate, setDueDate] = useState("");

    // New Reminder Modal - synced with browser history
    const [showNewReminder, setShowNewReminder] = useHistorySyncedState(false, 'paymentNewReminder');
    const [newReminderCustomer, setNewReminderCustomer] = useState<string>("");
    const [newReminderCustomerSearch, setNewReminderCustomerSearch] = useState("");
    const [newReminderAmount, setNewReminderAmount] = useState("");
    const [newReminderDueDate, setNewReminderDueDate] = useState("");
    const [showCustomerList, setShowCustomerList] = useState(false);

    // Search for main list
    const [searchQuery, setSearchQuery] = useState("");

    // Date Filter State
    const [dateFilter, setDateFilter] = useState("thisMonth");
    const [customDateRange, setCustomDateRange] = useState({
        start: format(new Date(), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [showFilterDropdown, setShowFilterDropdown] = useHistorySyncedState(false, 'paymentDateFilter');
    const [showCustomDateModal, setShowCustomDateModal] = useHistorySyncedState(false, 'paymentCustomDate');
    const filterDropdownRef = useRef<HTMLDivElement>(null);

    // Sort State for customer cards
    const [sortBy, setSortBy] = useState<'dueDateAsc' | 'dueDateDesc' | 'amountAsc' | 'amountDesc'>('dueDateAsc');
    const [showSortDropdown, setShowSortDropdown] = useHistorySyncedState(false, 'paymentSortFilter');
    const sortDropdownRef = useRef<HTMLDivElement>(null);

    // Earned Amount State
    const [earnedAmount, setEarnedAmount] = useState(0);
    const [earnedLoading, setEarnedLoading] = useState(false);
    const [isEarnedExpanded, setIsEarnedExpanded] = useState(false);
    const [earnedBreakdown, setEarnedBreakdown] = useState<{ customerId: string; customerName: string; total: number }[]>([]);

    // Edit Due Date Modal
    const [editDateCustomer, setEditDateCustomer] = useState<{ id: string; name: string } | null>(null);
    const [isEditDateOpen, setIsEditDateOpen] = useHistorySyncedState(false, 'paymentEditDate');
    const [editDateValue, setEditDateValue] = useState("");
    const [pendingNewCustomerName, setPendingNewCustomerName] = useState<string | null>(null);

    // Sync data state with history state visibility
    useEffect(() => {
        if (!isQuickActionOpen) {
            setQuickActionCustomer(null);
            setActionType(null);
            setAmount("");
            setDueDate("");
        }
    }, [isQuickActionOpen]);

    useEffect(() => {
        if (!isEditDateOpen) {
            setEditDateCustomer(null);
        }
    }, [isEditDateOpen]);

    // Close dropdowns on ESC or click outside
    const listRef = useRef<HTMLDivElement>(null);
    useDropdownClose(showCustomerList, () => setShowCustomerList(false), listRef);
    useDropdownClose(showFilterDropdown, () => setShowFilterDropdown(false), filterDropdownRef);

    // Get date range based on filter
    const getDateRange = useCallback(() => {
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');

        switch (dateFilter) {
            case 'today':
                return { start: todayStr, end: todayStr };
            case 'yesterday':
                const yest = format(subDays(now, 1), 'yyyy-MM-dd');
                return { start: yest, end: yest };
            case 'thisWeek':
                return {
                    start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
                    end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
                };
            case 'thisMonth':
                return {
                    start: format(startOfMonth(now), 'yyyy-MM-dd'),
                    end: format(endOfMonth(now), 'yyyy-MM-dd')
                };
            case 'lastMonth':
                const lastMonth = subMonths(now, 1);
                return {
                    start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
                    end: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
                };
            case 'custom':
                return customDateRange;
            default:
                return { start: todayStr, end: todayStr };
        }
    }, [dateFilter, customDateRange]);

    // Fetch earned amount based on date filter
    const fetchEarnedAmount = useCallback(async () => {
        setEarnedLoading(true);
        try {
            const { start, end } = getDateRange();

            const { data, error } = await supabase
                .from('credit_collections')
                .select('amount, customer_id')
                .gte('collected_at', `${start}T00:00:00`)
                .lte('collected_at', `${end}T23:59:59`);

            if (error) {
                // Table might not exist yet
                if (error.code === '42P01' || error.message.includes('does not exist')) {
                    setEarnedAmount(0);
                    setEarnedBreakdown([]);
                } else {
                    console.error('Error fetching earned amount:', error);
                }
            } else if (data) {
                const total = data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                setEarnedAmount(total);

                // Group by customer
                const customerTotals: Record<string, number> = {};
                data.forEach(item => {
                    const cid = item.customer_id || 'unknown';
                    customerTotals[cid] = (customerTotals[cid] || 0) + (Number(item.amount) || 0);
                });

                // Convert to array with customer names
                const breakdown = Object.entries(customerTotals).map(([customerId, total]) => {
                    const customer = customers.find(c => c.id === customerId);
                    return {
                        customerId,
                        customerName: customer?.name || 'Unknown Customer',
                        total
                    };
                }).sort((a, b) => b.total - a.total); // Sort by highest first

                setEarnedBreakdown(breakdown);
            }
        } catch (err) {
            console.error('Error fetching earned amount:', err);
        } finally {
            setEarnedLoading(false);
        }
    }, [getDateRange, customers]);

    // Fetch earned amount when date filter changes
    useEffect(() => {
        fetchEarnedAmount();
    }, [fetchEarnedAmount]);

    const loadData = useCallback(async () => {
        if (isFirstLoad.current) setLoading(true);

        // Load Reminders
        const { data: remindersData, error } = await supabase
            .from("payment_reminders")
            .select("*")
            .eq("status", "pending")
            .order("due_date", { ascending: true });

        if (error) {
            console.error("Error loading reminders:", error);
            if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('relation "payment_reminders" does not exist')) {
                setSetupRequired(true);
                setLoading(false);
                return;
            }
        } else if (remindersData) {
            setReminders(remindersData);
        }

        // Load Customers
        const { data: customersData } = await supabase
            .from("customers")
            .select("id, name")
            .eq('is_active', true)
            .order("name");
        if (customersData) setCustomers(customersData);

        setLoading(false);
        isFirstLoad.current = false;
    }, []);

    useRealtimeTable('payment_reminders', loadData, []);

    useEffect(() => {
        const channel = supabase
            .channel('customers-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'customers' },
                () => {
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

    const getCustomerName = (id: string) => {
        return customers.find(c => c.id === id)?.name || "Unknown Customer";
    };

    // Group reminders by customer - ONE card per customer
    const groupedCustomers = useMemo((): GroupedCustomer[] => {
        if (!reminders || !reminders.length) return [];

        try {
            const customerMap = new Map<string, PaymentReminder[]>();

            // Group reminders by customer_id
            reminders.forEach(reminder => {
                if (!reminder || !reminder.customer_id) return;
                const existing = customerMap.get(reminder.customer_id) || [];
                existing.push(reminder);
                customerMap.set(reminder.customer_id, existing);
            });

            // Convert to array with aggregated data
            const grouped: GroupedCustomer[] = [];
            customerMap.forEach((customerReminders, customerId) => {
                if (!customerReminders.length) return;

                // Calculate total balance - safely handle potential string/number mix
                const totalBalance = customerReminders.reduce((sum, r) => {
                    const val = typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount;
                    return sum + (isNaN(val) ? 0 : val);
                }, 0);

                // Find the earliest due date safely
                const sortedByDueDate = [...customerReminders].sort((a, b) => {
                    const t1 = new Date(a.due_date).getTime() || 0;
                    const t2 = new Date(b.due_date).getTime() || 0;
                    return t1 - t2;
                });

                const primaryReminder = sortedByDueDate[0];
                if (!primaryReminder) return;

                grouped.push({
                    customerId,
                    customerName: getCustomerName(customerId),
                    totalBalance,
                    earliestDueDate: primaryReminder.due_date,
                    reminders: customerReminders,
                    primaryReminder
                });
            });

            // Sort by earliest due date
            return grouped.sort((a, b) => {
                const t1 = new Date(a.earliestDueDate).getTime() || 0;
                const t2 = new Date(b.earliestDueDate).getTime() || 0;
                return t1 - t2;
            });
        } catch (e) {
            console.error("Error grouping customers:", e);
            return [];
        }
    }, [reminders, customers]);

    const handleQuickAction = async () => {
        if (!amount || !quickActionCustomer) {
            toast("Please enter an amount", "warning");
            return;
        }

        const reminder = quickActionCustomer.reminder;
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        if (actionType === 'add') {
            // Add new due
            const newAmount = reminder.amount + parseFloat(amount);
            let newNote = reminder.note || "";
            if (newNote) newNote += "\n";
            newNote += `[${dateStr} ${timeStr}] New Due Added: ₹${parseFloat(amount).toLocaleString()}. Balance: ₹${newAmount.toLocaleString()}`;

            const updates: any = {
                amount: newAmount,
                note: newNote
            };

            if (dueDate) {
                updates.due_date = dueDate;
            }

            const { error } = await supabase
                .from('payment_reminders')
                .update(updates)
                .eq('id', reminder.id);

            if (error) {
                toast("Failed to add due", "error");
            } else {
                toast(`Added ₹${parseFloat(amount).toLocaleString()}`, "success");
                closeQuickAction();
            }
        } else if (actionType === 'receive') {
            // Receive payment
            const received = parseFloat(amount);
            const newBalance = reminder.amount - received;
            let newNote = reminder.note || "";
            if (newNote) newNote += "\n";
            newNote += `[${dateStr} ${timeStr}] Received: ₹${received.toLocaleString()}. Balance: ₹${Math.max(0, newBalance).toLocaleString()}`;

            const updates: any = {
                note: newNote,
                amount: Math.max(0, newBalance)
            };

            if (newBalance <= 0) {
                updates.status = 'paid';
            }

            const { error } = await supabase
                .from('payment_reminders')
                .update(updates)
                .eq('id', reminder.id);

            if (error) {
                toast("Failed to record payment", "error");
            } else {
                // Log to credit_collections for tracking earned amount
                await supabase.from('credit_collections').insert({
                    customer_id: quickActionCustomer.id,
                    payment_reminder_id: reminder.id,
                    amount: received,
                    collected_at: new Date().toISOString(),
                    note: `Received from ${quickActionCustomer.name}`
                });

                // Refresh earned amount
                fetchEarnedAmount();

                toast(newBalance <= 0 ? "Fully paid!" : `Received ₹${received.toLocaleString()}`, "success");
                closeQuickAction();
            }
        }
    };

    const closeQuickAction = () => {
        setIsQuickActionOpen(false);
    };

    const handleUpdateDueDate = async () => {
        if (!editDateCustomer || !editDateValue) {
            toast("Please select a date", "warning");
            return;
        }

        const { error } = await supabase
            .from('payment_reminders')
            .update({ due_date: editDateValue })
            .eq('customer_id', editDateCustomer.id)
            .eq('status', 'pending');

        if (error) {
            toast("Failed to update due date", "error");
        } else {
            toast("Due date updated for all pending items", "success");
            toast("Due date updated for all pending items", "success");
            setIsEditDateOpen(false);
            setEditDateValue("");
            loadData();
        }
    };

    const createReminderInternal = async (customerId: string, amountVal: number) => {
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const noteStr = `[${dateStr} ${timeStr}] New Due Added: \u20b9${amountVal.toLocaleString()}. Balance: \u20b9${amountVal.toLocaleString()}`;

        const { error } = await supabase.from('payment_reminders').insert({
            customer_id: customerId,
            amount: amountVal,
            due_date: newReminderDueDate,
            status: 'pending',
            note: noteStr
        });

        if (error) {
            toast("Failed to create reminder", "error");
        } else {
            toast("Reminder created successfully", "success");
            setShowNewReminder(false);
            setNewReminderCustomer("");
            setNewReminderCustomerSearch("");
            setNewReminderAmount("");
            setNewReminderDueDate("");
            setShowCustomerList(false);
            setPendingNewCustomerName(null);
            loadData();
        }
    };

    const handleConfirmAddCustomer = async () => {
        if (!pendingNewCustomerName) return;

        const { data, error } = await supabase.from('customers').insert({
            name: pendingNewCustomerName,
            is_active: true
        }).select().single();

        if (error || !data) {
            toast("Failed to create new customer", "error");
            return;
        }

        const reminderAmount = parseFloat(newReminderAmount);
        await createReminderInternal(data.id, reminderAmount);
    };

    const handleNewReminder = async () => {
        if (!newReminderAmount) {
            toast("Please enter an amount", "warning");
            return;
        }

        if (!newReminderDueDate) {
            toast("Please select a due date", "warning");
            return;
        }

        const reminderAmount = parseFloat(newReminderAmount);
        if (isNaN(reminderAmount) || reminderAmount <= 0) {
            toast("Please enter a valid amount greater than 0", "warning");
            return;
        }

        if (!newReminderCustomer) {
            if (newReminderCustomerSearch.trim()) {
                const searchLower = newReminderCustomerSearch.trim().toLowerCase();
                const existing = customers.find(c => c.name.toLowerCase() === searchLower);
                if (existing) {
                    await createReminderInternal(existing.id, reminderAmount);
                } else {
                    setPendingNewCustomerName(newReminderCustomerSearch.trim());
                }
            } else {
                toast("Please select a customer", "warning");
            }
            return;
        }

        await createReminderInternal(newReminderCustomer, reminderAmount);
    };

    const filteredCustomersForNewReminder = customers.filter(c =>
        c.name.toLowerCase().includes(newReminderCustomerSearch.toLowerCase())
    );

    const filteredGroupedCustomers = useMemo(() => {
        let filtered = groupedCustomers.filter(c =>
            c.customerName.toLowerCase().includes(searchQuery.toLowerCase())
        );

        // Apply sorting
        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'dueDateAsc':
                    return new Date(a.earliestDueDate).getTime() - new Date(b.earliestDueDate).getTime();
                case 'dueDateDesc':
                    return new Date(b.earliestDueDate).getTime() - new Date(a.earliestDueDate).getTime();
                case 'amountAsc':
                    return a.totalBalance - b.totalBalance;
                case 'amountDesc':
                    return b.totalBalance - a.totalBalance;
                default:
                    return 0;
            }
        });
    }, [groupedCustomers, searchQuery, sortBy]);

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
                    The payment reminders table needs to be created in Supabase first.
                </p>
                <div className="bg-card p-4 rounded-xl border border-border text-left w-full max-w-md mb-6 overflow-hidden">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Run this SQL in Supabase:</p>
                    <code className="text-[10px] block bg-zinc-950 text-zinc-300 p-3 rounded-lg overflow-x-auto font-mono">
                        create table payment_reminders (<br />
                        &nbsp;&nbsp;id uuid default uuid_generate_v4() primary key,<br />
                        &nbsp;&nbsp;customer_id uuid references customers(id),<br />
                        &nbsp;&nbsp;amount numeric not null,<br />
                        &nbsp;&nbsp;due_date date not null,<br />
                        &nbsp;&nbsp;note text,<br />
                        &nbsp;&nbsp;status text default 'pending',<br />
                        &nbsp;&nbsp;recorded_at timestamptz default now()<br />
                        );<br />
                        alter table payment_reminders enable row level security;<br />
                        create policy "Enable all" on payment_reminders for all using (true) with check (true);
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
                                <span className="text-zinc-900 dark:text-white">Payments</span>
                            </div>
                            <h1 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white tracking-tight">Payment Reminders</h1>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowNewReminder(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setShowNewReminder(true);
                            }
                        }}
                        tabIndex={0}
                        className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label="Add new payment reminder"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            <div className="min-h-screen bg-background text-foreground px-3 md:px-4 pb-32 animate-in fade-in w-full md:max-w-2xl md:mx-auto">

                <div className="h-23.5 md:h-28" />

                {/* Search Bar */}
                {!loading && groupedCustomers.length > 0 && (
                    <div className="relative mb-3">
                        <input
                            type="text"
                            placeholder="Search customers..."
                            className="w-full px-4 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 focus:bg-background outline-none transition-all placeholder:text-zinc-400 font-bold text-zinc-900 dark:text-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}

                {/* Date Filter and Sort */}
                {!loading && (
                    <div className="flex items-center gap-2 mb-4">
                        {/* Date Filter */}
                        <div className="relative" ref={filterDropdownRef}>
                            <button
                                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            >
                                <Calendar size={14} className="opacity-70" />
                                <span>
                                    {dateFilter === 'today' && 'Today'}
                                    {dateFilter === 'yesterday' && 'Yesterday'}
                                    {dateFilter === 'thisWeek' && 'This Week'}
                                    {dateFilter === 'thisMonth' && 'This Month'}
                                    {dateFilter === 'lastMonth' && 'Last Month'}
                                    {dateFilter === 'custom' && 'Custom'}
                                </span>
                                <ChevronDown size={12} className={`opacity-70 transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showFilterDropdown && (
                                <div className="absolute left-0 top-full mt-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                                    {['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth', 'custom'].map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => {
                                                if (filter === 'custom') {
                                                    setShowFilterDropdown(false);
                                                    setTimeout(() => {
                                                        setShowCustomDateModal(true);
                                                    }, 100);
                                                } else {
                                                    setDateFilter(filter);
                                                    setShowFilterDropdown(false);
                                                }
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                                dateFilter === filter ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" : "text-zinc-600 dark:text-zinc-400"
                                            )}
                                        >
                                            {filter === 'today' && 'Today'}
                                            {filter === 'yesterday' && 'Yesterday'}
                                            {filter === 'thisWeek' && 'This Week'}
                                            {filter === 'thisMonth' && 'This Month'}
                                            {filter === 'lastMonth' && 'Last Month'}
                                            {filter === 'custom' && 'Custom Range...'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sort Filter */}
                        <div className="relative" ref={sortDropdownRef}>
                            <button
                                onClick={() => setShowSortDropdown(!showSortDropdown)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            >
                                <SlidersHorizontal size={14} className="opacity-70" />
                                <span>
                                    {sortBy === 'dueDateAsc' && 'Due Date ↑'}
                                    {sortBy === 'dueDateDesc' && 'Due Date ↓'}
                                    {sortBy === 'amountAsc' && 'Amount ↑'}
                                    {sortBy === 'amountDesc' && 'Amount ↓'}
                                </span>
                                <ChevronDown size={12} className={`opacity-70 transition-transform duration-200 ${showSortDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showSortDropdown && (
                                <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                                    {[
                                        { value: 'dueDateAsc', label: 'Due Date: Earliest First' },
                                        { value: 'dueDateDesc', label: 'Due Date: Latest First' },
                                        { value: 'amountAsc', label: 'Amount: Lowest First' },
                                        { value: 'amountDesc', label: 'Amount: Highest First' }
                                    ].map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => {
                                                setSortBy(option.value as any);
                                                setShowSortDropdown(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                                sortBy === option.value ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" : "text-zinc-600 dark:text-zinc-400"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Total Stats Card */}
                {!loading && groupedCustomers.length > 0 && (
                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-4 mb-6 border border-zinc-200 dark:border-zinc-800">
                        {/* Total Outstanding Row */}
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Total to be Received</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                                    {filteredGroupedCustomers.length} customer{filteredGroupedCustomers.length !== 1 ? 's' : ''} found
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                                    ₹{filteredGroupedCustomers.reduce((sum, g) => sum + g.totalBalance, 0).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-zinc-200 dark:border-zinc-700 my-3" />

                        {/* Earned Row - Expandable */}
                        <div>
                            <button
                                onClick={() => setIsEarnedExpanded(!isEarnedExpanded)}
                                className="w-full flex items-center justify-between hover:bg-zinc-200/50 dark:hover:bg-zinc-700/30 -mx-2 px-2 py-1 rounded-lg transition-colors"
                            >
                                <div className="text-left">
                                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                        Earned
                                        <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 normal-case">
                                            ({dateFilter === 'today' ? 'Today' :
                                                dateFilter === 'yesterday' ? 'Yesterday' :
                                                    dateFilter === 'thisWeek' ? 'This Week' :
                                                        dateFilter === 'thisMonth' ? 'This Month' :
                                                            dateFilter === 'lastMonth' ? 'Last Month' :
                                                                'Custom'})
                                        </span>
                                        {isEarnedExpanded ? (
                                            <ChevronUp size={14} className="text-zinc-400" />
                                        ) : (
                                            <ChevronDown size={14} className="text-zinc-400" />
                                        )}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                                        {earnedBreakdown.length} customer{earnedBreakdown.length !== 1 ? 's' : ''} • Tap to {isEarnedExpanded ? 'collapse' : 'expand'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {earnedLoading ? (
                                        <div className="h-7 w-20 bg-zinc-300 dark:bg-zinc-700 rounded animate-pulse" />
                                    ) : (
                                        <p className="text-xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                                            ₹{earnedAmount.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </button>

                            {/* Expanded Breakdown */}
                            {isEarnedExpanded && earnedBreakdown.length > 0 && (
                                <div className="mt-3 space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3">
                                    {earnedBreakdown.map((item) => (
                                        <div
                                            key={item.customerId}
                                            className="flex items-center justify-between py-2 px-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20"
                                        >
                                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 truncate flex-1 mr-3">
                                                {item.customerName}
                                            </p>
                                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                                ₹{item.total.toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {isEarnedExpanded && earnedBreakdown.length === 0 && !earnedLoading && (
                                <div className="mt-3 py-4 text-center border-t border-zinc-200 dark:border-zinc-700">
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500">No collections in this period</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 bg-muted/50 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                ) : groupedCustomers.length === 0 ? (
                    <div className="text-center py-16 px-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="bg-emerald-100 dark:bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto border border-emerald-200 dark:border-emerald-500/30">
                            <IndianRupee size={26} className="text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                        </div>
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 text-base">No pending payments</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs mx-auto">All payments are up to date</p>
                    </div>
                ) : filteredGroupedCustomers.length === 0 ? (
                    <div className="text-center py-12 px-6">
                        <p className="text-zinc-500 font-medium">No results found for "{searchQuery}"</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredGroupedCustomers.map(customer => {
                            const dueStatus = getDueStatus(customer.earliestDueDate);

                            return (
                                <div
                                    key={customer.customerId}
                                    onClick={() => navigate(`/payment-reminders/${customer.customerId}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            navigate(`/payment-reminders/${customer.customerId}`);
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg transition-all cursor-pointer active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    aria-label={`View payment details for ${customer.customerName}`}
                                >
                                    {/* Customer Info */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-base text-zinc-900 dark:text-white truncate mb-2">
                                                {customer.customerName}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border", dueStatus.classes)}>
                                                    <Calendar size={10} strokeWidth={2.5} /> {dueStatus.text}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditDateCustomer({ id: customer.customerId, name: customer.customerName });
                                                        setEditDateValue(customer.earliestDueDate);
                                                        setIsEditDateOpen(true);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setEditDateCustomer({ id: customer.customerId, name: customer.customerName });
                                                            setEditDateValue(customer.earliestDueDate);
                                                        }
                                                    }}
                                                    className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                                                    aria-label="Edit due date"
                                                >
                                                    <Edit2 size={14} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                                                ₹{customer.totalBalance.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                {new Date(customer.earliestDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setQuickActionCustomer({ id: customer.customerId, name: customer.customerName, reminder: customer.primaryReminder, totalBalance: customer.totalBalance });
                                                setActionType('add');
                                                setIsQuickActionOpen(true);
                                            }}
                                            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-1"
                                        >
                                            <Plus size={14} strokeWidth={2.5} />
                                            Add Due
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setQuickActionCustomer({ id: customer.customerId, name: customer.customerName, reminder: customer.primaryReminder, totalBalance: customer.totalBalance });
                                                setActionType('receive');
                                                setIsQuickActionOpen(true);
                                            }}
                                            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
                                        >
                                            <Receipt size={14} strokeWidth={2.5} />
                                            Received
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
                isOpen={isQuickActionOpen && !!quickActionCustomer}
                onClose={closeQuickAction}
                title={<h2 className="text-lg font-bold">{actionType === 'add' ? 'Add New Due' : 'Receive Payment'}</h2>}
            >
                <div className="space-y-4">
                    <p className="font-bold text-lg text-zinc-900 dark:text-white truncate">
                        {quickActionCustomer?.name}
                    </p>
                    {actionType === 'receive' && quickActionCustomer && (
                        <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Balance</p>
                            <p className="text-2xl font-black text-zinc-900 dark:text-white">₹{quickActionCustomer.totalBalance.toLocaleString()}</p>
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
                            {actionType === 'add' ? 'Add Due' : 'Receive'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* New Reminder Modal */}
            <Modal
                isOpen={showNewReminder}
                onClose={() => {
                    setShowNewReminder(false);
                    setNewReminderCustomer("");
                    setNewReminderCustomerSearch("");
                    setNewReminderAmount("");
                    setNewReminderDueDate("");
                    setShowCustomerList(false);
                }}
                title={<h2 className="text-lg font-bold">Add New Reminder</h2>}
            >
                <div className="space-y-4">
                    {/* Customer Selection */}
                    <div className="relative">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Customer *</label>
                        <div className="relative mt-1">
                            <input
                                type="text"
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all"
                                placeholder="Search customer..."
                                value={newReminderCustomerSearch}
                                onChange={e => {
                                    setNewReminderCustomerSearch(e.target.value);
                                    setShowCustomerList(true);
                                }}
                                onFocus={() => setShowCustomerList(true)}
                                autoFocus
                            />
                        </div>
                        {showCustomerList && newReminderCustomerSearch && (
                            <div ref={listRef} className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg">
                                {filteredCustomersForNewReminder.length > 0 ? (
                                    filteredCustomersForNewReminder.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                setNewReminderCustomer(c.id);
                                                setNewReminderCustomerSearch(c.name);
                                                setShowCustomerList(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                                newReminderCustomer === c.id ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : ""
                                            )}
                                        >
                                            {c.name}
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-3 text-sm text-zinc-500 text-center">No customers found</div>
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
                                value={newReminderAmount}
                                onChange={e => setNewReminderAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Due Date (Required) */}
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Due Date *</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-14 md:h-12 text-sm font-bold outline-none transition-all mt-1"
                            value={newReminderDueDate}
                            onChange={e => setNewReminderDueDate(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => {
                            setShowNewReminder(false);
                            setNewReminderCustomer("");
                            setNewReminderCustomerSearch("");
                            setNewReminderAmount("");
                            setNewReminderDueDate("");
                            setShowCustomerList(false);
                        }} className="h-12">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleNewReminder}
                            className="h-12 bg-emerald-500 hover:bg-emerald-600"
                        >
                            Create Reminder
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Due Date Modal */}
            <Modal
                isOpen={isEditDateOpen}
                onClose={() => setIsEditDateOpen(false)}
                title={<h2 className="text-lg font-bold">Edit Due Date</h2>}
            >
                <div className="space-y-4">
                    <p className="font-bold text-lg text-zinc-900 dark:text-white truncate">
                        {editDateCustomer?.name}
                    </p>
                    <p className="text-sm text-zinc-500">
                        This will update the due date for all pending payment reminders for this customer.
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
                        <Button variant="outline" onClick={() => setEditDateCustomer(null)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateDueDate} className="h-12 bg-emerald-500 hover:bg-emerald-600">
                            Update Date
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmationModal
                isOpen={!!pendingNewCustomerName}
                onClose={() => setPendingNewCustomerName(null)}
                onConfirm={handleConfirmAddCustomer}
                title="Add New Customer?"
                description={`"${pendingNewCustomerName}" is not in your list. Do you want to add them now?`}
                confirmText="Add & Create"
                variant="default"
            />

            {/* Custom Date Modal */}
            <Modal
                isOpen={showCustomDateModal}
                onClose={() => setShowCustomDateModal(false)}
                title={<span className="text-lg font-bold">Select Date Range</span>}
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From</label>
                            <input
                                id="payment-start-date"
                                type="date"
                                value={customDateRange.start}
                                onChange={(e) => {
                                    const newStart = e.target.value;
                                    setCustomDateRange(prev => {
                                        const end = prev.end < newStart ? newStart : prev.end;
                                        return { start: newStart, end };
                                    });
                                }}
                                className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To</label>
                            <input
                                id="payment-end-date"
                                type="date"
                                value={customDateRange.end}
                                min={customDateRange.start}
                                onChange={(e) => {
                                    setCustomDateRange(prev => ({ ...prev, end: e.target.value }));
                                }}
                                className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setDateFilter('custom');
                            setShowCustomDateModal(false);
                        }}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all"
                    >
                        Apply Filter
                    </button>
                </div>
            </Modal>
        </>
    );
}
