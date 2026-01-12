import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Receipt, Edit2, Trash2, MoreVertical, CheckCircle2, Circle, X } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";
import { useMarkPaymentViewed } from "../hooks/usePendingTaskCount";
import { notifyPaymentCollected } from "../lib/insightsEvents";

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

type TransactionLog = {
    date: string;
    time: string;
    type: 'due_added' | 'payment_received' | 'credit_sale';
    amount: number;
    balance: number;
};

// Helper function to format date with ordinal suffix
function formatDateWithOrdinal(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();

    const getOrdinal = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return `${getOrdinal(day)} ${month} ${year}`;
}

export default function CustomerPaymentDetail() {
    const { customerId } = useParams<{ customerId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const markPaymentViewed = useMarkPaymentViewed();

    // Mark this customer as viewed when the page loads
    useEffect(() => {
        if (customerId) {
            markPaymentViewed(customerId);
        }
    }, [customerId, markPaymentViewed]);

    // ... (state vars)
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [reminders, setReminders] = useState<PaymentReminder[]>([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [earliestDueDate, setEarliestDueDate] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<TransactionLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useHistorySyncedState(false, 'customerSelectionMode');
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [showMenu, setShowMenu] = useHistorySyncedState(false, 'customerMenu');

    // Modals & Forms - synced with browser history
    const [showAddDue, setShowAddDue] = useHistorySyncedState(false, 'customerAddDue');
    const [showReceivePayment, setShowReceivePayment] = useHistorySyncedState(false, 'customerReceive');
    const [showEditDate, setShowEditDate] = useHistorySyncedState(false, 'customerEditDate');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [dueAmount, setDueAmount] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [receiveAmount, setReceiveAmount] = useState("");
    const [newDueDate, setNewDueDate] = useState("");

    // Side effects for state changes
    useEffect(() => {
        if (!isSelectionMode) {
            setSelectedIndices(new Set());
        }
    }, [isSelectionMode]);

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

    // Close menu on ESC or click outside
    useDropdownClose(showMenu, () => setShowMenu(false));

    // Selection Logic
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIndices(new Set());
        setShowMenu(false);
    };

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);

        if (newSet.size === 0 && isSelectionMode) {
            // Optional: Exit selection mode if last item unselected? 
            // User requested: "if i unselect all the transaction, then it should go back to normal"
            setIsSelectionMode(false);
        }

        setSelectedIndices(newSet);
    };

    const handleSelectAll = () => {
        const allIndices = new Set(transactions.map((_, i) => i));
        setSelectedIndices(allIndices);
        setIsSelectionMode(true);
        setShowMenu(false);
    };

    // Long Press Logic
    // Using a simple ref-based approach for long press detection
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleTouchStart = (index: number) => {
        timerRef.current = setTimeout(() => {
            setIsSelectionMode(true);
            const newSet = new Set<number>();
            newSet.add(index);
            setSelectedIndices(newSet);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500); // 500ms long press
    };

    const handleTouchEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleTouchMove = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const deleteSelected = () => {
        if (selectedIndices.size === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIndices.size} transactions?`,
            description: "These transactions will be permanently removed.",
            onConfirm: async () => {
                // Perform Bulk Delete
                await performBulkDelete();
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    const performBulkDelete = async () => {
        if (reminders.length === 0) return;

        // 1. Parse all transactions from ALL reminders (Global List)
        const allParsed: { reminderId: string; lineIndex: number; data: TransactionLog }[] = [];
        const currentYear = new Date().getFullYear();
        const now = new Date();

        for (const reminder of reminders) {
            const noteLines = (reminder.note || "").split('\n');
            noteLines.forEach((line: string, idx: number) => {
                if (!line.trim()) return;
                try {
                    if (line.startsWith('[')) {
                        const dateMatch = line.match(/\[(.*?)\]/);
                        if (!dateMatch) return;

                        const dateParts = dateMatch[1].split(' ').filter(Boolean);
                        let datePart = "";
                        let timePart = "";

                        if (dateParts.length === 2) {
                            const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                            const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                            datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                            timePart = "";
                        } else if (dateParts.length >= 3) {
                            const isYearAtIndex2 = /^\d{4}$/.test(dateParts[2]);
                            if (isYearAtIndex2) {
                                datePart = `${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
                                timePart = dateParts.slice(3).join(' ');
                            } else {
                                const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                                const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                                datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                                timePart = dateParts.slice(2).join(' ');
                            }
                        } else {
                            datePart = dateParts[0] || '';
                        }

                        if (timePart) timePart = timePart.replace(/am|pm/gi, '').trim();

                        const isCreditSale = line.includes('Credit Sale:');
                        const isDueAdded = line.includes('New Due Added:');
                        const isPayment = line.includes('Received:');
                        if (!isCreditSale && !isDueAdded && !isPayment) return;

                        let amountMatch;
                        if (isCreditSale) amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                        else if (isDueAdded) amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/Received: ₹([\d,]+)/);

                        if (amountMatch) {
                            let txnType: 'due_added' | 'payment_received' | 'credit_sale';
                            if (isCreditSale) txnType = 'credit_sale';
                            else if (isDueAdded) txnType = 'due_added';
                            else txnType = 'payment_received';

                            allParsed.push({
                                reminderId: reminder.id,
                                lineIndex: idx,
                                data: { date: datePart, time: timePart, type: txnType, amount: parseFloat(amountMatch[1].replace(/,/g, '')), balance: 0 }
                            });
                        }
                    } else if (line.includes('Credit Sale on')) {
                        // Old format
                        const dateMatch = line.match(/Credit Sale on (.+?)\./);
                        const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                        const paidMatch = line.match(/Paid Now: ₹([\d,]+)/);
                        if (dateMatch && totalMatch) {
                            const totalBill = parseFloat(totalMatch[1].replace(/,/g, ''));
                            const paidNow = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
                            const creditAmount = totalBill - paidNow;
                            allParsed.push({ reminderId: reminder.id, lineIndex: idx, data: { date: dateMatch[1], time: '', type: 'credit_sale', amount: creditAmount, balance: 0 } });
                        }
                    }
                } catch (e) { }
            });
        }

        // 2. Identify indices to remove
        // viewIndices are relative to transactions.slice(-20)
        // We need to map selectedIndices (view indices) to real allParsed indices.
        const offset = Math.max(0, allParsed.length - 20);

        const realIndicesToRemove = new Set<number>();
        selectedIndices.forEach(viewIdx => {
            // viewIdx is index in the displayed list (reversed?)
            // transactions.slice().reverse().map((txn, idx) => ... idx is Loop Index
            // actualIndex = transactions.length - 1 - idx; 
            // setEditingIndex(actualIndex) -> The handlers expect actualIndex relative to 'transactions' array (0..19)

            // Wait, visual list is REVERSED. 
            // The visual item at index 0 (top) corresponds to `transactions[transactions.length - 1]`.
            // `selectedIndices` stores `idx` from the map loop?
            // If we use the visual index directly, we need to convert.
            // But let's check how we will bind the click.
            // onClick={() => toggleSelection(idx)} where idx is the Loop Index (0 = Top/Newest).

            // So if I select top item (idx 0), it is `topIndex`.
            // transactions array is [Oldest ... Newest].
            // transactions.length = 20.
            // Top Item = transactions[19].
            // actualIndex = 20 - 1 - 0 = 19.

            // So `viewIdx` stored in `selectedIndices` should be `actualIndex` to be consistent?
            // OR `viewIdx` is visual index?
            // It is simpler to store `actualIndex` (relative to transactions array) because that's what we pass to delete handlers usually.

            // Let's ensure the UI passes `actualIndex`.

            const realIdxInAllParsed = offset + viewIdx;
            realIndicesToRemove.add(realIdxInAllParsed);
        });

        // 3. Process removals per reminder
        // We group removals by reminderId to be efficient
        const updates: any[] = [];

        // We need to iterate over allParsed again to rebuild lines?
        // Better: Iterate over reminders, filtering out lines that are in realIndicesToRemove

        let globalProcessedIndex = 0;

        for (const reminder of reminders) {
            const noteLines = (reminder.note || "").split('\n');
            const keptLines: string[] = [];
            let reminderModified = false;

            // We need to match lines to globalProcessedIndex.
            // But some lines in note are NOT transactions (empty, etc).
            // We must traverse exactly as the parser does to align indices.

            noteLines.forEach((line) => {
                let isTransactionLine = false;
                let shouldKeep = true;

                if (line.trim().startsWith('[')) {
                    const isCreditSale = line.includes('Credit Sale:');
                    const isDueAdded = line.includes('New Due Added:');
                    const isPayment = line.includes('Received:');

                    if (isCreditSale || isDueAdded || isPayment) {
                        let amountMatch;
                        if (isCreditSale) amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                        else if (isDueAdded) amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/Received: ₹([\d,]+)/);

                        const balanceMatch = line.match(/Balance: ₹([\d,]+)/);

                        if (amountMatch && balanceMatch) {
                            isTransactionLine = true;
                        }
                    }
                } else if (line.includes('Credit Sale on') && line.includes('Total Bill:')) {
                    // Check if old format is valid
                    const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                    if (totalMatch) isTransactionLine = true;
                }

                if (isTransactionLine) {
                    if (realIndicesToRemove.has(globalProcessedIndex)) {
                        shouldKeep = false;
                        reminderModified = true;
                    }
                    globalProcessedIndex++;
                }

                if (shouldKeep) {
                    keptLines.push(line);
                }
            });

            if (reminderModified) {
                updates.push({ reminder, lines: keptLines });
            }
        }

        // 4. Recalculate balances for modified reminders (and potentially all subsequent, but here we assume disjoint reminders logic or local balance? 
        // Customer reminders are usually global balance history.
        // We need to recalculate ALL reminders if we want a global running balance.
        // But for CustomerPaymentDetail, the `handleDeleteTransaction` logic recalculates per reminder. 
        // Is it global? 
        // Current implementation of `handleDeleteTransaction` recalculates `runningBalance` for THAT reminder only.
        // If we want to support global recalculation (like we did for Supplier), we should iterate ALL reminders and recalculate running balance from 0 across the chain.

        // Let's implement GLOBAL recalculation for consistency.

        let runningBalance = 0;
        const finalUpdates: any[] = [];

        // We need to iterate all reminders again (with some having modified lines)
        // Construct a new "virtual" list of all lines from all reminders

        // Optimization: updates array contains `{ reminder, lines }`. 
        // We should just iterate `reminders`, check if it's in `updates` to get new lines, otherwise use old lines.

        for (const reminder of reminders) {
            const updateEntry = updates.find(u => u.reminder.id === reminder.id);
            let lines = updateEntry ? updateEntry.lines : (reminder.note || "").split('\n');

            const newLines: string[] = [];
            let changed = !!updateEntry; // If lines removed, it's changed. If recalc changes numbers, it's also changed.

            lines.forEach((line: string) => {
                // similar recalc logic
                const trimmed = line.trim();
                if (!trimmed) { newLines.push(line); return; }

                let amount = 0;
                let isCredit = false;

                if (trimmed.startsWith('[')) {
                    if (line.includes('Credit Sale:')) { isCredit = true; amount = parseFloat(line.match(/Credit Sale: ₹([\d,]+)/)?.[1].replace(/,/g, '') || "0"); }
                    else if (line.includes('New Due Added:')) { isCredit = true; amount = parseFloat(line.match(/New Due Added: ₹([\d,]+)/)?.[1].replace(/,/g, '') || "0"); }
                    else if (line.includes('Received:')) { isCredit = false; amount = parseFloat(line.match(/Received: ₹([\d,]+)/)?.[1].replace(/,/g, '') || "0"); }
                    else { newLines.push(line); return; }

                    // Update global balance
                    if (isCredit) runningBalance += amount;
                    else runningBalance -= amount;

                    // Rewrite line
                    const dateMatch = line.match(/\[(.*?)\]/);
                    if (dateMatch) {
                        let typeStr = isCredit ? (line.includes('Credit Sale') ? 'Credit Sale' : 'New Due Added') : 'Received';
                        const newLine = `[${dateMatch[1]}] ${typeStr}: ₹${amount.toLocaleString()}. Balance: ₹${Math.max(0, runningBalance).toLocaleString()}`;
                        if (newLine !== line) { changed = true; }
                        newLines.push(newLine);
                    } else {
                        newLines.push(line);
                    }
                } else if (line.includes('Credit Sale on')) {
                    // Old format support
                    const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                    const paidMatch = line.match(/Paid Now: ₹([\d,]+)/);
                    if (totalMatch) {
                        const totalBill = parseFloat(totalMatch[1].replace(/,/g, ''));
                        const paidNow = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
                        amount = totalBill - paidNow;
                        runningBalance += amount; // Credit
                        // Assuming we don't rewrite old format lines to new format to preserve history style, just push
                        newLines.push(line);
                    } else {
                        newLines.push(line);
                    }
                } else {
                    newLines.push(line);
                }
            });

            if (changed) {
                finalUpdates.push({
                    id: reminder.id,
                    note: newLines.join('\n'),
                    amount: Math.max(0, runningBalance),
                    status: Math.max(0, runningBalance) <= 0 ? 'paid' : 'pending'
                });
            }
        }

        // 5. Execute Updates
        if (finalUpdates.length > 0) {
            let hasError = false;
            // Sequential updates to be safe
            for (const u of finalUpdates) {
                const { error } = await supabase.from('payment_reminders').update(u).eq('id', u.id);
                if (error) { console.error(error); hasError = true; }
            }

            if (!hasError) {
                toast("Transactions deleted", "success");
                setIsSelectionMode(false);
                setSelectedIndices(new Set());
                loadData();
            } else {
                toast("Failed to delete some transactions", "error");
            }
        } else {
            setIsSelectionMode(false);
            setSelectedIndices(new Set());
            toast("No changes made", "info");
        }
    };

    useEffect(() => {
        loadData();
    }, [customerId]);

    const loadData = async () => {
        if (!customerId) return;

        setLoading(true);

        try {
            // Load customer
            const { data: customerData, error: custError } = await supabase
                .from("customers")
                .select("id, name")
                .eq("id", customerId)
                .single();

            if (custError) throw custError;
            if (customerData) setCustomer(customerData);

            // Load ALL payment reminders for this customer
            const { data: remindersData, error: remError } = await supabase
                .from("payment_reminders")
                .select("*")
                .eq("customer_id", customerId)
                .eq("status", "pending")
                .order("due_date", { ascending: true });

            if (remError) throw remError;

            if (remindersData && remindersData.length > 0) {
                setReminders(remindersData);

                // Calculate total balance from all reminders
                const total = remindersData.reduce((sum, r) => {
                    const val = typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount;
                    return sum + (isNaN(val) ? 0 : val);
                }, 0);
                setTotalBalance(total);

                // Get earliest due date
                setEarliestDueDate(remindersData[0].due_date);

                // Combine and parse transactions from all reminders
                const allNotes = remindersData.map(r => r.note || "").join("\n");
                parseTransactions(allNotes);
            } else {
                setReminders([]);
                setTotalBalance(0);
                setEarliestDueDate(null);
                setTransactions([]);
            }
        } catch (error) {
            console.error("Error loading payment details:", error);
            toast("Failed to load details. Please refresh.", "error");
        } finally {
            setLoading(false);
        }
    };

    const parseTransactions = (note: string) => {
        const lines = note.split('\n').filter(l => l.trim().length > 0);
        const parsed: TransactionLog[] = [];
        const currentYear = new Date().getFullYear();
        const now = new Date();

        for (const line of lines) {
            try {
                // Try new format first: [Date Time] Type: ₹Amount. Balance: ₹Balance
                if (line.startsWith('[')) {
                    const dateMatch = line.match(/\[(.*?)\]/);
                    if (!dateMatch) continue;

                    const dateParts = dateMatch[1].split(' ').filter(Boolean);
                    // Examples: 
                    // [8 Jan 10:30] -> length 3, p[2] has colon -> Old format
                    // [8 Jan 2025 10:30] -> length 4, p[2] is year -> New format
                    // [8 Jan 10:30 AM] -> length 4, p[2] has colon -> Old format

                    let datePart = "";
                    let timePart = "";

                    if (dateParts.length === 2) {
                        // "8 Jan" - Missing time + year
                        const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                        const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                        datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                        timePart = "";
                    } else if (dateParts.length >= 3) {
                        // Check if 3rd part (index 2) is a Year (4 digits)
                        // It must be a number and 4 digits long.
                        const isYearAtIndex2 = /^\d{4}$/.test(dateParts[2]);

                        if (isYearAtIndex2) {
                            // NEW FORMAT: Day Month Year Time...
                            datePart = `${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
                            timePart = dateParts.slice(3).join(' ');
                        } else {
                            // OLD FORMAT: Day Month Time... (Year missing)
                            const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                            const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                            datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                            timePart = dateParts.slice(2).join(' ');
                        }
                    } else {
                        // Fallback
                        datePart = dateParts[0] || '';
                    }

                    // Strict 24h format enforcement: Remove AM/PM if present using regex
                    if (timePart) {
                        timePart = timePart.replace(/am|pm/gi, '').trim();
                    }


                    const isCreditSale = line.includes('Credit Sale:');
                    const isDueAdded = line.includes('New Due Added:');
                    const isPayment = line.includes('Received:');

                    if (!isCreditSale && !isDueAdded && !isPayment) continue;

                    let amountMatch;
                    if (isCreditSale) {
                        amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                    } else if (isDueAdded) {
                        amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                    } else {
                        amountMatch = line.match(/Received: ₹([\d,]+)/);
                    }

                    const balanceMatch = line.match(/Balance: ₹([\d,]+)/);

                    if (amountMatch && balanceMatch) {
                        let txnType: 'due_added' | 'payment_received' | 'credit_sale';
                        if (isCreditSale) txnType = 'credit_sale';
                        else if (isDueAdded) txnType = 'due_added';
                        else txnType = 'payment_received';

                        parsed.push({
                            date: datePart,
                            time: timePart,
                            type: txnType,
                            amount: parseFloat(amountMatch[1].replace(/,/g, '')),
                            balance: parseFloat(balanceMatch[1].replace(/,/g, ''))
                        });
                    }
                }
                // Handle old format: "Credit Sale on DATE. Total Bill: ₹X. Paid Now: ₹Y."
                else if (line.includes('Credit Sale on')) {
                    const dateMatch = line.match(/Credit Sale on (.+?)\./);
                    const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                    const paidMatch = line.match(/Paid Now: ₹([\d,]+)/);

                    if (dateMatch && totalMatch) {
                        const totalBill = parseFloat(totalMatch[1].replace(/,/g, ''));
                        const paidNow = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
                        const creditAmount = totalBill - paidNow;

                        parsed.push({
                            date: dateMatch[1],
                            time: '',
                            type: 'credit_sale',
                            amount: creditAmount,
                            balance: creditAmount // For old format, balance equals amount
                        });
                    }
                }
            } catch (e) {
                console.error('Error parsing transaction:', e);
            }
        }

        // Show only last 20 transactions
        setTransactions(parsed.slice(-20));
    };

    const handleAddDue = async () => {
        if (!dueAmount || reminders.length === 0) {
            toast("Please enter an amount", "warning");
            return;
        }

        const primaryReminder = reminders[0];
        const newAmount = primaryReminder.amount + parseFloat(dueAmount);
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        let newNote = primaryReminder.note || "";
        if (newNote) newNote += "\n";
        newNote += `[${dateStr} ${timeStr}] New Due Added: ₹${parseFloat(dueAmount).toLocaleString()}. Balance: ₹${newAmount.toLocaleString()}`;

        const updates: any = {
            amount: newAmount,
            note: newNote
        };

        // Update due date if provided, otherwise keep existing
        if (dueDate) {
            updates.due_date = dueDate;
        }

        const { error } = await supabase
            .from('payment_reminders')
            .update(updates)
            .eq('id', primaryReminder.id);

        if (error) {
            toast("Failed to add due", "error");
        } else {
            toast(`Added ₹${parseFloat(dueAmount).toLocaleString()} to balance`, "success");
            setShowAddDue(false);
            setDueAmount("");
            setDueDate("");
            loadData();
        }
    };

    const handleReceivePayment = async () => {
        if (!receiveAmount || reminders.length === 0) {
            toast("Please enter an amount", "warning");
            return;
        }

        const primaryReminder = reminders[0];
        const received = parseFloat(receiveAmount);
        const newBalance = primaryReminder.amount - received;
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        let newNote = primaryReminder.note || "";
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
            .eq('id', primaryReminder.id);

        if (error) {
            toast("Failed to record payment", "error");
        } else {
            toast(newBalance <= 0 ? "Fully paid!" : `Received ₹${received.toLocaleString()}`, "success");
            setShowReceivePayment(false);
            setReceiveAmount("");

            // Notify insights to refresh (auto-complete payment task)
            notifyPaymentCollected();

            loadData();
        }
    };

    const handleEditTransaction = async (viewIndex: number, newAmount: number) => {
        if (reminders.length === 0 || isNaN(newAmount)) return;

        // 1. Parse all transactions from ALL reminders
        const allParsed: { reminderId: string; lineIndex: number; data: TransactionLog }[] = [];
        const currentYear = new Date().getFullYear();
        const now = new Date();

        for (const reminder of reminders) {
            const noteLines = (reminder.note || "").split('\n');
            noteLines.forEach((line: string, idx: number) => {
                if (!line.trim()) return;
                try {
                    if (line.startsWith('[')) {
                        const dateMatch = line.match(/\[(.*?)\]/);
                        if (!dateMatch) return;

                        const dateParts = dateMatch[1].split(' ').filter(Boolean);
                        let datePart = "";
                        let timePart = "";

                        if (dateParts.length === 2) {
                            const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                            const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                            datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                            timePart = "";
                        } else if (dateParts.length >= 3) {
                            const isYearAtIndex2 = /^\d{4}$/.test(dateParts[2]);
                            if (isYearAtIndex2) {
                                datePart = `${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
                                timePart = dateParts.slice(3).join(' ');
                            } else {
                                const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                                const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                                datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                                timePart = dateParts.slice(2).join(' ');
                            }
                        } else {
                            datePart = dateParts[0] || '';
                        }

                        if (timePart) timePart = timePart.replace(/am|pm/gi, '').trim();

                        const isCreditSale = line.includes('Credit Sale:');
                        const isDueAdded = line.includes('New Due Added:');
                        const isPayment = line.includes('Received:');
                        if (!isCreditSale && !isDueAdded && !isPayment) return;

                        let amountMatch;
                        if (isCreditSale) amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                        else if (isDueAdded) amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/Received: ₹([\d,]+)/);

                        if (amountMatch) {
                            let txnType: 'due_added' | 'payment_received' | 'credit_sale';
                            if (isCreditSale) txnType = 'credit_sale';
                            else if (isDueAdded) txnType = 'due_added';
                            else txnType = 'payment_received';
                            allParsed.push({ reminderId: reminder.id, lineIndex: idx, data: { date: datePart, time: timePart, type: txnType, amount: parseFloat(amountMatch[1].replace(/,/g, '')), balance: 0 } });
                        }
                    } else if (line.includes('Credit Sale on')) {
                        const dateMatch = line.match(/Credit Sale on (.+?)\./);
                        const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                        const paidMatch = line.match(/Paid Now: ₹([\d,]+)/);
                        if (dateMatch && totalMatch) {
                            const totalBill = parseFloat(totalMatch[1].replace(/,/g, ''));
                            const paidNow = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
                            const creditAmount = totalBill - paidNow;
                            allParsed.push({ reminderId: reminder.id, lineIndex: idx, data: { date: dateMatch[1], time: '', type: 'credit_sale', amount: creditAmount, balance: 0 } });
                        }
                    }
                } catch (e) { }
            });
        }

        // 2. Map viewIndex to real index
        const offset = Math.max(0, allParsed.length - 20);
        const realIndex = offset + viewIndex;

        if (!allParsed[realIndex]) {
            toast("Error finding transaction", "error");
            return;
        }

        const targetTxn = allParsed[realIndex];
        const targetReminder = reminders.find(r => r.id === targetTxn.reminderId);

        if (!targetReminder) {
            toast("Error finding reminder", "error");
            return;
        }

        // 3. Update the transaction in memory
        targetTxn.data.amount = newAmount;

        // 4. Recalculate balances
        const noteLines = (targetReminder.note || "").split('\n');
        const reminderParsed = allParsed.filter(p => p.reminderId === targetReminder.id);

        // Update the parsed list with the new amount (it refers to the same object in allParsed, but let's be safe)
        // Since allParsed contains objects, and we mapped them, modification to targetTxn.data.amount should reflect in reminderParsed if they share references.
        // Yes, reference is shared.

        let runningBalance = 0;
        const newNoteLines = [...noteLines];

        reminderParsed.forEach((item) => {
            // Recalculate based on item.data.amount (which is now updated for the target)
            if (item.data.type === 'due_added' || item.data.type === 'credit_sale') {
                runningBalance += item.data.amount;
            } else {
                runningBalance -= item.data.amount;
            }

            let typeStr: string;
            if (item.data.type === 'credit_sale') typeStr = 'Credit Sale';
            else if (item.data.type === 'due_added') typeStr = 'New Due Added';
            else typeStr = 'Received';

            const newLine = `[${item.data.date} ${item.data.time}] ${typeStr}: ₹${item.data.amount.toLocaleString()}. Balance: ₹${Math.max(0, runningBalance).toLocaleString()}`;
            newNoteLines[item.lineIndex] = newLine;
        });

        const updates: any = {
            note: newNoteLines.join('\n'),
            amount: Math.max(0, runningBalance)
        };
        if (runningBalance <= 0) updates.status = 'paid';

        const { error } = await supabase.from('payment_reminders').update(updates).eq('id', targetReminder.id);

        if (error) {
            toast("Failed to update transaction", "error");
        } else {
            toast("Transaction updated", "success");
            setEditingIndex(null);
            loadData();
        }
    };

    const handleDeleteTransaction = (viewIndex: number) => {
        if (reminders.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: "Delete this transaction?",
            description: "This action cannot be undone.",
            onConfirm: async () => {
                await performSingleDelete(viewIndex);
            },
            variant: "destructive",
            confirmText: "Delete"
        });
    };

    const performSingleDelete = async (viewIndex: number) => {
        if (reminders.length === 0) return;

        // 1. Parse all transactions from ALL reminders (matching how UI displays)
        const allParsed: { reminderId: string; lineIndex: number; data: TransactionLog }[] = [];
        const currentYear = new Date().getFullYear();
        const now = new Date();

        for (const reminder of reminders) {
            const noteLines = (reminder.note || "").split('\n');

            noteLines.forEach((line: string, idx: number) => {
                if (!line.trim()) return;
                try {
                    // New format
                    if (line.startsWith('[')) {
                        const dateMatch = line.match(/\[(.*?)\]/);
                        if (!dateMatch) return;

                        const dateParts = dateMatch[1].split(' ').filter(Boolean);
                        let datePart = "";
                        let timePart = "";

                        if (dateParts.length === 2) {
                            const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                            const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                            datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                            timePart = "";
                        } else if (dateParts.length >= 3) {
                            const isYearAtIndex2 = /^\d{4}$/.test(dateParts[2]);
                            if (isYearAtIndex2) {
                                datePart = `${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
                                timePart = dateParts.slice(3).join(' ');
                            } else {
                                const tempDate = new Date(`${dateParts[0]} ${dateParts[1]} ${currentYear}`);
                                const yearToUse = tempDate > now ? currentYear - 1 : currentYear;
                                datePart = `${dateParts[0]} ${dateParts[1]} ${yearToUse}`;
                                timePart = dateParts.slice(2).join(' ');
                            }
                        } else {
                            datePart = dateParts[0] || '';
                        }

                        if (timePart) timePart = timePart.replace(/am|pm/gi, '').trim();

                        const isCreditSale = line.includes('Credit Sale:');
                        const isDueAdded = line.includes('New Due Added:');
                        const isPayment = line.includes('Received:');
                        if (!isCreditSale && !isDueAdded && !isPayment) return;

                        let amountMatch;
                        if (isCreditSale) amountMatch = line.match(/Credit Sale: ₹([\d,]+)/);
                        else if (isDueAdded) amountMatch = line.match(/New Due Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/Received: ₹([\d,]+)/);

                        // Remaining logic...

                        if (amountMatch) {
                            let txnType: 'due_added' | 'payment_received' | 'credit_sale';
                            if (isCreditSale) txnType = 'credit_sale';
                            else if (isDueAdded) txnType = 'due_added';
                            else txnType = 'payment_received';

                            allParsed.push({
                                reminderId: reminder.id,
                                lineIndex: idx,
                                data: { date: datePart, time: timePart, type: txnType, amount: parseFloat(amountMatch[1].replace(/,/g, '')), balance: 0 }
                            });
                        }
                    }
                    // Old format
                    else if (line.includes('Credit Sale on')) {
                        const dateMatch = line.match(/Credit Sale on (.+?)\./);
                        const totalMatch = line.match(/Total Bill: ₹([\d,]+)/);
                        const paidMatch = line.match(/Paid Now: ₹([\d,]+)/);
                        if (dateMatch && totalMatch) {
                            const totalBill = parseFloat(totalMatch[1].replace(/,/g, ''));
                            const paidNow = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
                            const creditAmount = totalBill - paidNow;
                            allParsed.push({
                                reminderId: reminder.id,
                                lineIndex: idx,
                                data: { date: dateMatch[1], time: '', type: 'credit_sale', amount: creditAmount, balance: 0 }
                            });
                        }
                    }
                } catch (e) { }
            });
        }

        // 2. Map viewIndex to the actual transaction
        // The transactions state shows last 20, so we need to find which one
        const offset = Math.max(0, allParsed.length - 20);
        const realIndex = offset + viewIndex;

        if (!allParsed[realIndex]) {
            toast("Error finding transaction", "error");
            return;
        }

        const targetTxn = allParsed[realIndex];
        const targetReminder = reminders.find(r => r.id === targetTxn.reminderId);

        if (!targetReminder) {
            toast("Error finding reminder", "error");
            return;
        }

        // 3. Get the note lines for this specific reminder
        const noteLines = (targetReminder.note || "").split('\n');

        // 4. Remove the target line
        const newNoteLines = noteLines.filter((_, idx) => idx !== targetTxn.lineIndex);

        // 5. Recalculate balances for this reminder
        let runningBalance = 0;
        const reminderParsed = allParsed.filter(p => p.reminderId === targetReminder.id && p.lineIndex !== targetTxn.lineIndex);

        // Re-index after removal
        reminderParsed.forEach((item) => {
            const newLineIndex = item.lineIndex > targetTxn.lineIndex ? item.lineIndex - 1 : item.lineIndex;

            if (item.data.type === 'due_added' || item.data.type === 'credit_sale') {
                runningBalance += item.data.amount;
            } else {
                runningBalance -= item.data.amount;
            }

            let typeStr: string;
            if (item.data.type === 'credit_sale') typeStr = 'Credit Sale';
            else if (item.data.type === 'due_added') typeStr = 'New Due Added';
            else typeStr = 'Received';

            const newLine = `[${item.data.date} ${item.data.time}] ${typeStr}: ₹${item.data.amount.toLocaleString()}. Balance: ₹${Math.max(0, runningBalance).toLocaleString()}`;
            newNoteLines[newLineIndex] = newLine;
        });

        // 6. Update supabase
        const updates: any = {
            note: newNoteLines.join('\n'),
            amount: Math.max(0, runningBalance)
        };

        // If balance becomes 0, mark as paid
        if (runningBalance <= 0) {
            updates.status = 'paid';
        }

        const { error } = await supabase
            .from('payment_reminders')
            .update(updates)
            .eq('id', targetReminder.id);

        if (error) {
            toast("Failed to delete transaction", "error");
        } else {
            toast("Transaction deleted", "success");
            loadData();
        }
    };

    const handleClearBalance = () => {
        if (reminders.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: "Clear entire balance?",
            description: "This will mark the balance as zero and status as paid. This cannot be undone.",
            onConfirm: async () => {
                // Mark all reminders as paid
                for (const reminder of reminders) {
                    const { error } = await supabase
                        .from('payment_reminders')
                        .update({ amount: 0, status: 'paid', note: reminder.note ? reminder.note + '\n[Cleared] Balance manually cleared.' : '[Cleared] Balance manually cleared.' })
                        .eq('id', reminder.id);

                    if (error) {
                        toast("Failed to clear balance", "error");
                        return;
                    }
                }

                toast("Balance cleared successfully", "success");
                loadData();
            },
            variant: "destructive",
            confirmText: "Clear Balance"
        });
    };

    const handleUpdateDueDate = async () => {
        if (!customerId || !newDueDate) return;

        const { error } = await supabase
            .from('payment_reminders')
            .update({ due_date: newDueDate })
            .eq('customer_id', customerId)
            .eq('status', 'pending');

        if (error) {
            toast("Failed to update due date", "error");
        } else {
            toast("Due date updated", "success");
            setShowEditDate(false);
            loadData();
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background px-3 md:px-4 pb-32 w-full md:max-w-2xl md:mx-auto">
                <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-border px-3 py-3 md:px-4 md:py-4">
                    <div className="w-full md:max-w-2xl md:mx-auto">
                        <div className="h-8 bg-muted/50 rounded-lg animate-pulse w-48" />
                    </div>
                </div>
                <div className="h-24 md:h-28" />
                <div className="space-y-4">
                    {/* Balance Card Skeleton */}
                    <div className="h-32 bg-muted/50 rounded-2xl animate-pulse" />
                    {/* Action Buttons Skeleton */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="h-12 bg-muted/50 rounded-xl animate-pulse" />
                        <div className="h-12 bg-muted/50 rounded-xl animate-pulse" />
                    </div>
                    {/* Transaction List Skeleton */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="h-12 bg-muted/50 animate-pulse" />
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-20 bg-muted/30 border-t border-zinc-200 dark:border-zinc-800 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!customer || reminders.length === 0) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
                <p className="text-foreground mb-4">No pending payments for this customer</p>
                <Button onClick={() => navigate('/payment-reminders')}>Go Back</Button>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-background text-foreground px-3 md:px-4 pb-32 w-full md:max-w-2xl md:mx-auto">
                {/* Header */}
                <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-border px-3 py-3 md:px-4 md:py-4">
                    <div className="w-full md:max-w-2xl md:mx-auto">
                        {isSelectionMode ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={toggleSelectionMode}
                                        className="p-2 -ml-1 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                                    >
                                        <X size={18} strokeWidth={2.5} />
                                    </button>
                                    <span className="font-bold text-lg">{selectedIndices.size} Selected</span>
                                </div>
                                <button
                                    onClick={deleteSelected}
                                    disabled={selectedIndices.size === 0}
                                    className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                                >
                                    <Trash2 size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => window.history.back()}
                                    className="p-2 -ml-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all duration-150 active:scale-95"
                                >
                                    <ArrowLeft size={18} strokeWidth={2.5} />
                                </button>
                                <div className="flex-1">
                                    <h1 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white">{customer.name}</h1>
                                    <p className="text-xs text-zinc-500">Payment History</p>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowMenu(!showMenu)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setShowMenu(!showMenu);
                                            }
                                        }}
                                        tabIndex={0}
                                        className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                                        aria-label="More options"
                                    >
                                        <MoreVertical size={18} strokeWidth={2.5} />
                                    </button>
                                    {showMenu && (
                                        <>

                                            <div
                                                className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-20 overflow-hidden py-1"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => handleSelectAll()}
                                                    className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    Select All
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setIsSelectionMode(true);
                                                        setShowMenu(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    Select Transactions
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="h-24 md:h-28" />

                {/* Balance Card */}
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 rounded-2xl p-4 md:p-5 mb-6 text-white shadow-xl">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-xs opacity-75 mb-1">Current Balance</p>
                            <p className="text-3xl md:text-4xl font-black">₹{totalBalance.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-right">
                                <p className="text-sm opacity-75 mb-1">Due Date</p>
                                <p className="text-lg md:text-xl font-bold">{earliestDueDate ? new Date(earliestDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</p>
                            </div>
                            <button
                                onClick={() => { setNewDueDate(earliestDueDate || ''); setShowEditDate(true); }}
                                className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                                aria-label="Edit due date"
                            >
                                <Edit2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                        onClick={() => { setDueAmount(""); setDueDate(""); setShowAddDue(true); }}
                        className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-1"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Add Due
                    </button>
                    <button
                        onClick={() => { setReceiveAmount(""); setShowReceivePayment(true); }}
                        className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
                    >
                        <Receipt size={18} strokeWidth={2.5} />
                        Receive
                    </button>
                </div>

                {/* Transaction History */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                        <h2 className="font-bold text-sm text-zinc-900 dark:text-white">Transaction History</h2>
                        <p className="text-xs text-zinc-500">Last {transactions.length} transactions</p>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="p-6 text-center">
                            {totalBalance > 0 ? (
                                <div className="space-y-4">
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                                        <p className="text-amber-800 dark:text-amber-200 font-bold text-sm mb-2">
                                            ⚠️ Unknown Balance Detected
                                        </p>
                                        <p className="text-amber-700 dark:text-amber-300 text-xs mb-2">
                                            There's a balance of ₹{totalBalance.toLocaleString()} with no transaction history.
                                            This may be from old data or a sync issue.
                                        </p>
                                        <p className="text-amber-600 dark:text-amber-400 text-xs">
                                            You can clear this balance if it's incorrect, or add a new transaction to track it properly.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleClearBalance}
                                        className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        Clear Balance (₹{totalBalance.toLocaleString()})
                                    </button>
                                </div>
                            ) : (
                                <p className="text-zinc-500">No transactions yet</p>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {transactions.slice().reverse().map((txn, idx) => {
                                const actualIndex = transactions.length - 1 - idx;
                                const isEditable = actualIndex >= transactions.length - 1;

                                return (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "p-4 transition-all duration-200",
                                            isSelectionMode && selectedIndices.has(actualIndex)
                                                ? "bg-emerald-50/80 dark:bg-emerald-900/20"
                                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                        )}
                                        onClick={(e) => {
                                            if (isSelectionMode) {
                                                e.preventDefault();
                                                toggleSelection(actualIndex);
                                            }
                                        }}
                                        onTouchStart={() => handleTouchStart(actualIndex)}
                                        onTouchEnd={handleTouchEnd}
                                        onTouchCancel={handleTouchEnd}
                                        onTouchMove={handleTouchMove}
                                        onContextMenu={() => {
                                            // Optional: prevent default menu on long press contexts if needed
                                        }}
                                    >
                                        <div className="flex items-start gap-4">
                                            {isSelectionMode && (
                                                <div className="flex items-center justify-center w-10 h-10 pt-1">
                                                    {selectedIndices.has(actualIndex) ? (
                                                        <CheckCircle2 className="text-emerald-500 fill-emerald-100 dark:fill-emerald-900" size={24} strokeWidth={2.5} />
                                                    ) : (
                                                        <Circle className="text-zinc-300 dark:text-zinc-600" size={24} strokeWidth={2} />
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "text-base md:text-lg font-bold",
                                                            txn.type === 'payment_received' ? "text-emerald-600 dark:text-emerald-400" :
                                                                txn.type === 'credit_sale' ? "text-blue-600 dark:text-blue-400" :
                                                                    "text-orange-600 dark:text-orange-400"
                                                        )}>
                                                            {txn.type === 'payment_received' ? 'Payment Received' :
                                                                txn.type === 'credit_sale' ? 'Credit Sale' :
                                                                    'Due Added'}
                                                        </span>
                                                        {!isSelectionMode && (
                                                            <div className="flex items-center gap-0">
                                                                {isEditable && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setEditingIndex(actualIndex); }}
                                                                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                                                                        aria-label="Edit transaction"
                                                                    >
                                                                        <Edit2 size={14} className="text-zinc-400" strokeWidth={2.5} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(actualIndex); }}
                                                                    className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                                                                    aria-label="Delete transaction"
                                                                >
                                                                    <Trash2 size={14} className="text-zinc-400 hover:text-red-500" strokeWidth={2.5} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={cn(
                                                            "text-base md:text-lg font-bold",
                                                            txn.type === 'payment_received' ? "text-emerald-600 dark:text-emerald-400" :
                                                                txn.type === 'credit_sale' ? "text-blue-600 dark:text-blue-400" :
                                                                    "text-orange-600 dark:text-orange-400"
                                                        )}>
                                                            {txn.type === 'payment_received' ? '-' : '+'}₹{txn.amount.toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">Balance: ₹{txn.balance.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-zinc-500 font-medium">{formatDateWithOrdinal(txn.date)}{txn.time ? ` • ${txn.time}` : ''}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Add Due Modal */}
            <Modal isOpen={showAddDue} onClose={() => setShowAddDue(false)} title={<h2 className="text-lg font-bold">Add New Due</h2>}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                autoFocus
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-orange-500 rounded-xl px-4 h-12 text-lg font-bold outline-none transition-all"
                                placeholder="0"
                                value={dueAmount}
                                onChange={e => setDueAmount(e.target.value)}
                            />
                        </div>
                    </div>

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

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setShowAddDue(false)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleAddDue} className="h-12 bg-orange-500 hover:bg-orange-600">
                            Add Due
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Receive Payment Modal */}
            <Modal isOpen={showReceivePayment} onClose={() => setShowReceivePayment(false)} title={<h2 className="text-lg font-bold">Receive Payment</h2>}>
                <div className="space-y-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl text-center">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Balance</p>
                        <p className="text-2xl font-black text-zinc-900 dark:text-white">₹{totalBalance.toLocaleString()}</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount Received</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                autoFocus
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 pr-20 h-14 text-xl font-bold outline-none transition-all"
                                placeholder="0"
                                value={receiveAmount}
                                onChange={e => setReceiveAmount(e.target.value)}
                            />
                            <button
                                onClick={() => setReceiveAmount(totalBalance.toString())}
                                className="absolute right-2 top-2 bottom-2 px-3 bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-600 hover:bg-emerald-50 dark:hover:bg-zinc-600 transition-colors"
                            >
                                FULL
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setShowReceivePayment(false)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleReceivePayment} className="h-12 bg-emerald-500 hover:bg-emerald-600">
                            Receive
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Transaction Modal */}
            <Modal
                isOpen={editingIndex !== null}
                onClose={() => setEditingIndex(null)}
                title={<h2 className="text-lg font-bold">Edit Transaction</h2>}
            >
                {editingIndex !== null && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Correct Amount</label>
                            <div className="relative mt-1">
                                <input
                                    type="number"
                                    autoFocus
                                    key={editingIndex}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-violet-500 rounded-xl px-4 h-14 text-xl font-bold outline-none transition-all"
                                    defaultValue={transactions[editingIndex].amount}
                                    id="edit-amount"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Button variant="outline" onClick={() => setEditingIndex(null)} className="h-12">
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    const val = (document.getElementById('edit-amount') as HTMLInputElement).value;
                                    handleEditTransaction(editingIndex, parseFloat(val));
                                }}
                                className="h-12 bg-emerald-500 hover:bg-emerald-600"
                            >
                                Update
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit Due Date Modal */}
            <Modal
                isOpen={showEditDate}
                onClose={() => setShowEditDate(false)}
                title={<h2 className="text-lg font-bold">Edit Due Date</h2>}
            >
                <div className="space-y-4">
                    <p className="text-sm text-zinc-500">
                        This will update the due date for all pending payment reminders for this customer.
                    </p>
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">New Due Date</label>
                        <input
                            type="date"
                            autoFocus
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all mt-1"
                            value={newDueDate}
                            onChange={e => setNewDueDate(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setShowEditDate(false)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateDueDate} className="h-12 bg-emerald-500 hover:bg-emerald-600">
                            Update Date
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={closeConfirm}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                description={confirmConfig.description}
                variant={confirmConfig.variant}
                confirmText={confirmConfig.confirmText}
            />
        </>
    );
}
