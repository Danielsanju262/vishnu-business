import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { ArrowLeft, Trash2, Calendar, ShoppingBag, Wallet, Edit2, ChevronDown, TrendingUp, TrendingDown, ArrowUpDown, X, ChevronRight, User, CheckCircle2, Circle, MoreVertical, Download } from "lucide-react";
import Papa from "papaparse";
import { Link, useLocation } from "react-router-dom";
import { format, subDays, startOfMonth, startOfWeek, endOfWeek, endOfMonth, addDays } from "date-fns";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";
import { Modal } from "../components/ui/Modal";
import { useRealtimeTables } from "../hooks/useRealtimeSync";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";


type DateRangeType = "today" | "yesterday" | "week" | "month" | "custom";

export default function Reports() {

    const { toast, confirm } = useToast();
    const location = useLocation();

    // Filters
    const [rangeType, setRangeType] = useState<DateRangeType>(() => {
        // Check if we have a default filter passed in state
        const state = location.state as { defaultFilter?: DateRangeType };
        return state?.defaultFilter || "today";
    });
    const [showFilters, setShowFilters] = useState(false);
    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const filterPanelRef = useRef<HTMLDivElement>(null);
    useDropdownClose(showFilters, () => setShowFilters(false), filterButtonRef, [filterPanelRef] as any);
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // View State
    const [activeTab, setActiveTab] = useState<'profit' | 'customers' | 'activity'>('profit');

    // Data State
    const [data, setData] = useState<{ transactions: any[], expenses: any[], collections: any[], paymentReminders: any[] }>({ transactions: [], expenses: [], collections: [], paymentReminders: [] });
    const [combinedExpenses, setCombinedExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Detail Modal State - synced with browser history
    const [selectedDetail, setSelectedDetail] = useState<'sales' | 'goods' | 'expenses' | 'credit' | 'collections' | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

    // Customer Report State
    const [customerSearch, setCustomerSearch] = useState("");
    const [customerSort, setCustomerSort] = useState<'high' | 'low'>('high');

    // Transaction Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editQty, setEditQty] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editBuyPrice, setEditBuyPrice] = useState("");
    const [editDate, setEditDate] = useState("");

    // Expense Edit State
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [editExpenseTitle, setEditExpenseTitle] = useState("");
    const [editExpenseAmount, setEditExpenseAmount] = useState("");

    // Bulk Select State - synced with browser history
    const [isSelectionMode, setIsSelectionMode] = useHistorySyncedState(false, 'reportsSelection');
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
    const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // Export State - synced with browser history
    const [showExportModal, setShowExportModal] = useHistorySyncedState(false, 'reportsExportModal');

    const [isExporting, setIsExporting] = useState(false);



    // Handle back navigation for modals
    useEffect(() => {
        const handlePopState = () => {
            if (selectedDetail) setSelectedDetail(null);
            if (activeMenuId) setActiveMenuId(null);
            if (showFilters) setShowFilters(false);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedDetail, activeMenuId, showFilters]);

    // Long Press Refs
    const timerRef = useRef<any>(null);

    const handleTransactionTouchStart = (e: React.TouchEvent | React.MouseEvent, id: string, currentSelected: boolean) => {
        // Don't start long-press if clicking on a button or menu
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="menu"]')) {
            return;
        }

        timerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            if (!isSelectionMode) setIsSelectionMode(true);
            if (!currentSelected) toggleTransactionSelection(id);
        }, 500);
    };

    const handleExpenseTouchStart = (e: React.TouchEvent | React.MouseEvent, id: string, currentSelected: boolean) => {
        // Don't start long-press if clicking on a button or menu
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="menu"]')) {
            return;
        }

        timerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            if (!isSelectionMode) {
                setIsSelectionMode(true);
                // We might need to handle switching from transaction selection to expense selection or allow mixed?
                // The current logic seems to split them but isSelectionMode is global.
                // Assuming mixed selection or mode switching is handled by toggles.
            }
            if (!currentSelected) toggleExpenseSelection(id);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const handleTouchMove = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };


    // Close menu on ESC or click outside
    useDropdownClose(!!activeMenuId, () => setActiveMenuId(null));

    const getDateFilter = () => {
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');

        if (rangeType === 'today') return { start: todayStr, end: todayStr };
        if (rangeType === 'yesterday') {
            const yest = format(subDays(today, 1), 'yyyy-MM-dd');
            return { start: yest, end: yest };
        }
        if (rangeType === 'week') return { start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
        if (rangeType === 'month') return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
        return { start: startDate, end: endDate };
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { start, end } = getDateFilter();

        try {
            const { data: transactions, error: tError } = await supabase
                .from('transactions')
                .select('*, customers(name), products(name, unit)')
                .is('deleted_at', null)
                .gte('date', start)
                .lte('date', end)
                .order('created_at', { ascending: false });

            if (tError) throw tError;

            const { data: expenses, error: eError } = await supabase
                .from('expenses')
                .select('*')
                .is('deleted_at', null)
                .gte('date', start)
                .lte('date', end)
                .order('created_at', { ascending: false });

            if (eError) throw eError;

            const { data: collections, error: cError } = await supabase
                .from('credit_collections')
                .select('*, customers(name)')
                .gte('collected_at', `${start}T00:00:00`)
                .lte('collected_at', `${end}T23:59:59`)
                .order('collected_at', { ascending: false });

            if (cError) throw cError;

            // Fetch reminders with a buffer to support heuristic check (sale date + 3 days)
            const remindersEnd = addDays(new Date(end), 4);
            const remindersEndStr = format(remindersEnd, 'yyyy-MM-dd');

            const { data: reminders, error: rError } = await supabase
                .from('payment_reminders')
                .select('customer_id, recorded_at')
                .gte('recorded_at', `${start}T00:00:00`)
                .lte('recorded_at', `${remindersEndStr}T23:59:59`);

            if (rError) throw rError;

            if (transactions && expenses && collections && reminders) {
                setData({ transactions, expenses, collections, paymentReminders: reminders });

                // Combine for "Expenses View"
                // 1. Manual Expenses (Other Expense)
                const manual = expenses.map(e => ({
                    id: e.id,
                    type: 'manual',
                    title: e.title,
                    amount: e.amount,
                    date: e.date,
                    isGhee: e.is_ghee_ingredient,
                    raw: e
                }));

                // 2. COGS from Transactions (Goods Cost)
                const cogs = transactions.filter(t => t.buy_price > 0).map(t => ({
                    id: `cogs-${t.id}`,
                    type: 'cogs',
                    title: `Goods Cost - ${t.products?.name}`,
                    amount: t.buy_price * t.quantity,
                    date: t.date,
                    isGhee: false,
                    raw: t
                }));

                const all = [...manual, ...cogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setCombinedExpenses(all);
            }
        } catch (error) {
            console.error("Error fetching reports:", error);
            toast("Failed to load data. Please refresh.", "error");
        } finally {
            setLoading(false);
        }
    }, [rangeType, startDate, endDate, toast]);

    // Real-time sync for transactions and expenses - auto-refreshes when data changes on any device
    useRealtimeTables(['transactions', 'expenses', 'credit_collections', 'payment_reminders'], fetchData, [rangeType, startDate, endDate]);

    const deleteTransaction = async (id: string, customerName?: string, productName?: string) => {
        // 1. Fetch fresh transaction details from DB
        let itemToDelete: any;
        const { data: dbItem, error: fetchError } = await supabase
            .from('transactions')
            .select('*, customers(name), products(name)')
            .eq('id', id)
            .maybeSingle();

        if (fetchError || !dbItem) {
            console.warn("Fetch failed, falling back to local state", fetchError);
            // Fallback to local state so delete is not blocked
            itemToDelete = data.transactions.find((t: any) => t.id === id);

            if (!itemToDelete) {
                toast("Transaction not found. Please refresh.", "error");
                return;
            }
        } else {
            itemToDelete = dbItem;
        }

        const name = itemToDelete.products?.name || productName || "Transaction";
        const customer = itemToDelete.customers?.name || customerName || "Customer";
        const customerId = itemToDelete.customer_id;

        // Use new tracking fields
        const creditAmount = itemToDelete.credit_amount ?? 0;
        const linkedSupplierId = itemToDelete.linked_supplier_id;
        const linkedSupplierAmount = itemToDelete.linked_supplier_amount ?? 0;

        // Build confirmation message based on what will happen
        let confirmMsg = `Delete sale of "${name}" to ${customer}?`;
        if (creditAmount > 0) confirmMsg += `\n\nCredit amount (₹${creditAmount}) will be removed from customer balance.`;
        if (linkedSupplierId && linkedSupplierAmount > 0) confirmMsg += `\n\nLinked supplier payment (₹${linkedSupplierAmount}) will be removed from accounts payable.`;

        // Single confirmation - auto-updates linked records
        if (!await confirm(confirmMsg)) return;

        // Soft delete the transaction
        const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id);

        if (error) {
            toast("Failed to delete", "error");
            return;
        }

        let updatedReminder = false;
        let updatedPayable = false;

        // AUTO-UPDATE: Payment Reminder (Only if credit was tracked)
        if (customerId && creditAmount > 0) {
            const { data: pendingReminder } = await supabase
                .from('payment_reminders')
                .select('*')
                .eq('customer_id', customerId)
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (pendingReminder && pendingReminder.amount > 0) {
                const newAmount = Math.max(0, pendingReminder.amount - creditAmount);

                // Instead of setting to ₹0, REMOVE the last Credit Sale line entirely and recalculate balances
                let noteLines = (pendingReminder.note || '').split('\n');

                // Find the last Credit Sale line and remove it
                let lastCreditSaleIndex = -1;
                for (let i = noteLines.length - 1; i >= 0; i--) {
                    if (noteLines[i].includes('Credit Sale:')) {
                        lastCreditSaleIndex = i;
                        break;
                    }
                }

                if (lastCreditSaleIndex !== -1) {
                    // Remove the line
                    noteLines.splice(lastCreditSaleIndex, 1);

                    // Recalculate running balances for remaining lines
                    let runningBalance = 0;
                    noteLines = noteLines.map((line: string) => {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('[')) return line;

                        const isCreditSale = line.includes('Credit Sale:');
                        const isDueAdded = line.includes('New Due Added:');
                        const isPayment = line.includes('Received:');

                        if (!isCreditSale && !isDueAdded && !isPayment) return line;

                        let amount = 0;
                        let amountMatch;
                        if (isCreditSale) amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                        else if (isDueAdded) amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/Received: ₹([\d,]+)/);

                        if (amountMatch) {
                            amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                        }

                        if (isCreditSale || isDueAdded) {
                            runningBalance += amount;
                        } else {
                            runningBalance -= amount;
                        }

                        // Reconstruct line with updated balance
                        const dateMatch = line.match(/\[(.*?)\]/);
                        if (dateMatch) {
                            let typeStr = isCreditSale ? 'Credit Sale' : (isDueAdded ? 'New Due Added' : 'Received');
                            return `[${dateMatch[1]}] ${typeStr}: ₹${amount.toLocaleString()}. Balance: ₹${Math.max(0, runningBalance).toLocaleString()}`;
                        }
                        return line;
                    });
                }

                const newNote = noteLines.join('\n').trim();

                if (newAmount <= 0) {
                    await supabase
                        .from('payment_reminders')
                        .update({ amount: 0, status: 'paid', note: newNote })
                        .eq('id', pendingReminder.id);
                } else {
                    await supabase
                        .from('payment_reminders')
                        .update({ amount: newAmount, note: newNote })
                        .eq('id', pendingReminder.id);
                }
                updatedReminder = true;
            }
        }

        // AUTO-UPDATE: Accounts Payable (Only if linked payment tracked)
        if (linkedSupplierId && linkedSupplierAmount > 0) {
            const { data: pendingPayables } = await supabase
                .from('accounts_payable')
                .select('*, suppliers(name)')
                .eq('supplier_id', linkedSupplierId) // Strictly match supplier
                .eq('status', 'pending')
                .order('due_date', { ascending: true });

            if (pendingPayables && pendingPayables.length > 0) {
                // Find matching payable or use first one
                const targetPayable = pendingPayables[0];

                const newAmount = Math.max(0, targetPayable.amount - linkedSupplierAmount);

                // Update the note: find the last "Balance: ₹X" and update it to new balance
                let newNote = targetPayable.note || '';
                const balancePattern = /Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Balance: ₹)/;
                if (balancePattern.test(newNote)) {
                    newNote = newNote.replace(balancePattern, `Balance: ₹${newAmount.toLocaleString()}`);
                }

                if (newAmount <= 0) {
                    await supabase
                        .from('accounts_payable')
                        .update({ amount: 0, status: 'paid', note: newNote.trim() })
                        .eq('id', targetPayable.id);
                } else {
                    await supabase
                        .from('accounts_payable')
                        .update({ amount: newAmount, note: newNote.trim() })
                        .eq('id', targetPayable.id);
                }
                updatedPayable = true;
            }
        }

        // Show single success message
        let message = 'Sale deleted';
        if (updatedReminder && updatedPayable) {
            message += ' & adjusted balances';
        } else if (updatedReminder) {
            message += ' & adjusted customer balance';
        } else if (updatedPayable) {
            message += ' & adjusted supplier payable';
        }
        toast(message, 'success');

        fetchData();
    };

    const deleteExpense = async (id: string) => {
        const itemToDelete = combinedExpenses.find((e: any) => e.id === id);
        if (!itemToDelete || itemToDelete.type !== 'manual') return;

        if (!await confirm(`Delete "${itemToDelete.title}"?`)) return;

        const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);

        if (!error) {
            toast("Expense deleted", "success");
            fetchData();
        } else {
            toast("Failed to delete", "error");
        }
    };

    const startEdit = (t: any) => {
        setEditingId(t.id);
        setEditQty(t.quantity.toString());
        setEditPrice(t.sell_price.toString());
        setEditBuyPrice(t.buy_price.toString());
        setEditDate(t.date ? new Date(t.date).toISOString().split('T')[0] : "");
    };

    const saveEdit = async () => {
        if (!editingId) return;

        // 1. Calculate difference
        const originalTx = data.transactions.find((t: any) => t.id === editingId);
        if (!originalTx) return;

        const oldQty = originalTx.quantity;
        const oldPrice = originalTx.sell_price;
        const oldTotal = oldQty * oldPrice;

        // Use tracking field for accurate credit calculation (fallback to 0 if column doesn't exist)
        const oldCredit = originalTx.credit_amount ?? 0;

        // Calculate how much was "Paid" originally (Paid = Total - Credit)
        const originalPaid = Math.max(0, oldTotal - oldCredit);

        const newQty = parseFloat(editQty);
        const newPrice = parseFloat(editPrice);
        const newTotal = newQty * newPrice;

        const newCredit = Math.max(0, newTotal - originalPaid);
        const creditDiff = newCredit - oldCredit;

        // Try update with credit_amount, fallback to basic update if column doesn't exist
        let updateError = null;
        const { error } = await supabase.from('transactions').update({
            quantity: newQty,
            sell_price: newPrice,
            buy_price: parseFloat(editBuyPrice) || 0,
            date: editDate,
            credit_amount: newCredit
        }).eq('id', editingId);

        if (error) {
            // If error is about missing column, try without credit_amount
            if (error.message?.includes('column') || error.code === '42703') {
                console.warn("credit_amount column not found, updating without it:", error.message);
                const { error: fallbackError } = await supabase.from('transactions').update({
                    quantity: newQty,
                    sell_price: newPrice,
                    buy_price: parseFloat(editBuyPrice) || 0,
                    date: editDate
                }).eq('id', editingId);
                updateError = fallbackError;
            } else {
                updateError = error;
            }
        }

        if (updateError) {
            console.error("Failed to update transaction:", updateError);
            toast("Failed to save changes", "error");
            return;
        }

        toast("Updated successfully", "success");
        setEditingId(null);

        // 2. Update Payment Reminder if credit amount changed
        if (Math.abs(creditDiff) > 0.01 && originalTx.customer_id) {
            const { data: pendingReminder } = await supabase
                .from('payment_reminders')
                .select('*')
                .eq('customer_id', originalTx.customer_id)
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (pendingReminder) {
                const newReminderAmount = Math.max(0, pendingReminder.amount + creditDiff);

                // Update the note: find the LAST "Credit Sale: ₹X. Balance: ₹Y" and update BOTH values
                // This keeps the original log entry format but updates both the credit amount and balance
                let newNote = pendingReminder.note || "";

                // Pattern to find the last "Credit Sale: ₹X. Balance: ₹Y" entry
                // Uses negative lookahead to ensure we get the LAST occurrence
                const creditSalePattern = /Credit Sale: ₹[\d,]+(?:\.\d+)?\.?\s*Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Credit Sale:)/;

                if (creditSalePattern.test(newNote)) {
                    // Update both the credit amount and the balance
                    newNote = newNote.replace(creditSalePattern,
                        `Credit Sale: ₹${newCredit.toLocaleString()}. Balance: ₹${newReminderAmount.toLocaleString()}`);
                } else {
                    // Fallback: try to just update the balance if pattern doesn't match
                    const balancePattern = /Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Balance: ₹)/;
                    if (balancePattern.test(newNote)) {
                        newNote = newNote.replace(balancePattern, `Balance: ₹${newReminderAmount.toLocaleString()}`);
                    }
                }

                const status = newReminderAmount <= 0 ? 'paid' : 'pending';
                const { error: reminderError } = await supabase.from('payment_reminders').update({
                    amount: newReminderAmount,
                    status: status,
                    note: newNote
                }).eq('id', pendingReminder.id);

                if (!reminderError) {
                    toast("Customer balance updated", "success");
                } else {
                    console.error("Failed to update reminder:", reminderError);
                }
            }
        }

        // 3. Update Linked Supplier Payable if applicable
        const oldPayable = originalTx.linked_supplier_amount ?? 0;
        const linkedSupplierId = originalTx.linked_supplier_id;

        if (linkedSupplierId && oldPayable > 0) {
            // Heuristic: Calculate ratio of payable vs original cost to maintain partial links
            const oldCost = oldQty * originalTx.buy_price;
            const payableRatio = oldCost > 0 ? (oldPayable / oldCost) : 0;

            const newBuyPriceVal = parseFloat(editBuyPrice) || 0;
            const newCost = newQty * newBuyPriceVal;
            const newPayable = newCost * payableRatio;

            const payableDiff = newPayable - oldPayable;

            if (Math.abs(payableDiff) > 0.01) {
                // Update Transaction with new linked amount
                await supabase.from('transactions')
                    .update({ linked_supplier_amount: newPayable })
                    .eq('id', editingId);

                // Update Payable Record
                const { data: pendingPayable } = await supabase
                    .from('accounts_payable')
                    .select('*')
                    .eq('supplier_id', linkedSupplierId)
                    .eq('status', 'pending')
                    .order('due_date', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (pendingPayable) {
                    const newPayableAmount = Math.max(0, pendingPayable.amount + payableDiff);

                    let newNote = pendingPayable.note || "";
                    const balancePattern = /Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Balance: ₹)/;
                    if (balancePattern.test(newNote)) {
                        newNote = newNote.replace(balancePattern, `Balance: ₹${newPayableAmount.toLocaleString()}`);
                    }

                    await supabase.from('accounts_payable').update({
                        amount: newPayableAmount,
                        status: newPayableAmount <= 0 ? 'paid' : 'pending',
                        note: newNote
                    }).eq('id', pendingPayable.id);

                    toast("Supplier payable updated", "success");
                }
            }
        }

        fetchData();
    };

    const startEditExpense = (e: any) => {
        setEditingExpenseId(e.id);
        setEditExpenseTitle(e.title);
        setEditExpenseAmount(e.amount.toString());
    };

    const saveEditExpense = async () => {
        if (!editingExpenseId) return;
        const { error } = await supabase.from('expenses').update({
            title: editExpenseTitle,
            amount: parseFloat(editExpenseAmount)
        }).eq('id', editingExpenseId);

        if (!error) {
            toast("Expense updated", "success");
            setEditingExpenseId(null);
            fetchData();
        }
    };

    // --- Bulk Actions ---
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedTransactionIds(new Set());
        setSelectedExpenseIds(new Set());
    };

    const toggleTransactionSelection = (id: string) => {
        const newSet = new Set(selectedTransactionIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedTransactionIds(newSet);
        if (newSet.size === 0 && selectedExpenseIds.size === 0) setIsSelectionMode(false);
    };

    const toggleExpenseSelection = (id: string) => {
        const newSet = new Set(selectedExpenseIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedExpenseIds(newSet);
        if (newSet.size === 0 && selectedTransactionIds.size === 0) setIsSelectionMode(false);
    };

    const toggleSelectAll = () => {
        const allTransactionIds = data.transactions.map((t: any) => t.id);
        const allManualExpenseIds = combinedExpenses.filter((e: any) => e.type === 'manual').map((e: any) => e.id);

        const totalItemsCount = allTransactionIds.length + allManualExpenseIds.length;
        const currentSelectedCount = selectedTransactionIds.size + selectedExpenseIds.size;

        if (currentSelectedCount === totalItemsCount) {
            // Deselect all
            setSelectedTransactionIds(new Set());
            setSelectedExpenseIds(new Set());
        } else {
            // Select all
            setSelectedTransactionIds(new Set(allTransactionIds));
            setSelectedExpenseIds(new Set(allManualExpenseIds));
        }
    };

    const deleteSelectedItems = async () => {
        const totalCount = selectedTransactionIds.size + selectedExpenseIds.size;
        if (totalCount === 0) return;

        if (!await confirm(`Delete ${totalCount} selected items? This cannot be undone.`)) return;

        let success = true;

        // Group amounts by Customer (Credit) and Supplier (Linked Payable)
        const customerCredits_map: Record<string, { name: string, amount: number }> = {};
        const supplierPayables_map: Record<string, { supplierId: string, amount: number }> = {};

        if (selectedTransactionIds.size > 0) {
            const transactionsToDelete = data.transactions.filter((t: any) => selectedTransactionIds.has(t.id));

            transactionsToDelete.forEach((t: any) => {
                // 1. Aggregate Credit Amounts
                const credit = t.credit_amount ?? 0;
                if (t.customer_id && credit > 0) {
                    if (!customerCredits_map[t.customer_id]) {
                        customerCredits_map[t.customer_id] = {
                            name: t.customers?.name || 'Unknown',
                            amount: 0
                        };
                    }
                    customerCredits_map[t.customer_id].amount += credit;
                }

                // 2. Aggregate Linked Supplier Payables
                const linkedId = t.linked_supplier_id;
                const linkedAmount = t.linked_supplier_amount ?? 0;
                if (linkedId && linkedAmount > 0) {
                    if (!supplierPayables_map[linkedId]) {
                        supplierPayables_map[linkedId] = {
                            supplierId: linkedId,
                            amount: 0
                        };
                    }
                    supplierPayables_map[linkedId].amount += linkedAmount;
                }
            });

            const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedTransactionIds));
            if (error) success = false;
        }

        if (selectedExpenseIds.size > 0) {
            const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedExpenseIds));
            if (error) success = false;
        }

        if (success) {
            toast(`Deleted ${totalCount} items`, "success");

            // Update Customer Credits
            for (const custId of Object.keys(customerCredits_map)) {
                const { amount: creditToRemove } = customerCredits_map[custId];
                if (creditToRemove <= 0) continue;

                const { data: pendingReminder } = await supabase
                    .from('payment_reminders')
                    .select('*')
                    .eq('customer_id', custId)
                    .eq('status', 'pending')
                    .limit(1)
                    .maybeSingle();

                if (pendingReminder) {
                    const newAmount = Math.max(0, pendingReminder.amount - creditToRemove);

                    // Update the note: find the last "Balance: ₹X" and update it
                    let newNote = pendingReminder.note || "";
                    const balancePattern = /Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Balance: ₹)/;
                    if (balancePattern.test(newNote)) {
                        newNote = newNote.replace(balancePattern, `Balance: ₹${newAmount.toLocaleString()}`);
                    }

                    await supabase.from('payment_reminders').update({
                        amount: newAmount,
                        status: newAmount <= 0 ? 'paid' : 'pending',
                        note: newNote
                    }).eq('id', pendingReminder.id);
                }
            }
            if (Object.keys(customerCredits_map).length > 0) toast("Updated customer balances", "success");


            // Update Supplier Payables
            for (const suppId of Object.keys(supplierPayables_map)) {
                const { amount: payableToRemove } = supplierPayables_map[suppId];
                if (payableToRemove <= 0) continue;

                const { data: pendingPayable } = await supabase
                    .from('accounts_payable')
                    .select('*')
                    .eq('supplier_id', suppId)
                    .eq('status', 'pending')
                    .limit(1)
                    .maybeSingle();

                if (pendingPayable) {
                    const newAmount = Math.max(0, pendingPayable.amount - payableToRemove);

                    // Update the note: find the last "Balance: ₹X" and update it
                    let newNote = pendingPayable.note || "";
                    const balancePattern = /Balance: ₹[\d,]+(?:\.\d+)?(?![\s\S]*Balance: ₹)/;
                    if (balancePattern.test(newNote)) {
                        newNote = newNote.replace(balancePattern, `Balance: ₹${newAmount.toLocaleString()}`);
                    }

                    await supabase.from('accounts_payable').update({
                        amount: newAmount,
                        status: newAmount <= 0 ? 'paid' : 'pending',
                        note: newNote
                    }).eq('id', pendingPayable.id);
                }
            }
            if (Object.keys(supplierPayables_map).length > 0) toast("Updated supplier payables", "success");

            toggleSelectionMode();
            fetchData();
        } else {
            toast("Failed to delete some items", "error");
        }
    };

    // --- Export Logic ---
    const handleExport = async (type: 'sales' | 'customers' | 'products') => {
        setIsExporting(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            let dataToExport: any[] = [];
            let fileName = "";

            if (type === 'sales') {
                fileName = `vishnu_sales_export_${todayStr}.csv`;
                // Re-fetch to ensure we have dataset matching current filters or all? 
                // Requirement says "Sales Activity", implying current view logic or complete. 
                // "Unified Export Experience" -> "Export UI follows the same interaction pattern (date range if applicable)"
                // We'll use the *current filtered data* for sales as that makes the most sense.

                const exportData = data.transactions.map((t: any) => ({
                    "Date": new Date(t.date).toLocaleDateString(),
                    "Customer Name": t.customers?.name || 'Unknown',
                    "Product Name": t.products?.name || 'Unknown',
                    "Quantity": t.quantity,
                    "Unit": t.products?.unit || '',
                    "Sell Price": t.sell_price,
                    "Buy Price": t.buy_price,
                    "Total Amount": t.quantity * t.sell_price,
                    "Profit": (t.quantity * t.sell_price) - (t.quantity * t.buy_price),
                    "Is Deleted": t.deleted_at ? "true" : "false"
                }));
                dataToExport = exportData;
            }
            else if (type === 'customers') {
                fileName = `vishnu_customers_export_${todayStr}.csv`;
                const { data: customers } = await supabase
                    .from('customers')
                    .select('*')
                    .order('name');

                if (customers) {
                    dataToExport = customers.map(c => ({
                        'Customer Name': c.name,
                        'Phone': c.phone || '',
                        'Created Date': new Date(c.created_at).toLocaleDateString(),
                        'Status': c.deleted_at ? 'Deleted' : 'Active'
                    }));
                }
            }
            else if (type === 'products') {
                fileName = `vishnu_products_export_${todayStr}.csv`;
                const { data: products } = await supabase
                    .from('products')
                    .select('*')
                    .order('name');

                if (products) {
                    dataToExport = products.map(p => ({
                        'Product Name': p.name,
                        'Unit': p.unit,
                        'Category': p.category || 'General',
                        'Created Date': new Date(p.created_at).toLocaleDateString(),
                        'Status': p.deleted_at ? 'Deleted' : 'Active'
                    }));
                }
            }

            if (dataToExport.length > 0) {
                const csv = Papa.unparse(dataToExport);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                if (link.download !== undefined) {
                    const url = URL.createObjectURL(blob);
                    link.setAttribute('href', url);
                    link.setAttribute('download', fileName);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast("Export successful", "success");
                }
            } else {
                toast("No data found for the selected period. Try adjusting your date range.", "warning");
            }

        } catch (error) {
            console.error(error);
            toast("Export failed", "error");
        } finally {
            setIsExporting(false);
            setShowExportModal(false);
        }
    };

    // --- Calculations ---

    // 1. Financials
    const totalSales = data.transactions.reduce((acc, t) => acc + (t.quantity * t.sell_price), 0);
    const transactionCOGS = data.transactions.reduce((acc, t) => acc + (t.quantity * t.buy_price), 0);

    // Separate Expenses
    const ingredientExpenses = data.expenses.filter(e => e.is_ghee_ingredient).reduce((acc, e) => acc + e.amount, 0);
    const totalOtherExpenses = data.expenses.filter(e => !e.is_ghee_ingredient).reduce((acc, e) => acc + e.amount, 0);

    const totalGoodsCost = transactionCOGS + ingredientExpenses;

    const grossProfit = totalSales - totalGoodsCost;
    const netProfit = grossProfit - totalOtherExpenses;

    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    // ============================================================
    // CASH IN HAND CALCULATION
    // ============================================================
    // Formula per transaction:
    // - Full Cash Sale:    Net Profit (profit - 0)
    // - Full Credit Sale:  Net Profit - Credit Amount (= -cost)
    // - Partial Credit:    (Net Profit - Credit Amount) + Partial Paid
    // Then add debt collections at the end
    // ============================================================
    // Then add debt collections at the end
    // ============================================================

    let totalCreditGiven = 0; // Keep for display in P&L breakdown
    let cihTransactionContribution = 0;

    data.transactions.forEach((t) => {
        const saleValue = t.quantity * t.sell_price;
        const buyValue = t.quantity * t.buy_price;

        // Migration Complete: Database now has accurate credit_amount for all history.
        const creditVal = t.credit_amount || 0;

        // Track displayed credit total regardless of logic
        totalCreditGiven += creditVal;

        let contribution = 0;

        // Unified Logic (Matches Dashboard)
        if (creditVal > 0) {
            contribution = 0;
        } else {
            contribution = saleValue - buyValue;
        }

        cihTransactionContribution += contribution;
    });

    const totalCollections = data.collections.reduce((acc, c) => acc + c.amount, 0);





    // 2. Customer Aggregation
    const customerStats = useMemo(() => {
        const stats: Record<string, { name: string, sales: number, count: number, transactions: any[] }> = {};

        data.transactions.forEach((t) => {
            const name = t.customers?.name || 'Unknown';
            if (!stats[name]) {
                stats[name] = { name, sales: 0, count: 0, transactions: [] };
            }
            stats[name].sales += (t.quantity * t.sell_price);
            stats[name].count += 1;
            stats[name].transactions.push(t);
        });

        return Object.values(stats);
    }, [data.transactions]);

    const filteredCustomers = useMemo(() => {
        return customerStats
            .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
            .sort((a, b) => customerSort === 'high' ? b.sales - a.sales : a.sales - b.sales);
    }, [customerStats, customerSearch, customerSort]);


    const ranges = [
        { key: 'today', label: 'Today' },
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'custom', label: 'Custom Range' },
    ];

    // Helpers for modal calculations
    const getCustomerFinancials = (customerName: string) => {
        const transactions = customerStats.find(c => c.name === customerName)?.transactions || [];
        const totalSold = transactions.reduce((acc: number, t: any) => acc + (t.quantity * t.sell_price), 0);
        const totalBought = transactions.reduce((acc: number, t: any) => acc + (t.quantity * t.buy_price), 0);
        const customerProfit = totalSold - totalBought;
        return { transactions, totalSold, totalBought, customerProfit };
    };

    return (
        <div className="min-h-screen bg-background pb-6 w-full md:max-w-2xl md:mx-auto px-3 md:px-4">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-border shadow-sm">
                <div className="w-full px-3 md:px-4 py-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1">
                                    <ArrowLeft size={20} />
                                </button>
                                <div>
                                    {/* Breadcrumb - Hidden on mobile */}
                                    <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                        <Link to="/" className="hover:text-primary transition">Home</Link>
                                        <span>/</span>
                                        <span className="text-primary font-semibold">Reports</span>
                                    </div>
                                    <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">Reports</h1>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {/* Filter Trigger */}
                                <button
                                    ref={filterButtonRef}
                                    onClick={() => setShowFilters(!showFilters)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setShowFilters(!showFilters);
                                        }
                                    }}
                                    tabIndex={0}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2.5 md:px-4 md:py-2.5 rounded-full text-xs md:text-sm font-bold border interactive transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 whitespace-nowrap",
                                        showFilters ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                                    )}
                                    aria-label="Toggle date filter"
                                >
                                    <Calendar size={16} />
                                    <span className="text-xs md:text-sm">
                                        {rangeType === 'custom'
                                            ? `${new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                                            : ranges.find(r => r.key === rangeType)?.label
                                        }
                                    </span>
                                    <ChevronDown size={16} className={cn("transition-transform", showFilters && "rotate-180")} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Panel */}
                        {showFilters && (
                            <div ref={filterPanelRef} className="animate-in slide-in-from-top-2 space-y-3 p-1 relative z-50">
                                <div className="flex flex-wrap gap-2">
                                    {ranges.map(r => (
                                        <button
                                            key={r.key}
                                            onClick={() => { setRangeType(r.key as DateRangeType); if (r.key !== 'custom') setShowFilters(false); }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setRangeType(r.key as DateRangeType);
                                                    if (r.key !== 'custom') setShowFilters(false);
                                                }
                                            }}
                                            tabIndex={0}
                                            className={cn(
                                                "px-4 py-3 text-xs md:text-sm font-semibold rounded-full border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                                                rangeType === r.key
                                                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                                                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                                            )}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>

                                {rangeType === 'custom' && (
                                    <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3">
                                        <div className="flex flex-col md:flex-row gap-3">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block ml-1">Start Date</label>
                                                <input
                                                    id="rep-start-date"
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => {
                                                        const newStart = e.target.value;
                                                        setStartDate(newStart);
                                                        if (endDate < newStart) setEndDate(newStart);

                                                        // Auto-open next picker
                                                        setTimeout(() => {
                                                            const endDateInput = document.getElementById('rep-end-date') as HTMLInputElement;
                                                            if (endDateInput && 'showPicker' in endDateInput) {
                                                                try {
                                                                    (endDateInput as any).showPicker();
                                                                } catch (err) { }
                                                            }
                                                        }, 500);
                                                    }}
                                                    className="w-full px-3 py-3 md:py-2 bg-accent rounded-lg border border-border/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none h-12 md:h-auto"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block ml-1">End Date</label>
                                                <input
                                                    id="rep-end-date"
                                                    type="date"
                                                    value={endDate}
                                                    min={startDate}
                                                    onChange={(e) => {
                                                        setEndDate(e.target.value);
                                                        // Auto-close after selection
                                                        setShowFilters(false);
                                                    }}
                                                    className="w-full px-3 py-3 md:py-2 bg-accent rounded-lg border border-border/50 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary outline-none h-12 md:h-auto"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex p-1 bg-muted/50 rounded-xl">
                            <button
                                onClick={() => setActiveTab('profit')}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setActiveTab('profit');
                                    }
                                }}
                                tabIndex={0}
                                className={cn("flex-1 py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1", activeTab === 'profit' ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" : "text-muted-foreground hover:text-foreground")}
                            >
                                P&L Statement
                            </button>
                            <button
                                onClick={() => setActiveTab('customers')}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setActiveTab('customers');
                                    }
                                }}
                                tabIndex={0}
                                className={cn("flex-1 py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1", activeTab === 'customers' ? "bg-blue-500 text-white shadow-md shadow-blue-500/20" : "text-muted-foreground hover:text-foreground")}
                            >
                                Customers
                            </button>
                            <button
                                onClick={() => setActiveTab('activity')}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setActiveTab('activity');
                                    }
                                }}
                                tabIndex={0}
                                className={cn("flex-1 py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1", activeTab === 'activity' ? "bg-rose-500 text-white shadow-md shadow-rose-500/20" : "text-muted-foreground hover:text-foreground")}
                            >
                                Activity
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-40 md:h-44" /> {/* Spacer for larger fixed header */}

            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* --- PROFIT VIEW --- */}
                {activeTab === 'profit' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 md:p-5 rounded-3xl bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
                                <div className="relative z-10">
                                    <p className="text-emerald-100 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1">Total Revenue</p>
                                    <p className="text-xl md:text-2xl font-black">₹{totalSales.toLocaleString()}</p>
                                </div>
                                <TrendingUp className="absolute right-[-10px] bottom-[-10px] text-emerald-600 opacity-50" size={60} />
                            </div>
                            <div className="p-4 md:p-5 rounded-3xl bg-rose-500 text-white shadow-xl shadow-rose-500/20 relative overflow-hidden">
                                <div className="relative z-10">
                                    <p className="text-rose-100 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1">Total Costs</p>
                                    <p className="text-xl md:text-2xl font-black">₹{(totalGoodsCost + totalOtherExpenses).toLocaleString()}</p>
                                </div>
                                <TrendingDown className="absolute right-[-10px] bottom-[-10px] text-rose-600 opacity-50" size={60} />
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Wallet className="text-primary" size={20} />
                                Profit and Loss Statement
                            </h3>

                            <div className="space-y-3 pt-2">
                                {/* Gross Sales Row */}
                                <div
                                    onClick={() => setSelectedDetail('sales')}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedDetail('sales');
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    className="flex justify-between items-center p-2.5 md:p-3 -mx-2 md:-mx-3 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                    aria-label="View gross sales breakdown"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600">
                                            <TrendingUp size={16} />
                                        </div>
                                        <span className="text-muted-foreground font-medium text-sm group-hover:text-emerald-600 transition-colors">Gross Sales</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-foreground">₹{totalSales.toLocaleString()}</span>
                                        <ChevronRight size={14} className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>

                                {/* Goods Sold Row */}
                                <div
                                    onClick={() => setSelectedDetail('goods')}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedDetail('goods');
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    className="flex justify-between items-center p-2.5 md:p-3 -mx-2 md:-mx-3 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                    aria-label="View goods cost breakdown"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-orange-500/10 rounded-lg text-orange-600">
                                            <ShoppingBag size={16} />
                                        </div>
                                        <span className="text-muted-foreground font-medium text-sm group-hover:text-orange-600 transition-colors">Goods Sold</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-rose-500">- ₹{totalGoodsCost.toLocaleString()}</span>
                                        <ChevronRight size={14} className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>

                                <div className="h-px bg-border my-2 border-dashed"></div>

                                <div className="flex justify-between items-center px-2 py-1">
                                    <span className="text-foreground font-bold text-sm">Gross Profit</span>
                                    <span className="font-bold text-emerald-600 text-sm">₹{grossProfit.toLocaleString()}</span>
                                </div>

                                {/* Other Expenses Row */}
                                <div
                                    onClick={() => setSelectedDetail('expenses')}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedDetail('expenses');
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    className="flex justify-between items-center p-2.5 md:p-3 -mx-2 md:-mx-3 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                    aria-label="View other expenses breakdown"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-rose-500/10 rounded-lg text-rose-600">
                                            <Wallet size={16} />
                                        </div>
                                        <span className="text-muted-foreground font-medium text-sm group-hover:text-rose-600 transition-colors">Other Expense</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-rose-500">- ₹{totalOtherExpenses.toLocaleString()}</span>
                                        <ChevronRight size={14} className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>

                            </div>

                            <div className="bg-muted/50 p-2.5 md:p-3 rounded-xl mt-4 flex justify-between items-center border border-border/50">
                                <span className="text-sm font-black text-foreground uppercase tracking-wide">Net Profit</span>
                                <div className="text-right">
                                    <span className={cn("text-xl font-black", netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                        ₹{netProfit.toLocaleString()}
                                    </span>
                                    <div className="text-[10px] font-bold text-muted-foreground">
                                        {profitMargin.toFixed(1)}% Margin
                                    </div>
                                </div>
                            </div>
                        </div>



                        {/* --- DETAIL MODAL --- */}
                        <Modal
                            isOpen={!!selectedDetail && selectedDetail !== 'collections' && selectedDetail !== 'credit'} // Simplified: Disable modal for now for cash/collections
                            onClose={() => setSelectedDetail(null)}
                            className="bg-zinc-950 border-zinc-800 border max-w-lg p-0 overflow-hidden flex flex-col max-h-[85vh]"
                        >
                            {selectedDetail && (
                                <>
                                    <div className="p-5 pr-12 border-b border-zinc-800 bg-zinc-950 shrink-0">
                                        <h3 className="font-black text-lg flex items-center gap-2 text-white">
                                            {selectedDetail === 'sales' && <><TrendingUp className="text-emerald-500" /> Gross Sales Breakdown</>}
                                            {selectedDetail === 'goods' && <><ShoppingBag className="text-orange-500" /> Goods Cost Breakdown</>}
                                            {selectedDetail === 'expenses' && <><Wallet className="text-rose-500" /> Other Expenses</>}
                                        </h3>
                                    </div>

                                    <div className="overflow-y-auto p-4 space-y-3 bg-zinc-950">
                                        {/* SALES BREAKDOWN */}
                                        {selectedDetail === 'sales' && (
                                            data.transactions.length === 0 ? <p className="text-center text-zinc-500 py-8">No sales found.</p> :
                                                data.transactions.map((t: any) => (
                                                    <div key={t.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                        <div>
                                                            <p className="font-bold text-sm text-zinc-200 truncate pr-8">{t.products?.name}</p>
                                                            <p className="text-xs text-zinc-400">{t.quantity} {t.products?.unit} x ₹{t.sell_price}</p>
                                                        </div>
                                                        <div className="font-bold text-emerald-500">₹{(t.quantity * t.sell_price).toLocaleString()}</div>
                                                    </div>
                                                ))
                                        )}

                                        {/* GOODS COST BREAKDOWN */}
                                        {selectedDetail === 'goods' && (
                                            <>
                                                {/* 1. Transaction Costs */}
                                                {data.transactions.filter(t => t.buy_price > 0).map((t: any) => (
                                                    <div key={`cogs-${t.id}`} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-sm text-zinc-200 truncate max-w-[150px]">{t.products?.name}</p>
                                                                <span className="text-[10px] bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Sold Item Cost</span>
                                                            </div>
                                                            <p className="text-xs text-zinc-400">{t.quantity} {t.products?.unit} x ₹{t.buy_price} (Buy Price)</p>
                                                        </div>
                                                        <div className="font-bold text-rose-500">-₹{(t.quantity * t.buy_price).toLocaleString()}</div>
                                                    </div>
                                                ))}

                                                {/* 2. Ghee/Ingredient Manual Expenses */}
                                                {data.expenses.filter(e => e.is_ghee_ingredient).map((e: any) => (
                                                    <div key={e.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-sm text-zinc-200 truncate max-w-[150px]">{e.title}</p>
                                                                <span className="text-[10px] bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Ingredient</span>
                                                            </div>
                                                            <p className="text-xs text-zinc-400">{new Date(e.date).toLocaleDateString()}</p>
                                                        </div>
                                                        <div className="font-bold text-rose-500">-₹{e.amount.toLocaleString()}</div>
                                                    </div>
                                                ))}

                                                {/* Check if empty */}
                                                {(data.transactions.every(t => !t.buy_price) && data.expenses.every(e => !e.is_ghee_ingredient)) && (
                                                    <p className="text-center text-zinc-500 py-8">No goods costs recorded.</p>
                                                )}
                                            </>
                                        )}

                                        {/* OTHER EXPENSES BREAKDOWN */}
                                        {selectedDetail === 'expenses' && (
                                            data.expenses.filter(e => !e.is_ghee_ingredient).length === 0 ? <p className="text-center text-zinc-500 py-8">No other expenses found.</p> :
                                                data.expenses.filter(e => !e.is_ghee_ingredient).map((e: any) => (
                                                    <div key={e.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                        <div>
                                                            <p className="font-bold text-sm text-zinc-200 truncate pr-8">{e.title}</p>
                                                            <p className="text-xs text-zinc-400">{new Date(e.date).toLocaleDateString()}</p>
                                                        </div>
                                                        <div className="font-bold text-rose-500">-₹{e.amount.toLocaleString()}</div>
                                                    </div>
                                                ))
                                        )}

                                        {/* CREDIT GIVEN BREAKDOWN */}
                                        {selectedDetail === 'credit' && (
                                            (() => {
                                                const creditSales = data.transactions.filter(t => (t.credit_amount || 0) > 0);

                                                return creditSales.length === 0 ? <p className="text-center text-zinc-500 py-8">No credit sales found.</p> :
                                                    creditSales.map((t: any) => {
                                                        const amount = t.credit_amount; // Always use credit_amount now

                                                        return (
                                                            <div key={t.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-bold text-sm text-zinc-200 truncate max-w-[150px]">{t.customers?.name}</p>
                                                                        <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Credit</span>
                                                                    </div>
                                                                    <p className="text-xs text-zinc-400 truncate pr-4">{t.products?.name} - {new Date(t.date).toLocaleDateString()}</p>
                                                                </div>
                                                                <div className="font-bold text-amber-500">₹{amount.toLocaleString()}</div>
                                                            </div>
                                                        );
                                                    });
                                            })()
                                        )}



                                        {/* COLLECTIONS BREAKDOWN */}
                                        {selectedDetail === 'collections' && (
                                            data.collections.length === 0 ? <p className="text-center text-zinc-500 py-8">No collections found.</p> :
                                                data.collections.map((c: any) => (
                                                    <div key={c.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-sm text-zinc-200 truncate pr-8">{c.customers?.name}</p>
                                                            </div>
                                                            <p className="text-xs text-zinc-400">{new Date(c.collected_at).toLocaleDateString()}</p>
                                                        </div>
                                                        <div className="font-bold text-emerald-500">+₹{c.amount.toLocaleString()}</div>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                    <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
                                        <div className="flex justify-between items-center font-black text-lg text-white">
                                            <span>Total</span>
                                            <span>
                                                {selectedDetail === 'sales' && `₹${totalSales.toLocaleString()}`}
                                                {selectedDetail === 'goods' && `₹${totalGoodsCost.toLocaleString()}`}
                                                {selectedDetail === 'expenses' && `₹${totalOtherExpenses.toLocaleString()}`}
                                                {selectedDetail === 'credit' && `₹${totalCreditGiven.toLocaleString()}`}
                                                {selectedDetail === 'collections' && `₹${totalCollections.toLocaleString()}`}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </Modal>
                    </div>
                )}

                {/* --- CUSTOMERS VIEW --- */}
                {activeTab === 'customers' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Search & Sort */}
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input
                                    placeholder="Search customer..."
                                    value={customerSearch}
                                    onChange={e => setCustomerSearch(e.target.value)}
                                    className="w-full bg-card px-4 py-3 md:py-2.5 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all placeholder:font-medium h-12 md:h-auto"
                                />
                            </div>
                            <button
                                onClick={() => setCustomerSort(prev => prev === 'high' ? 'low' : 'high')}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setCustomerSort(prev => prev === 'high' ? 'low' : 'high');
                                    }
                                }}
                                tabIndex={0}
                                className="bg-card px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                aria-label={`Sort ${customerSort === 'high' ? 'low to high' : 'high to low'}`}
                            >
                                <ArrowUpDown size={16} />
                                <span className="text-xs font-bold hidden sm:inline">{customerSort === 'high' ? 'High-Low' : 'Low-High'}</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            {filteredCustomers.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <p className="text-sm font-medium">No customers found</p>
                                </div>
                            ) : (
                                filteredCustomers.map((c: any) => (
                                    <div
                                        key={c.name}
                                        onClick={() => setSelectedCustomer(c.name)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setSelectedCustomer(c.name);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        className="bg-card p-3 md:p-4 rounded-xl border border-border/50 shadow-sm flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-all group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                        aria-label={`View details for ${c.name}`}
                                    >
                                        <div>
                                            <p className="font-bold text-foreground text-sm md:text-base mb-0.5 group-hover:text-primary transition-colors">{c.name}</p>
                                            <p className="text-[10px] md:text-xs text-muted-foreground font-medium">{c.count} items purchased</p>
                                        </div>
                                        <div className="text-right flex items-center gap-2 md:gap-3">
                                            <p className="text-base md:text-lg font-black text-emerald-600">₹{c.sales.toLocaleString()}</p>
                                            <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-primary group-hover:opacity-100 transition-all" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                    </div>
                )}

                {/* --- ACTIVITY VIEW (Existing Logic) --- */}
                {activeTab === 'activity' && (
                    <div className="space-y-8 animate-in bg-background pb-32">
                        {/* Bulk Actions Header */}
                        {/* Bulk Selection Header Bar */}
                        {isSelectionMode && (
                            <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border sticky top-0 md:relative z-30 shadow-sm animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-3">
                                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={toggleSelectionMode}>
                                        <X size={18} />
                                    </Button>
                                    <span className="text-sm font-bold text-foreground">
                                        {selectedTransactionIds.size + selectedExpenseIds.size} Selected
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={toggleSelectAll}
                                        className="h-8 text-xs font-bold"
                                    >
                                        Select All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={deleteSelectedItems}
                                        className="h-8 px-3"
                                        disabled={selectedTransactionIds.size === 0 && selectedExpenseIds.size === 0}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        )}
                        {/* Transactions List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                                        <ShoppingBag size={20} />
                                    </div>
                                    Sales Log
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">{data.transactions.length}</span>
                                </h3>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Sales</p>
                                    <p className="text-lg font-black text-emerald-500 dark:text-emerald-400">₹{totalSales.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {loading ? (
                                    <div className="space-y-4">
                                        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-accent/30 rounded-xl animate-pulse" />)}
                                    </div>
                                ) : data.transactions.length === 0 && (
                                    <div className="text-center py-12 text-muted-foreground bg-accent/20 rounded-2xl border-2 border-dashed border-border/60">
                                        <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
                                        <p className="font-medium">No sales recorded today.</p>
                                        <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">Refresh Data</Button>
                                    </div>
                                )}

                                {data.transactions.map((t: any) => (
                                    <div key={t.id} className={cn("bg-card p-3 md:p-4 rounded-xl shadow-sm border border-border/60 transition-all relative group touch-manipulation select-none overflow-visible", isSelectionMode && selectedTransactionIds.has(t.id) && "ring-2 ring-primary bg-primary/5", activeMenuId === t.id && "z-[150]")}>
                                        {/* Editing Mode Override */}
                                        {editingId === t.id ? (
                                            <div className="space-y-4 animate-in fade-in">
                                                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                                    <span className="font-bold text-foreground">{t.products?.name}</span>
                                                    <span className="text-[10px] text-primary font-black uppercase bg-primary/10 px-2 py-1 rounded-full">Editing Mode</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Date</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                                                            type="date"
                                                            value={editDate}
                                                            onChange={e => setEditDate(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Qty</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                                                            type="number"
                                                            value={editQty}
                                                            onChange={e => setEditQty(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Sell ₹</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                                                            type="number"
                                                            value={editPrice}
                                                            onChange={e => setEditPrice(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Buy ₹</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold text-center focus:ring-2 focus:ring-primary outline-none"
                                                            type="number"
                                                            value={editBuyPrice}
                                                            onChange={e => setEditBuyPrice(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 pt-2">
                                                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20" onClick={saveEdit}>Save Changes</Button>
                                                    <Button variant="ghost" className="flex-1 hover:bg-destructive/10 hover:text-destructive" onClick={() => setEditingId(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Normal Item View (Unified) */
                                            <div className="flex items-center justify-between">
                                                {/* Start/Left Section: Selection Checkbox & Main Content */}
                                                <div
                                                    className="flex-1 flex items-center gap-3 cursor-pointer"
                                                    onContextMenu={(e) => e.preventDefault()}
                                                    onTouchStart={(e) => !isSelectionMode && handleTransactionTouchStart(e, t.id, selectedTransactionIds.has(t.id))}
                                                    onTouchEnd={handleTouchEnd}
                                                    onTouchMove={handleTouchMove}
                                                    onTouchCancel={handleTouchEnd}
                                                    onMouseDown={(e) => !isSelectionMode && handleTransactionTouchStart(e, t.id, selectedTransactionIds.has(t.id))}
                                                    onMouseUp={handleTouchEnd}
                                                    onMouseLeave={handleTouchEnd}
                                                    onClick={() => {
                                                        if (isSelectionMode) toggleTransactionSelection(t.id);
                                                    }}
                                                >
                                                    {/* Selection Checkbox */}
                                                    {isSelectionMode && (
                                                        <div className="flex items-center justify-center w-8 h-8 mr-1 animate-in fade-in zoom-in spin-in-12 duration-200">
                                                            {selectedTransactionIds.has(t.id) ?
                                                                <CheckCircle2 className="text-primary fill-primary/20" size={22} /> :
                                                                <Circle className="text-muted-foreground" size={22} />
                                                            }
                                                        </div>
                                                    )}

                                                    {/* Main Content */}
                                                    <div className={cn("flex-1 min-w-0 pointer-events-none transition-opacity", isSelectionMode ? "opacity-80" : "opacity-100")}>
                                                        <div className="font-bold text-foreground text-sm truncate pr-2">{t.customers?.name}</div>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium mr-2">
                                                                <span className="text-foreground/90">{t.products?.name}</span>
                                                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mx-1" />
                                                                <span>{t.quantity} {t.products?.unit}</span>
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">@ ₹{t.sell_price}/-</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* End/Right Section: Amount & Menu */}
                                                <div className="text-right flex items-center gap-1 md:gap-2 flex-shrink-0">
                                                    <div className="font-black text-emerald-500 text-base md:text-lg whitespace-nowrap">
                                                        ₹{(t.quantity * t.sell_price).toLocaleString()}
                                                    </div>

                                                    {!isSelectionMode && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === t.id ? null : t.id); }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onTouchStart={(e) => e.stopPropagation()}
                                                                className="p-1.5 text-muted-foreground hover:bg-accent active:bg-accent rounded-lg transition"
                                                            >
                                                                <MoreVertical size={16} />
                                                            </button>

                                                            {activeMenuId === t.id && (
                                                                <div
                                                                    role="menu"
                                                                    className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[200] overflow-visible animate-in fade-in zoom-in-95 ring-1 ring-black/5"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    onTouchStart={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="flex flex-col p-1">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); startEdit(t); }}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onTouchStart={(e) => e.stopPropagation()}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent active:bg-accent rounded-lg text-left"
                                                                        >
                                                                            <Edit2 size={14} /> Edit
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); deleteTransaction(t.id, t.customers?.name, t.products?.name); }}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onTouchStart={(e) => e.stopPropagation()}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 active:bg-rose-500/10 rounded-lg text-left"
                                                                        >
                                                                            <Trash2 size={14} /> Delete
                                                                        </button>
                                                                        <div className="h-px bg-border/50 my-1" />
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveMenuId(null);
                                                                                toggleSelectionMode();
                                                                                toggleTransactionSelection(t.id);
                                                                            }}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onTouchStart={(e) => e.stopPropagation()}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent active:bg-accent rounded-lg text-left"
                                                                        >
                                                                            <CheckCircle2 size={14} /> Select
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Expenses List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                    <div className="bg-rose-500/10 p-2 rounded-lg text-rose-500">
                                        <Wallet size={20} />
                                    </div>
                                    Expenses Log
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">{combinedExpenses.length}</span>
                                </h3>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Expenses</p>
                                    <p className="text-lg font-black text-rose-600">₹{combinedExpenses.reduce((acc, e) => acc + e.amount, 0).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {combinedExpenses.map((e: any) => (
                                    <div key={e.id} className={cn(
                                        "bg-card p-3 md:p-4 rounded-xl shadow-sm border border-border/60 hover:shadow-md transition-all relative",
                                        isSelectionMode && selectedExpenseIds.has(e.id) && "ring-2 ring-primary bg-primary/5",
                                        activeMenuId === e.id && "z-[150]"
                                    )}>
                                        {/* Expense Editing Mode */}
                                        {editingExpenseId === e.id ? (
                                            <div className="space-y-4 animate-in fade-in">
                                                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                                    <span className="font-bold text-foreground">Edit Expense</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Title</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold focus:ring-2 focus:ring-primary outline-none"
                                                            value={editExpenseTitle}
                                                            onChange={evt => setEditExpenseTitle(evt.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">Amount</label>
                                                        <input
                                                            className="w-full p-2 bg-accent rounded-lg border border-border text-foreground font-bold focus:ring-2 focus:ring-primary outline-none"
                                                            type="number"
                                                            value={editExpenseAmount}
                                                            onChange={evt => setEditExpenseAmount(evt.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 pt-2">
                                                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20" onClick={saveEditExpense}>Save</Button>
                                                    <Button variant="ghost" className="flex-1 hover:bg-destructive/10 hover:text-destructive" onClick={() => setEditingExpenseId(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Unified Expense Item View */
                                            <div className={cn("flex items-center justify-between", e.type !== 'manual' && isSelectionMode && "opacity-50 grayscale")}>
                                                {/* Left Content */}
                                                <div
                                                    className="flex-1 flex items-center gap-3 cursor-pointer"
                                                    onContextMenu={(event) => event.preventDefault()}
                                                    onTouchStart={(evt) => !isSelectionMode && e.type === 'manual' && handleExpenseTouchStart(evt, e.id, selectedExpenseIds.has(e.id))}
                                                    onTouchEnd={handleTouchEnd}
                                                    onTouchMove={handleTouchMove}
                                                    onTouchCancel={handleTouchEnd}
                                                    onMouseDown={(evt) => !isSelectionMode && e.type === 'manual' && handleExpenseTouchStart(evt, e.id, selectedExpenseIds.has(e.id))}
                                                    onMouseUp={handleTouchEnd}
                                                    onMouseLeave={handleTouchEnd}
                                                    onClick={() => {
                                                        if (isSelectionMode && e.type === 'manual') toggleExpenseSelection(e.id);
                                                    }}
                                                >
                                                    {/* Selection Checkbox */}
                                                    {isSelectionMode && (
                                                        <div className="flex items-center justify-center w-8 h-8 mr-1 animate-in fade-in zoom-in spin-in-12 duration-200">
                                                            {e.type !== 'manual' ? (
                                                                <Circle className="text-muted-foreground/20" size={22} />
                                                            ) : selectedExpenseIds.has(e.id) ? (
                                                                <CheckCircle2 className="text-primary fill-primary/20" size={22} />
                                                            ) : (
                                                                <Circle className="text-muted-foreground" size={22} />
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Main Expense Info */}
                                                    <div className={cn("flex-1 min-w-0 pointer-events-none transition-opacity", isSelectionMode ? "opacity-70" : "opacity-100")}>
                                                        <div className="font-bold text-foreground text-sm">{e.title}</div>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {e.type === 'cogs' && (
                                                                <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium mr-2">
                                                                    <span>{e.raw.quantity} {e.raw.products?.unit}</span>
                                                                    <span className="text-rose-500">@ ₹{e.raw.buy_price}/-</span>
                                                                </div>
                                                            )}
                                                            {e.type === 'cogs' || e.isGhee ? (
                                                                <span className="bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide">
                                                                    Goods Cost
                                                                </span>
                                                            ) : (
                                                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide">
                                                                    Manual Expense
                                                                </span>
                                                            )}
                                                        </div>
                                                        {isSelectionMode && e.type === 'manual' && (
                                                            <div className="text-rose-600 font-bold text-base mt-1">-₹{e.amount.toLocaleString()}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right Content */}
                                                <div className="text-right flex items-center gap-1 md:gap-3 flex-shrink-0">
                                                    {(!isSelectionMode || e.type !== 'manual') && (
                                                        <div className="font-black text-rose-600 dark:text-rose-400 text-base md:text-lg">-₹{e.amount.toLocaleString()}</div>
                                                    )}

                                                    {/* Menu - Hidden in Selection Mode */}
                                                    {!isSelectionMode && e.type === 'manual' && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={(evt) => { evt.stopPropagation(); setActiveMenuId(activeMenuId === e.id ? null : e.id); }}
                                                                className={cn(
                                                                    "p-1.5 text-muted-foreground hover:bg-accent active:bg-accent rounded-lg transition ml-2",
                                                                    "opacity-100"
                                                                )}
                                                            >
                                                                <MoreVertical size={16} />
                                                            </button>

                                                            {activeMenuId === e.id && (
                                                                <div
                                                                    role="menu"
                                                                    className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[200] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5 pointer-events-auto"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="flex flex-col p-1">
                                                                        <button
                                                                            onClick={(evt) => { evt.stopPropagation(); setActiveMenuId(null); startEditExpense(e); }}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent active:bg-accent rounded-lg text-left"
                                                                        >
                                                                            <Edit2 size={14} /> Edit
                                                                        </button>
                                                                        <button
                                                                            onClick={(evt) => { evt.stopPropagation(); setActiveMenuId(null); deleteExpense(e.id); }}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 active:bg-rose-500/10 rounded-lg text-left"
                                                                        >
                                                                            <Trash2 size={14} /> Delete
                                                                        </button>
                                                                        <div className="h-px bg-border/50 my-1" />
                                                                        <button
                                                                            onClick={(evt) => {
                                                                                evt.stopPropagation();
                                                                                setActiveMenuId(null);
                                                                                toggleSelectionMode();
                                                                                toggleExpenseSelection(e.id);
                                                                            }}
                                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent active:bg-accent rounded-lg text-left"
                                                                        >
                                                                            <CheckCircle2 size={14} /> Select
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>


                    </div>
                )}
            </div>

            {/* MOVED: Customer Detail Modal - To avoid z-index/clipping issues inside animations */}
            <Modal
                isOpen={!!selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
                className="bg-neutral-900 border-neutral-800 border max-w-lg p-0 overflow-hidden flex flex-col max-h-[85vh]"
            >
                {
                    selectedCustomer && (() => {
                        const { transactions, totalSold, totalBought, customerProfit } = getCustomerFinancials(selectedCustomer!);

                        return (
                            <>
                                <div className="p-5 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-neutral-800 rounded-full text-neutral-400">
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-lg text-white leading-tight">{selectedCustomer}</h3>
                                            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wide">Transaction History</p>
                                        </div>
                                    </div>

                                </div>

                                <div className="overflow-y-auto p-4 space-y-3 bg-neutral-900">
                                    {transactions.map((t: any) => (
                                        <div key={t.id} className="p-3 bg-black/40 border border-neutral-800 rounded-xl space-y-3">
                                            <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                                                <span className="font-bold text-neutral-200 text-sm">{t.products?.name}</span>
                                                <span className="text-[10px] text-neutral-500 font-bold">{new Date(t.date).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <p className="text-[10px] text-neutral-500 font-bold uppercase mb-0.5">Sold For</p>
                                                    <p className="text-emerald-500 font-black text-base">₹{(t.quantity * t.sell_price).toLocaleString()}</p>
                                                    <p className="text-[10px] text-neutral-400 font-medium">{t.quantity} {t.products?.unit} x ₹{t.sell_price}</p>
                                                </div>
                                                <div className="w-px h-8 bg-neutral-800"></div>
                                                <div className="flex-1 text-right">
                                                    <p className="text-[10px] text-neutral-500 font-bold uppercase mb-0.5">Bought For</p>
                                                    <p className="text-rose-500 font-black text-base">₹{(t.quantity * t.buy_price).toLocaleString()}</p>
                                                    <p className="text-[10px] text-neutral-400 font-medium">{t.quantity} {t.products?.unit} x ₹{t.buy_price}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-5 border-t border-neutral-800 bg-neutral-900 shrink-0">
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex-1 text-center p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                            <p className="text-[9px] font-bold text-emerald-600/70 uppercase">Total Sold</p>
                                            <p className="text-sm font-black text-emerald-500">₹{totalSold.toLocaleString()}</p>
                                        </div>

                                        <div className="font-black text-zinc-500 text-2xl">-</div>

                                        <div className="flex-1 text-center p-2 rounded-xl bg-rose-500/5 border border-rose-500/10">
                                            <p className="text-[9px] font-bold text-rose-600/70 uppercase">Total Bought</p>
                                            <p className="text-sm font-black text-rose-500">₹{totalBought.toLocaleString()}</p>
                                        </div>

                                        <div className="font-black text-zinc-500 text-2xl">=</div>

                                        <div className="flex-1 text-center p-2 rounded-xl bg-neutral-800 border border-neutral-700">
                                            <p className="text-[9px] font-bold text-neutral-400 uppercase">Profit</p>
                                            <p className={cn("text-sm font-black", customerProfit >= 0 ? "text-white" : "text-rose-400")}>
                                                ₹{customerProfit.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        );
                    })()
                }
            </Modal>
            {/* EXPORT MODAL */}
            <Modal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                className="bg-card border-border max-w-sm"
            >
                <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                            <Download size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-foreground">Export Data</h3>
                            <p className="text-xs text-muted-foreground">Select data to download as CSV</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <button
                            disabled={isExporting}
                            onClick={() => handleExport('sales')}
                            className="w-full p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl flex items-center justify-between transition-all group disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
                                    <ShoppingBag size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm text-foreground">Sales Activity</p>
                                    <p className="text-[10px] text-muted-foreground">Current Range ({ranges.find(r => r.key === rangeType)?.label})</p>
                                </div>
                            </div>
                            <Download size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </button>

                        <button
                            disabled={isExporting}
                            onClick={() => handleExport('customers')}
                            className="w-full p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl flex items-center justify-between transition-all group disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600">
                                    <User size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm text-foreground">Customer List</p>
                                    <p className="text-[10px] text-muted-foreground">Complete Database</p>
                                </div>
                            </div>
                            <Download size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </button>

                        <button
                            disabled={isExporting}
                            onClick={() => handleExport('products')}
                            className="w-full p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl flex items-center justify-between transition-all group disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-600">
                                    <Wallet size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm text-foreground">Product List</p>
                                    <p className="text-[10px] text-muted-foreground">Complete Inventory</p>
                                </div>
                            </div>
                            <Download size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </button>
                    </div>

                    <button
                        onClick={() => setShowExportModal(false)}
                        className="w-full mt-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </Modal>



        </div >
    );
}

