import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Plus, Wallet, Edit2, Trash2, X, MoreVertical, CheckCircle2, Circle } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";
import { useMarkPayableViewed } from "../hooks/usePendingTaskCount";
import { notifyPayablePaid } from "../lib/insightsEvents";

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

type TransactionLog = {
    date: string;
    time: string;
    type: 'payable_added' | 'payment_made' | 'credit_purchase';
    amount: number;
    balance: number;
    note?: string; // Extra info like "Linked from Sale"
};

// Helper function to format date with ordinal suffix
const formatDateWithOrdinal = (dateStr: string): string => {
    try {
        // Parse the date string (format: "8 Jan" or similar)
        const parts = dateStr.trim().split(' ');
        if (parts.length < 2) return dateStr;

        const day = parseInt(parts[0]);
        const month = parts[1];
        const currentYear = new Date().getFullYear();

        // Get ordinal suffix
        const getOrdinal = (n: number): string => {
            const s = ["th", "st", "nd", "rd"];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        return `${getOrdinal(day)} ${month} ${currentYear}`;
    } catch (e) {
        return dateStr;
    }
};

export default function SupplierPaymentDetail() {
    const { supplierId } = useParams<{ supplierId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const markPayableViewed = useMarkPayableViewed();

    // Mark this supplier as viewed when the page loads
    useEffect(() => {
        if (supplierId) {
            markPayableViewed(supplierId);
        }
    }, [supplierId, markPayableViewed]);

    const [supplier, setSupplier] = useState<Supplier | null>(null);
    const [payables, setPayables] = useState<Payable[]>([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [earliestDueDate, setEarliestDueDate] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<TransactionLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals - synced with browser history
    const [showAddPayable, setShowAddPayable] = useHistorySyncedState(false, 'supplierAddPayable');
    const [showMakePayment, setShowMakePayment] = useHistorySyncedState(false, 'supplierMakePayment');
    const [showEditDate, setShowEditDate] = useHistorySyncedState(false, 'supplierEditDate');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Form states
    const [payableAmount, setPayableAmount] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [paymentAmount, setPaymentAmount] = useState("");

    // Edit Due Date
    const [newDueDate, setNewDueDate] = useState("");

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useHistorySyncedState(false, 'supplierSelectionMode');
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [showMenu, setShowMenu] = useHistorySyncedState(false, 'supplierMenu');
    const timerRef = useRef<NodeJS.Timeout | null>(null);

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

    useEffect(() => {
        loadData();
    }, [supplierId]);

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

    const handleTouchStart = (index: number) => {
        timerRef.current = setTimeout(() => {
            setIsSelectionMode(true);
            const newSet = new Set<number>();
            newSet.add(index);
            setSelectedIndices(newSet);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
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
        if (payables.length === 0 || selectedIndices.size === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIndices.size} transactions?`,
            description: "These transactions will be permanently removed.",
            onConfirm: async () => {
                await performDeleteSelected();
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    const performDeleteSelected = async () => {

        const sortedPayables = [...payables].sort((a, b) =>
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );

        let totalTxnCount = 0;
        for (const p of sortedPayables) {
            const lines = (p.note || "").split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('[')) {
                    const isCreditPurchase = line.includes('Credit Purchase:');
                    const isLinked = line.includes('Linked from Sale');
                    const isPayableAdded = line.includes('New Payable Added:') || line.includes('New Due Added:');
                    const isPayment = line.includes('Paid:') || line.includes('Payment Made:');

                    if (isCreditPurchase || isLinked || isPayableAdded || isPayment) {
                        let amountMatch;
                        if (isCreditPurchase) amountMatch = line.match(/Credit Purchase: ₹([\d,]+)/);
                        else if (isLinked) amountMatch = line.match(/: ₹([\d,]+)/);
                        else if (isPayableAdded) amountMatch = line.match(/Added: ₹([\d,]+)/);
                        else amountMatch = line.match(/(?:Paid|Payment Made): ₹([\d,]+)/);

                        const balanceMatch = line.match(/Balance: ₹([\d,]+)/);

                        if (amountMatch && balanceMatch) {
                            totalTxnCount++;
                        }
                    }
                }
            }
        }

        const offset = Math.max(0, totalTxnCount - 20);
        const realIndicesToRemove = new Set<number>();
        selectedIndices.forEach(viewIdx => {
            realIndicesToRemove.add(offset + viewIdx);
        });

        let currentRealIndex = 0;
        let globalBalance = 0;
        const updates: any[] = [];

        for (const payable of sortedPayables) {
            let localBalance = 0;
            const noteLines = (payable.note || "").split('\n');
            const keptLines: string[] = [];
            let payableModified = false;

            noteLines.forEach((line) => {
                const trimmed = line.trim();

                if (trimmed.startsWith('[')) {
                    const isCredit = line.includes('Credit Purchase:') || line.includes('Linked from Sale') || line.includes('New Payable Added:') || line.includes('New Due Added:');
                    const isPayment = line.includes('Paid:') || line.includes('Payment Made:');

                    if (isCredit || isPayment) {
                        if (realIndicesToRemove.has(currentRealIndex)) {
                            payableModified = true;
                        } else {
                            const dateMatch = line.match(/\[(.*?)\]/);
                            let amount = 0;
                            let amountMatch;
                            if (isCredit) amountMatch = line.match(/purchase: ₹([\d,]+)/i) || line.match(/added: ₹([\d,]+)/i) || line.match(/: ₹([\d,]+)/);
                            else amountMatch = line.match(/(?:Paid|Payment Made): ₹([\d,]+)/i);

                            if (amountMatch) amount = parseFloat(amountMatch[1].replace(/,/g, ''));

                            if (isCredit) {
                                localBalance += amount;
                                globalBalance += amount;
                            } else {
                                localBalance -= amount;
                                globalBalance -= amount;
                            }

                            if (dateMatch) {
                                let typeStr = isCredit ? 'Credit Purchase' : 'Payment Made';
                                if (line.includes('New Payable Added')) typeStr = 'New Payable Added';
                                if (line.includes('Paid:')) typeStr = 'Paid';

                                const newLine = `[${dateMatch[1]}] ${typeStr}: ₹${amount.toLocaleString()}. Balance: ₹${Math.max(0, globalBalance).toLocaleString()}`;
                                if (newLine !== line) {
                                    keptLines.push(newLine);
                                    payableModified = true;
                                } else {
                                    keptLines.push(line);
                                }
                            } else {
                                keptLines.push(line);
                            }
                        }
                        currentRealIndex++;
                    } else {
                        keptLines.push(line);
                    }
                } else {
                    keptLines.push(line);
                }
            });

            if (payableModified) {
                updates.push({
                    id: payable.id,
                    amount: Math.max(0, localBalance),
                    note: keptLines.join('\n'),
                    status: Math.max(0, localBalance) <= 0 ? 'paid' : 'pending'
                });
            }
        }

        if (updates.length > 0) {
            let hasError = false;
            for (const update of updates) {
                const { error } = await supabase.from('accounts_payable').update(update).eq('id', update.id);
                if (error) { console.error(error); hasError = true; }
            }

            if (hasError) toast("Failed to delete some items", "error");
            else {
                toast("Transactions deleted", "success");
                setIsSelectionMode(false);
                setSelectedIndices(new Set());
                loadData();
            }
        } else {
            setIsSelectionMode(false);
            setSelectedIndices(new Set());
            toast("No changes made", "info");
        }
    };

    const loadData = async () => {
        if (!supplierId) return;

        setLoading(true);

        try {
            // Load supplier
            const { data: supplierData, error: supError } = await supabase
                .from("suppliers")
                .select("id, name")
                .eq("id", supplierId)
                .single();

            if (supError) throw supError;
            if (supplierData) setSupplier(supplierData);

            // Load ALL accounts payable for this supplier
            const { data: payablesData, error: payError } = await supabase
                .from("accounts_payable")
                .select("*")
                .eq("supplier_id", supplierId)
                .eq("status", "pending")
                .order("due_date", { ascending: true });

            if (payError) throw payError;

            if (payablesData && payablesData.length > 0) {
                setPayables(payablesData);

                // Calculate total balance from all payables
                const total = payablesData.reduce((sum, r) => {
                    const val = typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount;
                    return sum + (isNaN(val) ? 0 : val);
                }, 0);
                setTotalBalance(total);

                // Get earliest due date
                setEarliestDueDate(payablesData[0].due_date);

                // Combine and parse transactions from all payables
                // Sort by recorded_at to ensure history is chronological regardless of due date
                const historyPayables = [...payablesData].sort((a, b) =>
                    new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
                );
                const allNotes = historyPayables.map(r => r.note || "").join("\n");
                parseTransactions(allNotes);
            } else {
                setPayables([]);
                setTotalBalance(0);
                setEarliestDueDate(null);
                setTransactions([]);
            }
        } catch (error) {
            console.error("Error loading details:", error);
            toast("Failed to load details. Please refresh.", "error");
        } finally {
            setLoading(false);
        }
    };

    const parseTransactions = (note: string) => {
        const lines = note.split('\n').filter(l => l.trim().length > 0);
        const parsed: TransactionLog[] = [];

        for (const line of lines) {
            try {
                // Format: [Date Time] Type: ₹Amount. Balance: ₹Balance
                if (line.startsWith('[')) {
                    const dateMatch = line.match(/\[(.*?)\]/);
                    if (!dateMatch) continue;

                    const dateParts = dateMatch[1].split(' ');
                    // Format is "8 Jan 10:30" - first two parts are date, third is time
                    const datePart = dateParts.length >= 2 ? `${dateParts[0]} ${dateParts[1]}` : dateParts[0] || '';
                    const timePart = dateParts[2] || '';

                    // Match types
                    const isCreditPurchase = line.includes('Credit Purchase:');
                    const isLinked = line.includes('Linked from Sale'); // handle "From Sale to..." or similar
                    const isPayableAdded = line.includes('New Payable Added:') || line.includes('New Due Added:'); // Support legacy/alternate
                    const isPayment = line.includes('Paid:') || line.includes('Payment Made:');

                    // If it's a linked sale payable, treat as credit purchase
                    const isPurchase = isCreditPurchase || isLinked || isPayableAdded;

                    if (!isPurchase && !isPayment) continue;

                    let amountMatch;
                    if (isCreditPurchase) amountMatch = line.match(/Credit Purchase: ₹([\d,]+)/);
                    else if (isLinked) amountMatch = line.match(/: ₹([\d,]+)/); // Generic match for "Linked... : ₹X"
                    else if (isPayableAdded) amountMatch = line.match(/Added: ₹([\d,]+)/);
                    else amountMatch = line.match(/(?:Paid|Payment Made): ₹([\d,]+)/);

                    const balanceMatch = line.match(/Balance: ₹([\d,]+)/);

                    // Fallback for amount matching if regex failed but line looks valid? 
                    // Let's rely on strict matching for safety.

                    if (amountMatch && balanceMatch) {
                        let txnType: 'payable_added' | 'payment_made' | 'credit_purchase';
                        if (isCreditPurchase || isLinked) txnType = 'credit_purchase';
                        else if (isPayableAdded) txnType = 'payable_added';
                        else txnType = 'payment_made';

                        parsed.push({
                            date: datePart,
                            time: timePart,
                            type: txnType,
                            amount: parseFloat(amountMatch[1].replace(/,/g, '')),
                            balance: parseFloat(balanceMatch[1].replace(/,/g, '')),
                            note: isLinked ? line.split(']').pop()?.split(':')[0].trim() : undefined
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

    const handleAddPayable = async () => {
        if (!payableAmount || payables.length === 0) {
            toast("Please enter an amount", "warning");
            return;
        }

        const primaryPayable = payables[0];
        const newAmount = primaryPayable.amount + parseFloat(payableAmount);
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        let newNote = primaryPayable.note || "";
        if (newNote) newNote += "\n";
        newNote += `[${dateStr} ${timeStr}] New Payable Added: ₹${parseFloat(payableAmount).toLocaleString()}. Balance: ₹${newAmount.toLocaleString()}`;

        const updates: any = {
            amount: newAmount,
            note: newNote
        };

        // Update due date if provided
        if (dueDate) {
            updates.due_date = dueDate;
        }

        const { error } = await supabase
            .from('accounts_payable')
            .update(updates)
            .eq('id', primaryPayable.id);

        if (error) {
            toast("Failed to add payable", "error");
        } else {
            toast(`Added ₹${parseFloat(payableAmount).toLocaleString()} to balance`, "success");
            setShowAddPayable(false);
            setPayableAmount("");
            setDueDate("");
            loadData();
        }
    };

    const handleMakePayment = async () => {
        if (!paymentAmount || payables.length === 0) {
            toast("Please enter an amount", "warning");
            return;
        }

        const primaryPayable = payables[0];
        const paid = parseFloat(paymentAmount);
        const newBalance = primaryPayable.amount - paid;
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        let newNote = primaryPayable.note || "";
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
            .eq('id', primaryPayable.id);

        if (error) {
            toast("Failed to record payment", "error");
        } else {
            toast(newBalance <= 0 ? "Fully paid!" : `Paid ₹${paid.toLocaleString()}`, "success");
            setShowMakePayment(false);
            setPaymentAmount("");

            // Notify insights to refresh (auto-complete payable task)
            notifyPayablePaid();

            loadData();
        }
    };

    const handleEditTransaction = async (viewIndex: number, newAmount: number) => {
        if (payables.length === 0 || isNaN(newAmount)) return;

        // Sort payables chronologically for global balance calculation
        const sortedPayables = [...payables].sort((a, b) =>
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );



        // We need to determine the total number of transactions to map viewIndex correctly
        // The viewIndex is relative to the "slice(-20)" of the transactions array state.
        // We need to simulate the exact same parsing to count.

        let totalTxnCount = 0;
        for (const p of sortedPayables) {
            const lines = (p.note || "").split('\n');
            for (const line of lines) {
                if (!line.trim().startsWith('[')) continue;
                // Simplified check - assumes similar regex validity as parser
                if (line.includes('Credit Purchase:') || line.includes('Linked from Sale') || line.includes('New Payable Added:') || line.includes('New Due Added:') || line.includes('Paid:') || line.includes('Payment Made:')) {
                    totalTxnCount++;
                }
            }
        }

        const offset = Math.max(0, totalTxnCount - 20);
        const targetRealIndex = offset + viewIndex;

        let currentRealIndex = 0;
        let globalBalance = 0;
        const updates: any[] = [];

        for (const payable of sortedPayables) {
            let localBalance = 0;
            const noteLines = (payable.note || "").split('\n');
            const newNoteLines = [...noteLines];
            let payableModified = false;

            noteLines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed.startsWith('[')) return;

                const dateMatch = line.match(/\[(.*?)\]/);
                if (!dateMatch) return;

                const isCredit = line.includes('Credit Purchase:') || line.includes('Linked from Sale') || line.includes('New Payable Added:') || line.includes('New Due Added:');
                const isPayment = line.includes('Paid:') || line.includes('Payment Made:');

                if (!isCredit && !isPayment) return;

                // Extract Amount
                let amount = 0;
                let amountMatch;
                if (isCredit) amountMatch = line.match(/purchase: ₹([\d,]+)/i) || line.match(/added: ₹([\d,]+)/i) || line.match(/: ₹([\d,]+)/);
                else amountMatch = line.match(/(?:Paid|Payment Made): ₹([\d,]+)/i);

                if (amountMatch) {
                    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                }

                // Check if this is the target transaction to edit
                if (currentRealIndex === targetRealIndex) {
                    amount = newAmount;
                    payableModified = true;
                }

                // Update Balances
                if (isCredit) {
                    localBalance += amount;
                    globalBalance += amount;
                } else {
                    localBalance -= amount;
                    globalBalance -= amount;
                }

                // Reconstruct Line
                let typeStr = isCredit ? 'Credit Purchase' : 'Payment Made';
                // Preserve "New Payable Added" if it was that specific type to avoid changing wording unnecessarily, 
                // but standardize for simplicity if needed. Let's try to infer or standardize.
                if (line.includes('New Payable Added')) typeStr = 'New Payable Added';
                if (line.includes('Paid:')) typeStr = 'Paid';

                const newLine = `[${dateMatch[1]}] ${typeStr}: ₹${amount.toLocaleString()}. Balance: ₹${Math.max(0, globalBalance).toLocaleString()}`;

                if (newLine !== line) {
                    newNoteLines[idx] = newLine;
                    payableModified = true;
                }

                currentRealIndex++;
            });

            // If this payable was part of the chain or modified, check if we need to update it
            // We ALWAYS update if the global balance text changed (which it will for all subsequent items)
            // Or if local amount changed.
            // Actually, we should check if 'payableModified' OR if we just want to ensure consistency.
            // If we edited an earlier transaction, 'payableModified' will be true for ALL subsequent transactions due to globalBalance change.
            if (payableModified) {
                updates.push({
                    id: payable.id,
                    amount: Math.max(0, localBalance),
                    note: newNoteLines.join('\n'),
                    status: Math.max(0, localBalance) <= 0 ? 'paid' : 'pending'
                });
            }
        }

        if (updates.length > 0) {
            const { error } = await supabase.from('accounts_payable').upsert(updates);
            if (error) {
                console.error(error);
                toast("Failed to update transactions", "error");
            } else {
                toast("Transaction updated", "success");
                setEditingIndex(null);
                loadData();
            }
        }
    };

    const handleDeleteTransaction = (viewIndex: number) => {
        if (payables.length === 0) return;

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
        if (payables.length === 0) return;

        const sortedPayables = [...payables].sort((a, b) =>
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );

        let totalTxnCount = 0;
        for (const p of sortedPayables) {
            const lines = (p.note || "").split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('[') && (line.includes('Credit Purchase:') || line.includes('Linked from Sale') || line.includes('New Payable Added:') || line.includes('New Due Added:') || line.includes('Paid:') || line.includes('Payment Made:'))) {
                    totalTxnCount++;
                }
            }
        }

        const offset = Math.max(0, totalTxnCount - 20);
        const targetRealIndex = offset + viewIndex;

        let currentRealIndex = 0;
        let globalBalance = 0;
        const updates: any[] = [];

        for (const payable of sortedPayables) {
            let localBalance = 0;
            const noteLines = (payable.note || "").split('\n');
            // We use filter for deletion, but we need to map first to identify indices
            const keptLines: string[] = [];
            let payableModified = false;

            noteLines.forEach((line) => {
                const trimmed = line.trim();
                let shouldKeep = true;

                if (trimmed.startsWith('[')) {
                    const isCredit = line.includes('Credit Purchase:') || line.includes('Linked from Sale') || line.includes('New Payable Added:') || line.includes('New Due Added:');
                    const isPayment = line.includes('Paid:') || line.includes('Payment Made:');

                    if (isCredit || isPayment) {
                        if (currentRealIndex === targetRealIndex) {
                            shouldKeep = false;
                            payableModified = true;
                        } else {
                            // Process valid line
                            const dateMatch = line.match(/\[(.*?)\]/);
                            let amount = 0;
                            let amountMatch;
                            if (isCredit) amountMatch = line.match(/purchase: ₹([\d,]+)/i) || line.match(/added: ₹([\d,]+)/i) || line.match(/: ₹([\d,]+)/);
                            else amountMatch = line.match(/(?:Paid|Payment Made): ₹([\d,]+)/i);

                            if (amountMatch) amount = parseFloat(amountMatch[1].replace(/,/g, ''));

                            // Update Balances
                            if (isCredit) {
                                localBalance += amount;
                                globalBalance += amount;
                            } else {
                                localBalance -= amount;
                                globalBalance -= amount;
                            }

                            if (dateMatch) {
                                let typeStr = isCredit ? 'Credit Purchase' : 'Payment Made';
                                if (line.includes('New Payable Added')) typeStr = 'New Payable Added';
                                if (line.includes('Paid:')) typeStr = 'Paid';

                                const newLine = `[${dateMatch[1]}] ${typeStr}: ₹${amount.toLocaleString()}. Balance: ₹${Math.max(0, globalBalance).toLocaleString()}`;

                                if (newLine !== line) {
                                    keptLines.push(newLine);
                                    payableModified = true;
                                } else {
                                    keptLines.push(line);
                                }
                            } else {
                                keptLines.push(line);
                            }
                        }
                        currentRealIndex++;
                    } else {
                        keptLines.push(line);
                    }
                } else {
                    keptLines.push(line);
                }

                if (!shouldKeep) {
                    // logic already handled (it wasn't pushed)
                }
            });

            if (payableModified) {
                updates.push({
                    id: payable.id,
                    amount: Math.max(0, localBalance),
                    note: keptLines.join('\n'),
                    status: Math.max(0, localBalance) <= 0 ? 'paid' : 'pending'
                });
            }
        }

        if (updates.length > 0) {
            let hasError = false;
            for (const update of updates) {
                const { error } = await supabase
                    .from('accounts_payable')
                    .update({
                        amount: update.amount,
                        note: update.note,
                        status: update.status
                    })
                    .eq('id', update.id);

                if (error) {
                    console.error('Update error:', error);
                    hasError = true;
                }
            }

            if (hasError) {
                toast("Failed to delete transaction", "error");
            } else {
                toast("Transaction deleted", "success");
                loadData();
            }
        }
    };

    const handleClearBalance = () => {
        if (payables.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: "Clear entire balance?",
            description: "This will mark the balance as zero and status as paid. This cannot be undone.",
            onConfirm: async () => {
                for (const payable of payables) {
                    const { error } = await supabase
                        .from('accounts_payable')
                        .update({ amount: 0, status: 'paid', note: payable.note ? payable.note + '\n[Cleared] Balance manually cleared.' : '[Cleared] Balance manually cleared.' })
                        .eq('id', payable.id);

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
        if (!supplierId || !newDueDate) return;

        const { error } = await supabase
            .from('accounts_payable')
            .update({ due_date: newDueDate })
            .eq('supplier_id', supplierId)
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

    if (!supplier || payables.length === 0) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
                <p className="text-foreground mb-4">No pending payables for this supplier</p>
                <Button onClick={() => navigate('/accounts-payable')}>Go Back</Button>
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
                                    <h1 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white">{supplier.name}</h1>
                                    <p className="text-xs text-zinc-500">Payable History</p>
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
                                        className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
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
                <div className="bg-gradient-to-br from-rose-500 to-rose-600 dark:from-rose-600 dark:to-rose-700 rounded-2xl p-4 md:p-5 mb-6 text-white shadow-xl">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-xs opacity-75 mb-1">Current Balance Due</p>
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
                        onClick={() => { setPayableAmount(""); setDueDate(""); setShowAddPayable(true); }}
                        className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-1"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Add Payable
                    </button>
                    <button
                        onClick={() => { setPaymentAmount(""); setShowMakePayment(true); }}
                        className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
                    >
                        <Wallet size={18} strokeWidth={2.5} />
                        Make Payment
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
                                            // Prevent default context menu on long press
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
                                                            txn.type === 'payment_made' ? "text-emerald-600 dark:text-emerald-400" :
                                                                txn.type === 'credit_purchase' ? "text-blue-600 dark:text-blue-400" :
                                                                    "text-orange-600 dark:text-orange-400"
                                                        )}>
                                                            {txn.type === 'payment_made' ? 'Payment Made' :
                                                                txn.type === 'credit_purchase' ? 'Credit Purchase' :
                                                                    'Payable Added'}
                                                        </span>
                                                        {!isSelectionMode && (
                                                            <div className="flex items-center gap-0">
                                                                {isEditable && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setEditingIndex(actualIndex); }}
                                                                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
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
                                                            txn.type === 'payment_made' ? "text-emerald-600 dark:text-emerald-400" :
                                                                txn.type === 'credit_purchase' ? "text-blue-600 dark:text-blue-400" :
                                                                    "text-orange-600 dark:text-orange-400"
                                                        )}>
                                                            {txn.type === 'payment_made' ? '-' : '+'}₹{txn.amount.toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">Balance: ₹{txn.balance.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-zinc-500 font-medium">{formatDateWithOrdinal(txn.date)}{txn.time ? ` • ${txn.time}` : ''}</p>
                                                {txn.note && <p className="text-xs text-blue-500 mt-1">{txn.note}</p>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Add Payable Modal */}
            <Modal isOpen={showAddPayable} onClose={() => setShowAddPayable(false)} title={<h2 className="text-lg font-bold">Add Payable</h2>}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                autoFocus
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-orange-500 rounded-xl px-4 h-12 text-lg font-bold outline-none transition-all"
                                placeholder="0"
                                value={payableAmount}
                                onChange={e => setPayableAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Due Date (Optional)</label>
                        <input
                            type="date"
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-orange-500 rounded-xl px-4 h-12 text-sm font-bold outline-none transition-all mt-1"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                        />
                        <p className="text-xs text-zinc-500 mt-1 ml-1">Leave empty to keep current due date</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setShowAddPayable(false)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleAddPayable} className="h-12 bg-orange-500 hover:bg-orange-600">
                            Add Payable
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Make Payment Modal */}
            <Modal isOpen={showMakePayment} onClose={() => setShowMakePayment(false)} title={<h2 className="text-lg font-bold">Make Payment</h2>}>
                <div className="space-y-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl text-center">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Balance</p>
                        <p className="text-2xl font-black text-zinc-900 dark:text-white">₹{totalBalance.toLocaleString()}</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Amount Paid</label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                autoFocus
                                className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 rounded-xl px-4 pr-20 h-14 text-xl font-bold outline-none transition-all"
                                placeholder="0"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                            />
                            <button
                                onClick={() => setPaymentAmount(totalBalance.toString())}
                                className="absolute right-2 top-2 bottom-2 px-3 bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-600 hover:bg-emerald-50 dark:hover:bg-zinc-600 transition-colors"
                            >
                                FULL
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="outline" onClick={() => setShowMakePayment(false)} className="h-12">
                            Cancel
                        </Button>
                        <Button onClick={handleMakePayment} className="h-12 bg-emerald-500 hover:bg-emerald-600">
                            Make Payment
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
                {editingIndex !== null && transactions[editingIndex] && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Correct Amount</label>
                            <div className="relative mt-1">
                                <input
                                    type="number"
                                    autoFocus
                                    key={editingIndex}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 focus:border-violet-500 rounded-xl px-4 h-14 text-xl font-bold outline-none transition-all"
                                    defaultValue={transactions[editingIndex >= transactions.length ? transactions.length - 1 : editingIndex].amount}
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
                        This will update the due date for all pending payables for this supplier.
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
