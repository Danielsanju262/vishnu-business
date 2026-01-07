import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, ChevronRight, Package, Search, Plus, Trash2, ShoppingCart, User, X, ArrowRight, Calendar, MoreVertical, Edit2, CheckCircle2, Circle, Truck } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";
import { useRealtimeTables } from "../hooks/useRealtimeSync";
import { Modal } from "../components/ui/Modal";
import { useDropdownClose } from "../hooks/useDropdownClose";

type Customer = { id: string; name: string };
type Product = { id: string; name: string; unit: string; category: string };
type CartItem = {
    product: Product;
    quantity: number;
    sellPrice: number;
    buyPrice: number;
};

import { ConfirmationModal } from "../components/ui/ConfirmationModal";

export default function NewSale() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState("");

    // Supplier Payment State (Linked Payable)
    const [isLinkedPayable, setIsLinkedPayable] = useState(false);
    const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
    const [payableSupplierSearch, setPayableSupplierSearch] = useState("");
    const [payableSelectedSupplierId, setPayableSelectedSupplierId] = useState<string>("");
    const [payableAmount, setPayableAmount] = useState("");
    const [payableDueDate, setPayableDueDate] = useState("");
    const [showPayableSupplierList, setShowPayableSupplierList] = useState(false);

    // Tranasction State
    const [selectedCust, setSelectedCust] = useState<Customer | null>(() => {
        const stored = localStorage.getItem('vishnu_new_sale_cust');
        return stored ? JSON.parse(stored) : null;
    });

    const [cart, setCart] = useState<CartItem[]>(() => {
        const stored = localStorage.getItem('vishnu_new_sale_cart');
        return stored ? JSON.parse(stored) : [];
    });

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    // Payment Confirm State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [addToOutstanding, setAddToOutstanding] = useState(false);
    const [paidNowAmount, setPaidNowAmount] = useState("");
    const [outstandingDueDate, setOutstandingDueDate] = useState("");

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

    // Workflow State -- Initialize based on restored data
    const [step, setStep] = useState<"customer" | "cart" | "product" | "details">(() => {
        const storedCart = localStorage.getItem('vishnu_new_sale_cart');
        const hasCartItems = storedCart && JSON.parse(storedCart).length > 0;

        // If there are items in the cart, go to cart
        if (hasCartItems) {
            return "cart";
        }
        return "customer";
    });

    // Auto-redirect if cart is empty for 30s
    useEffect(() => {
        let timeout: NodeJS.Timeout;

        if (step === 'cart' && cart.length === 0) {
            timeout = setTimeout(() => {
                // Clear customer and go back to start
                setSelectedCust(null);
                localStorage.removeItem('vishnu_new_sale_cust');
                setStep("customer");
                toast("Session timed out due to inactivity", "info");
            }, 30000); // 30 seconds
        }

        return () => clearTimeout(timeout);
    }, [step, cart, toast]);

    // Persistence Effects
    useEffect(() => {
        if (selectedCust) {
            localStorage.setItem('vishnu_new_sale_cust', JSON.stringify(selectedCust));
        } else {
            localStorage.removeItem('vishnu_new_sale_cust');
        }
    }, [selectedCust]);

    useEffect(() => {
        localStorage.setItem('vishnu_new_sale_cart', JSON.stringify(cart));
    }, [cart]);

    // Cart Management State
    const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Temporary Selection State
    const [tempProd, setTempProd] = useState<Product | null>(null);
    const [qty, setQty] = useState("");
    const [sellPrice, setSellPrice] = useState("");
    const [buyPrice, setBuyPrice] = useState("");

    // Inline Add State
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [newItemUnit, setNewItemUnit] = useState("kg");

    const fetchData = useCallback(async () => {
        const [custRes, prodRes, supRes] = await Promise.all([
            supabase.from("customers").select("*").eq('is_active', true).order("name"),
            supabase.from("products").select("*").eq('is_active', true).order("name"),
            supabase.from("suppliers").select("id, name").eq('is_active', true).order("name")
        ]);
        if (custRes.data) setCustomers(custRes.data);
        if (prodRes.data) setProducts(prodRes.data);
        if (supRes.data) setSuppliers(supRes.data);
    }, []);

    // Real-time sync for customers and products - auto-refreshes when data changes on any device
    useRealtimeTables(['customers', 'products', 'suppliers'], fetchData, []);

    const payableFilteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(payableSupplierSearch.toLowerCase())
    );

    // Fetch Last Price when Product Selected
    useEffect(() => {
        const fetchLastTransaction = async () => {
            if (!selectedCust || !tempProd || step !== "details" || editingIndex !== null) return;

            // 1. Check if already in cart (use that price) - ONLY if not editing
            // Logic: Find last occurrence in current cart
            const inCart = [...cart].reverse().find(i => i.product.id === tempProd.id);
            if (inCart) {
                setSellPrice(inCart.sellPrice.toString());
                setBuyPrice(inCart.buyPrice.toString());
                return;
            }

            // 2. Fetch from DB
            const { data } = await supabase.from('transactions')
                .select('sell_price, buy_price')
                .eq('customer_id', selectedCust.id)
                .eq('product_id', tempProd.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) {
                setSellPrice(data.sell_price.toString());
                setBuyPrice(data.buy_price.toString());
            }
        };

        fetchLastTransaction();
    }, [tempProd, step, editingIndex, selectedCust, cart]);

    // Long Press for Selection
    const timerRef = useRef<any>(null);
    const isLongPress = useRef(false);

    const handleTouchStart = (index: number) => {
        isLongPress.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            if (navigator.vibrate) navigator.vibrate(50);

            // We need to use functional updates or latest state refs if we want to be 100% safe,
            // but for this interaction, simple closure capture is usually acceptable as long as we force a re-render/update correctly.
            // Using a functional update pattern for the selection action would be cleaner if 'toggleSelection' wasn't dependent on closure state.
            // For now, simple execution is fine.

            // Note: We check if mode is already on to avoid unnecessary state updates, 
            // but we must be careful about closure staleness? 
            // Actually, we can just trigger the toggle. 
            // Check state inside the timeout? 
            // Since we're inside a function created at render, 'isSelectionMode' is const from that render.
            // This is effectively a "stale closure" hazard if 'isSelectionMode' changed quickly, but for a 500ms hold it's unlikely to race.

            setIsSelectionMode(true); // Force true on long press

            // Use functional update for indices to avoid stale closure issues regarding the Set
            setSelectedIndices(prev => {
                const newSet = new Set(prev);
                if (newSet.has(index)) newSet.delete(index);
                else newSet.add(index);
                return newSet;
            });
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    // Close menu when clicking outside or pressing ESC
    useDropdownClose(activeMenuIndex !== null, () => setActiveMenuIndex(null));

    // Close supplier list when clicking outside (separate handling)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (showPayableSupplierList) {
                const target = event.target as HTMLElement;
                if (!target.closest('.absolute.top-full')) {
                    setShowPayableSupplierList(false);
                }
            }
        };

        if (showPayableSupplierList) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showPayableSupplierList]);

    // --- Actions ---

    // ... (rest of actions are unchanged, but we are inserting before them to keep context or just at top of component body. 
    // Actually, let's insert this Effect near other Effects)


    const handleAddCustomer = async () => {
        if (!newItemName) return;
        const { data, error } = await supabase.from("customers").insert([{ name: newItemName, is_active: true }]).select().single();
        if (data && !error) {
            setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedCust(data);
            setStep("cart"); // Allow immediate proceed
            setNewItemName("");
            setIsAddingNew(false);
            toast("Customer added", "success");
        } else {
            toast("Failed to add customer", "error");
        }
    };

    const handleAddProduct = async () => {
        if (!newItemName) return;
        const { data, error } = await supabase.from("products").insert([{ name: newItemName, unit: newItemUnit, category: 'general', is_active: true }]).select().single();
        if (data && !error) {
            setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setTempProd(data);
            setStep("details"); // Go straight to details
            setNewItemName("");
            setIsAddingNew(false);
            toast("Product added", "success");
        } else {
            toast("Failed to add product", "error");
        }
    };

    const addToCart = () => {
        if (!tempProd || !qty || !sellPrice) {
            toast("Please enter quantity and price", "warning");
            return;
        }

        const newItem: CartItem = {
            product: tempProd,
            quantity: parseFloat(qty),
            sellPrice: parseFloat(sellPrice),
            buyPrice: buyPrice ? parseFloat(buyPrice) : 0
        };

        if (editingIndex !== null) {
            // Update existing item
            setCart(prev => {
                const newCart = [...prev];
                newCart[editingIndex] = newItem;
                return newCart;
            });
            toast("Item updated", "success");
        } else {
            // New Item: Remove if same product exists?? No, allow multiple entries of same product (e.g. different prices/quantities) 
            // BUT usually we want to merge or just append. Let's just append for flexibility.
            // Wait, previous logic was: `prev.filter(i => i.product.id !== tempProd.id)` which replaced it.
            // Let's keep the replacement logic for now to avoid duplicates if that is desired, OR if we want to allow duplicates, remove filter.
            // User request implies "edit", so unique items per list might be preferred? 
            // Actually, simply appending is safer for "editing" specific indices. 
            // If I add a new item that is the same product, I should probably just add it as a new row or update?
            // Reverting to APPEND behavior for new items, but standard replacement for edit.

            // To match previous logic (replace existing):
            // setCart(prev => [...prev.filter(i => i.product.id !== tempProd.id), newItem]);

            // But since we have specific EDIT functionality now, we should probably allow adding same item twice if needed (e.g. different prices) 
            // OR just filter. Let's stick to unique products for simplicity unless directed otherwise.
            const existsIndex = cart.findIndex(i => i.product.id === tempProd.id);
            if (existsIndex >= 0) {
                // If it exists, we treat it as an update to that line item to avoid duplicates
                setCart(prev => {
                    const newCart = [...prev];
                    newCart[existsIndex] = newItem;
                    return newCart;
                });
            } else {
                setCart(prev => [...prev, newItem]);
            }
            toast("Added to bill", "success");
        }

        // Reset
        setTempProd(null);
        setQty("");
        setSellPrice("");
        setBuyPrice("");
        setStep("cart");
        setEditingIndex(null);
    };

    const removeFromCart = (index: number) => {
        const item = cart[index];
        setConfirmConfig({
            isOpen: true,
            title: `Remove "${item.product.name}"?`,
            description: "Are you sure you want to remove this item from the cart?",
            onConfirm: () => {
                setCart(prev => prev.filter((_, i) => i !== index));
            },
            variant: "destructive",
            confirmText: "Remove"
        });
    };

    const editCartItem = (index: number) => {
        const item = cart[index];
        setTempProd(item.product);
        setQty(item.quantity.toString());
        setSellPrice(item.sellPrice.toString());
        setBuyPrice(item.buyPrice.toString());
        setEditingIndex(index);
        setActiveMenuIndex(null);
        setStep("details");
    };

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIndices(new Set());
    };

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedIndices(newSet);
        if (newSet.size === 0) setIsSelectionMode(false);
    };

    const deleteSelected = () => {
        if (selectedIndices.size === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIndices.size} items?`,
            description: "These items will be removed from the cart.",
            onConfirm: () => {
                setCart(prev => prev.filter((_, i) => !selectedIndices.has(i)));
                setIsSelectionMode(false);
                setSelectedIndices(new Set());
                toast("Items deleted", "success");
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    const finalizeSale = async () => {
        if (!selectedCust || cart.length === 0) return;

        // 0. Validate Payable Amount if Linked
        if (isLinkedPayable) {
            if (!payableSelectedSupplierId) {
                toast("Please select a supplier for the linked payment", "warning");
                return;
            }
            if (!payableAmount || parseFloat(payableAmount) <= 0) {
                toast("Please enter a valid amount for the linked payment", "warning");
                return;
            }
        }

        // 1. Save Transaction (ALWAYS full value)
        const transactions = cart.map(item => ({
            customer_id: selectedCust.id,
            product_id: item.product.id,
            quantity: item.quantity,
            sell_price: item.sellPrice,
            buy_price: item.buyPrice,
            date: date
        }));

        const { error } = await supabase.from("transactions").insert(transactions);

        if (error) {
            toast("Failed to save sale", "error");
            return;
        }

        // 1.5 Handle Linked Payable
        if (isLinkedPayable && payableSelectedSupplierId && payableAmount) {
            // Check for existing pending payable
            const { data: existingPayable } = await supabase
                .from('accounts_payable')
                .select('*')
                .eq('supplier_id', payableSelectedSupplierId)
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            const pAmount = parseFloat(payableAmount);
            const today = new Date();
            const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            if (existingPayable) {
                // Update existing
                const newAmount = existingPayable.amount + pAmount;
                let newNote = existingPayable.note || "";
                if (newNote) newNote += "\n";
                newNote += `[${dateStr} ${timeStr}] Credit Purchase: ₹${pAmount.toLocaleString()}. Balance: ₹${newAmount.toLocaleString()} (Sale to ${selectedCust.name})`;

                const updates: any = {
                    amount: newAmount,
                    note: newNote
                };

                // Update due date if provided and earlier
                if (payableDueDate) {
                    const newDue = new Date(payableDueDate);
                    const existingDue = new Date(existingPayable.due_date);
                    if (newDue < existingDue) {
                        updates.due_date = payableDueDate;
                    }
                }

                const { error: updateError } = await supabase
                    .from('accounts_payable')
                    .update(updates)
                    .eq('id', existingPayable.id);

                if (updateError) {
                    console.error("Failed to update payable", updateError);
                    toast("Sale saved, but failed to update supplier payment.", "warning");
                }
            } else {
                // Insert new
                const { error: payableError } = await supabase
                    .from('accounts_payable')
                    .insert({
                        supplier_id: payableSelectedSupplierId,
                        amount: pAmount,
                        // Validate/Format Date for Note
                        due_date: payableDueDate || new Date().toISOString().split('T')[0],
                        note: `[${dateStr} ${timeStr}] Credit Purchase: ₹${pAmount.toLocaleString()}. Balance: ₹${pAmount.toLocaleString()} (Sale to ${selectedCust.name})`,
                        status: 'pending',
                        recorded_at: new Date().toISOString()
                    });

                if (payableError) {
                    console.error("Failed to create linked payable", payableError);
                    toast("Sale saved, but failed to link supplier payment.", "warning");
                }
            }


        }

        // 2. Handle Outstanding (Credit)
        if (addToOutstanding) {
            const totalAmount = cart.reduce((acc, item) => acc + (item.quantity * item.sellPrice), 0);
            const paid = parseFloat(paidNowAmount) || 0;
            const remaining = totalAmount - paid;

            if (remaining > 0) {
                const today = new Date();
                const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                const timeStr = today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

                // Check if a pending reminder already exists for this customer
                const { data: existingReminder } = await supabase
                    .from('payment_reminders')
                    .select('*')
                    .eq('customer_id', selectedCust.id)
                    .eq('status', 'pending')
                    .order('due_date', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (existingReminder) {
                    // Update existing reminder
                    const newAmount = existingReminder.amount + remaining;
                    let newNote = existingReminder.note || "";
                    if (newNote) newNote += "\n";
                    newNote += `[${dateStr} ${timeStr}] Credit Sale: ₹${remaining.toLocaleString()}. Balance: ₹${newAmount.toLocaleString()}`;

                    const updates: any = {
                        amount: newAmount,
                        note: newNote
                    };

                    // Update due date if provided and earlier than existing
                    if (outstandingDueDate) {
                        const newDue = new Date(outstandingDueDate);
                        const existingDue = new Date(existingReminder.due_date);
                        if (newDue < existingDue) {
                            updates.due_date = outstandingDueDate;
                        }
                    }

                    const { error: updateError } = await supabase
                        .from('payment_reminders')
                        .update(updates)
                        .eq('id', existingReminder.id);

                    if (updateError) {
                        console.error("Failed to update reminder", updateError);
                        toast("Sale saved, but failed to update reminder.", "warning");
                    }
                } else {
                    // Create new reminder with proper note format
                    const noteStr = `[${dateStr} ${timeStr}] Credit Sale: ₹${remaining.toLocaleString()}. Balance: ₹${remaining.toLocaleString()}`;

                    const { error: reminderError } = await supabase.from('payment_reminders').insert({
                        customer_id: selectedCust.id,
                        amount: remaining,
                        due_date: outstandingDueDate || new Date().toISOString().split('T')[0],
                        status: 'pending',
                        note: noteStr
                    });

                    if (reminderError) {
                        console.error("Failed to create reminder", reminderError);
                        toast("Sale saved, but failed to set reminder.", "warning");
                    }
                }
            }
        }

        // 3. Success & Reset
        // Clear stored state on success
        localStorage.removeItem('vishnu_new_sale_cust');
        localStorage.removeItem('vishnu_new_sale_cart');
        setCart([]);
        setSelectedCust(null);
        setIsPaymentModalOpen(false); // Close modal
        setAddToOutstanding(false);

        // Reset Linked Payable state
        setIsLinkedPayable(false);
        setPayableSupplierSearch("");
        setPayableSelectedSupplierId("");
        setPayableAmount("");
        setPayableDueDate("");

        toast("Sale saved successfully!", "success");
        navigate("/");
    };

    // --- Render ---

    return (
        <div className="w-full md:max-w-lg md:mx-auto min-h-screen bg-background flex flex-col animate-in fade-in pb-8">
            {/* Glassmorphism Header */}
            <div className="fixed top-0 left-0 right-0 md:mx-auto w-full md:max-w-lg z-50 bg-white dark:bg-gray-900 border-b border-border shadow-sm px-3 py-3 md:px-4 flex items-center justify-between transition-all mb-4">
                <button
                    onClick={() => {
                        if (step === "details") { setStep("product"); return; }
                        if (step === "product") { setStep("cart"); return; }
                        if (step === "cart") { setStep("customer"); return; }
                        navigate("/");
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (step === "details") { setStep("product"); return; }
                            if (step === "product") { setStep("cart"); return; }
                            if (step === "cart") { setStep("customer"); return; }
                            navigate("/");
                        }
                    }}
                    tabIndex={0}
                    className="p-3 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                    aria-label="Go back"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="font-black text-foreground text-base md:text-lg tracking-tight">
                    {step === "customer" && "Select Customer"}
                    {step === "cart" && "New Sale"}
                    {step === "product" && "Add Item"}
                    {step === "details" && "Item Details"}
                </div>
                <div className="w-10" /> {/* Spacer */}
            </div>

            <div className="p-3 pt-20 md:p-4 md:pt-20 flex-1 flex flex-col">
                {/* STEP 1: CUSTOMER */}
                {step === "customer" && (
                    <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-3.5 text-muted-foreground" size={20} />
                            <input
                                className="w-full bg-accent/30 border border-border/30 pl-10 pr-3 py-3 md:py-2.5 rounded-xl focus:ring-2 focus:ring-primary focus:bg-background outline-none text-base text-foreground transition-all h-12 md:h-auto"
                                placeholder="Search customer..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {isAddingNew ? (
                            <div className="bg-primary/5 p-5 rounded-3xl border border-primary/20 mb-4 animate-in zoom-in-95">
                                <h3 className="font-bold text-sm text-foreground mb-4 flex items-center gap-2">
                                    <User size={16} className="text-primary" />
                                    Add New Customer
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 bg-background border border-border/50 rounded-xl px-4 py-3.5 md:py-3 outline-none focus:border-primary font-medium h-14 md:h-auto"
                                        placeholder="Enter Name"
                                        value={newItemName}
                                        onChange={e => setNewItemName(e.target.value)}
                                        autoFocus
                                    />
                                    <Button size="sm" onClick={handleAddCustomer} className="bg-primary text-primary-foreground shadow-lg shadow-primary/25 rounded-xl font-bold px-6">Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setIsAddingNew(false)} className="rounded-xl px-3 hover:bg-destructive/10 hover:text-destructive"><X size={20} /></Button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setIsAddingNew(true); setNewItemName(search); }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setIsAddingNew(true);
                                        setNewItemName(search);
                                    }
                                }}
                                tabIndex={0}
                                className="w-full p-4 mb-4 border-2 border-dashed border-border/60 rounded-2xl flex items-center justify-center text-primary font-bold hover:bg-primary/5 hover:border-primary/30 transition interactive text-sm group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                            >
                                <div className="p-1 bg-primary/10 rounded-full mr-3 group-hover:bg-primary group-hover:text-white transition-colors">
                                    <Plus size={16} />
                                </div>
                                Add "{search || "New Customer"}"
                            </button>
                        )}

                        <div className="flex-1 space-y-2.5">
                            {customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { setSelectedCust(c); setSearch(""); setStep("cart"); }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedCust(c);
                                            setSearch("");
                                            setStep("cart");
                                        }
                                    }}
                                    tabIndex={0}
                                    className="w-full bg-card p-3 rounded-xl border border-border/30 flex items-center justify-between shadow-sm hover:shadow-md hover:border-primary/30 hover:bg-accent/30 transition-all interactive group text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                    aria-label={`Select ${c.name}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                            {c.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="font-bold text-foreground text-base block">{c.name}</span>
                                            <span className="text-xs text-muted-foreground font-medium">Customer</span>
                                        </div>
                                    </div>
                                    <div className="p-2 bg-accent rounded-full text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <ChevronRight size={16} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 2: CART */}
                {step === "cart" && selectedCust && (
                    <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
                        {/* Customer Card */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 text-white p-4 md:p-5 rounded-3xl mb-5 md:mb-6 shadow-xl shadow-slate-900/10 flex justify-between items-center relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-6 md:p-8 opacity-5">
                                <User size={100} className="md:w-[120px] md:h-[120px]" />
                            </div>
                            <div className="relative z-10">
                                <p className="text-[10px] md:text-xs text-slate-300 uppercase font-bold tracking-wider mb-0.5 md:mb-1">Billing To</p>
                                <p className="text-lg md:text-xl font-black">{selectedCust.name}</p>
                            </div>
                            <button
                                onClick={() => setStep("customer")}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setStep("customer");
                                    }
                                }}
                                tabIndex={0}
                                className="relative z-10 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] md:text-xs font-bold backdrop-blur-md transition border border-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1"
                                aria-label="Change customer"
                            >
                                Change
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="font-bold text-foreground flex items-center gap-2">
                                    <ShoppingCart size={18} className="text-primary" />
                                    Cart Items <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{cart.length}</span>
                                </h3>
                            </div>

                            {/* Bulk Selection Header */}
                            {isSelectionMode && (
                                <div className="flex justify-between items-center gap-3 mb-3 bg-card px-3 py-2 rounded-xl border border-primary/20 shadow-lg animate-in fade-in sticky top-2 z-20">
                                    <div className="flex items-center gap-3">
                                        <Button size="icon" variant="ghost" onClick={toggleSelectionMode} className="h-10 w-10 focus-visible:ring-2 focus-visible:ring-primary">
                                            <X size={18} />
                                        </Button>
                                        <span className="font-bold text-foreground">{selectedIndices.size} Selected</span>
                                    </div>
                                    <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIndices.size === 0} className="h-10 text-xs px-3 focus-visible:ring-2 focus-visible:ring-white">
                                        <Trash2 size={14} className="mr-1.5" /> Delete
                                    </Button>
                                </div>
                            )}

                            {cart.length === 0 ? (
                                <button
                                    onClick={() => { setStep("product"); setSearch(""); }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setStep("product");
                                            setSearch("");
                                        }
                                    }}
                                    tabIndex={0}
                                    className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground bg-accent/30 rounded-3xl border-2 border-dashed border-border/60 mb-4 hover:bg-accent/50 hover:border-primary/50 transition-all cursor-pointer w-full group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[300px]"
                                    aria-label="Add first item to cart"
                                >
                                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50 group-hover:bg-primary/20 group-hover:text-primary transition-all group-hover:scale-110 duration-300">
                                        <Plus size={32} />
                                    </div>
                                    <p className="font-bold text-xl mb-1 text-foreground">Start Adding Items</p>
                                    <p className="text-sm opacity-70">Tap anywhere to add products</p>
                                </button>
                            ) : (
                                <div className="space-y-3 relative z-0">
                                    {cart.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                "bg-card p-3 rounded-xl border transition-all relative group touch-manipulation select-none",
                                                isSelectionMode && selectedIndices.has(idx) ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/60 hover:shadow-md",
                                                activeMenuIndex === idx ? "z-30" : "z-0"
                                            )}
                                        >
                                            <div className="flex justify-between items-center">
                                                {/* Left Side: Selection or Content */}
                                                <div
                                                    className="flex-1 flex items-center gap-4 cursor-pointer"
                                                    onContextMenu={(e) => e.preventDefault()}
                                                    onTouchStart={() => handleTouchStart(idx)}
                                                    onTouchEnd={handleTouchEnd}
                                                    onMouseDown={() => handleTouchStart(idx)}
                                                    onMouseUp={handleTouchEnd}
                                                    onMouseLeave={handleTouchEnd}
                                                    onClick={() => {
                                                        if (isLongPress.current) return;
                                                        if (isSelectionMode) toggleSelection(idx);
                                                        else editCartItem(idx);
                                                    }}
                                                >
                                                    {isSelectionMode ? (
                                                        <div className="flex items-center justify-center w-10 h-10 mr-1">
                                                            {selectedIndices.has(idx) ? (
                                                                <CheckCircle2 className="text-primary fill-primary/20" size={24} strokeWidth={2.5} />
                                                            ) : (
                                                                <Circle className="text-muted-foreground" size={24} strokeWidth={2} />
                                                            )}
                                                        </div>
                                                    ) : null}

                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0",
                                                        isSelectionMode ? "scale-90" : ""
                                                    )}>
                                                        {item.quantity}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-foreground text-sm">{item.product.name}</p>
                                                        <p className="text-xs text-muted-foreground font-medium">{item.product.unit} x ₹{item.sellPrice}</p>
                                                    </div>
                                                </div>

                                                {/* Right Side: Options */}
                                                <div className="flex items-center gap-4 pl-4">
                                                    <p className="font-black text-foreground text-base md:text-lg whitespace-nowrap">₹{(item.quantity * item.sellPrice).toLocaleString()}</p>

                                                    {!isSelectionMode && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setActiveMenuIndex(activeMenuIndex === idx ? null : idx); }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" || e.key === " ") {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setActiveMenuIndex(activeMenuIndex === idx ? null : idx);
                                                                    }
                                                                }}
                                                                tabIndex={0}
                                                                className="menu-trigger p-2.5 text-muted-foreground hover:bg-accent rounded-xl transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                                                aria-label="More options"
                                                            >
                                                                <MoreVertical size={18} />
                                                            </button>

                                                            {activeMenuIndex === idx && (
                                                                <div
                                                                    className="menu-content absolute right-0 top-full mt-2 w-48 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-white/10"
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    onTouchStart={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="flex flex-col p-1.5 gap-0.5">
                                                                        <button
                                                                            onClick={() => editCartItem(idx)}
                                                                            className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-white/10 rounded-lg text-left transition-colors"
                                                                        >
                                                                            <Edit2 size={16} className="text-blue-400" /> Edit Item
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { setActiveMenuIndex(null); removeFromCart(idx); }}
                                                                            className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 rounded-lg text-left transition-colors"
                                                                        >
                                                                            <Trash2 size={16} /> Delete
                                                                        </button>
                                                                        <div className="h-px bg-white/10 my-1 mx-2" />
                                                                        <button
                                                                            onClick={() => {
                                                                                setActiveMenuIndex(null);
                                                                                setIsSelectionMode(true);
                                                                                toggleSelection(idx);
                                                                            }}
                                                                            className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/10 rounded-lg text-left transition-colors"
                                                                        >
                                                                            <CheckCircle2 size={16} /> Select Multiple
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => { setStep("product"); setSearch(""); }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setStep("product");
                                        setSearch("");
                                    }
                                }}
                                tabIndex={0}
                                className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary font-bold flex items-center justify-center hover:bg-primary/5 transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                aria-label="Add another item"
                            >
                                <div className="p-1 bg-primary/20 rounded-full mr-2">
                                    <Plus size={16} />
                                </div>
                                Add Item
                            </button>
                        </div>

                        {/* --- NEW SECTION: Supplier Payment (Payable) --- */}
                        <div className="mt-4 bg-card border border-border rounded-xl p-4 shadow-sm">
                            <button
                                onClick={() => setIsLinkedPayable(!isLinkedPayable)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setIsLinkedPayable(!isLinkedPayable);
                                    }
                                }}
                                tabIndex={0}
                                className="flex justify-between items-center mb-2 cursor-pointer w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-lg p-1 -m-1"
                                aria-label={`${isLinkedPayable ? 'Disable' : 'Enable'} linked supplier payment`}
                            >
                                <div>
                                    <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                                        <Truck size={16} className="text-indigo-500" />
                                        Linked Supplier Payment?
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground leading-tight">Record money owed to supplier for these items</p>
                                </div>
                                <div className={cn(
                                    "w-10 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out relative",
                                    isLinkedPayable ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-700"
                                )}>
                                    <div className={cn(
                                        "w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out",
                                        isLinkedPayable ? "translate-x-4" : "translate-x-0"
                                    )} />
                                </div>
                            </button>

                            {isLinkedPayable && (
                                <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 border-t border-border pt-4">
                                    {/* Supplier Search */}
                                    <div className="space-y-1.5 relative">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Supplier</label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search supplier..."
                                                className="w-full bg-accent/50 border border-border/50 rounded-xl pl-9 pr-4 h-12 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-background transition-all"
                                                value={payableSupplierSearch}
                                                onChange={e => {
                                                    setPayableSupplierSearch(e.target.value);
                                                    setShowPayableSupplierList(true);
                                                }}
                                                onFocus={() => setShowPayableSupplierList(true)}
                                            />
                                        </div>
                                        {showPayableSupplierList && (payableSupplierSearch.trim() !== "") && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto border border-border bg-white dark:bg-zinc-950 rounded-xl shadow-lg divide-y divide-border/30">
                                                {payableFilteredSuppliers.length > 0 ? (
                                                    payableFilteredSuppliers.map(s => (
                                                        <button
                                                            key={s.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // prevent closing
                                                                setPayableSelectedSupplierId(s.id);
                                                                setPayableSupplierSearch(s.name);
                                                                setShowPayableSupplierList(false);
                                                            }}
                                                            className={cn(
                                                                "w-full text-left px-4 py-3 text-xs font-bold transition-colors hover:bg-accent",
                                                                payableSelectedSupplierId === s.id ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "text-foreground"
                                                            )}
                                                        >
                                                            {s.name}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-3 text-center">
                                                        <p className="text-[10px] text-muted-foreground mb-1">No supplier found</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Amount to Pay</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full bg-accent/50 border border-border/50 rounded-xl pl-6 pr-3 h-12 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-background transition-all"
                                                    placeholder="0"
                                                    value={payableAmount}
                                                    onChange={e => setPayableAmount(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Due Date</label>
                                            <input
                                                type="date"
                                                className="w-full bg-accent/50 border border-border/50 rounded-xl px-3 h-12 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-background transition-all"
                                                value={payableDueDate}
                                                onChange={e => setPayableDueDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Summary Footer */}
                        <div className="mt-6 bg-card border border-border rounded-3xl shadow-lg p-5 space-y-5 animate-in slide-in-from-bottom-6">
                            <div className="flex justify-between items-end gap-8">
                                <div className="flex-1">
                                    <p className="text-sm text-muted-foreground font-medium mb-1">Total Amount</p>
                                    <h2 className="text-3xl font-black text-foreground tracking-tight">₹ {cart.reduce((acc, item) => acc + (item.quantity * item.sellPrice), 0).toLocaleString()}</h2>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center justify-end gap-1.5 mb-1.5 px-1">
                                        <Calendar size={12} /> Date
                                    </label>
                                    <input
                                        type="date"
                                        className="bg-accent/50 border border-border rounded-xl py-3 md:py-2.5 px-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all text-right min-w-[140px] shadow-sm appearance-none h-14 md:h-auto"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Button
                                disabled={cart.length === 0}
                                onClick={() => setIsPaymentModalOpen(true)}
                                className={cn(
                                    "w-full h-14 text-lg font-bold rounded-2xl shadow-xl transition-all transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2",
                                    cart.length > 0
                                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/25"
                                        : "bg-muted text-muted-foreground shadow-none"
                                )}
                            >
                                Confirm Sale <ArrowRight className="ml-2" size={20} />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Payment Options Modal */}
                <Modal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    title={<h2 className="text-xl font-black">Confirm Payment</h2>}
                >
                    {(() => {
                        const totalAmount = cart.reduce((acc, item) => acc + (item.quantity * item.sellPrice), 0);
                        const paid = parseFloat(paidNowAmount) || 0;
                        const remaining = Math.max(0, totalAmount - paid);

                        return (
                            <div className="space-y-6">
                                {/* Total Bill Display */}
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl text-center border-2 border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider mb-1">Total Bill Amount</p>
                                    <p className="text-3xl font-black text-zinc-900 dark:text-white">₹{totalAmount.toLocaleString()}</p>
                                </div>

                                {/* Toggle Credit */}
                                <button
                                    onClick={() => setAddToOutstanding(!addToOutstanding)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setAddToOutstanding(!addToOutstanding);
                                        }
                                    }}
                                    tabIndex={0}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                                        addToOutstanding
                                            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/10"
                                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                                    )}
                                    aria-label={`${addToOutstanding ? 'Disable' : 'Enable'} credit sale`}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm">Add to Outstanding?</span>
                                        <span className="text-xs text-muted-foreground">Is this a credit/partial payment?</span>
                                    </div>
                                    <div className={cn(
                                        "w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative",
                                        addToOutstanding ? "bg-amber-500" : "bg-zinc-200 dark:bg-zinc-700"
                                    )}>
                                        <div className={cn(
                                            "w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out",
                                            addToOutstanding ? "translate-x-5" : "translate-x-0"
                                        )} />
                                    </div>
                                </button>

                                {/* Credit Details */}
                                {addToOutstanding && (
                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground ml-1 uppercase tracking-wider">Paid Now</label>
                                            <div className="relative mt-1">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    autoFocus
                                                    className="w-full bg-background border-2 border-zinc-200 dark:border-zinc-700 focus:border-amber-500 dark:focus:border-amber-500 rounded-xl pl-9 pr-4 h-14 text-xl font-bold outline-none transition-all placeholder:text-muted-foreground/30"
                                                    placeholder="0"
                                                    value={paidNowAmount}
                                                    onChange={e => setPaidNowAmount(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-sm font-bold text-foreground">Balance Due</span>
                                            <span className="text-xl font-black text-amber-600 dark:text-amber-500">₹{remaining.toLocaleString()}</span>
                                        </div>

                                        {remaining > 0 && (
                                            <div>
                                                <label className="text-xs font-bold text-muted-foreground ml-1 uppercase tracking-wider">Due Date (Optional)</label>
                                                <input
                                                    type="date"
                                                    className="w-full mt-1 bg-background border-2 border-zinc-200 dark:border-zinc-700 focus:border-amber-500 dark:focus:border-amber-500 rounded-xl px-4 h-14 md:h-12 text-sm font-bold outline-none transition-all cursor-pointer"
                                                    value={outstandingDueDate}
                                                    onChange={e => setOutstandingDueDate(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <Button
                                        onClick={finalizeSale}
                                        disabled={addToOutstanding && paidNowAmount === ""}
                                        className={cn(
                                            "w-full h-12 text-lg font-bold shadow-lg",
                                            addToOutstanding
                                                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25"
                                                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25"
                                        )}
                                    >
                                        {addToOutstanding ? "Save Credit Sale" : "Mark Full Paid & Save"}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </Modal>
                {
                    step === "product" && (
                        <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
                            <div className="relative mb-6">
                                <Search className="absolute left-4 top-3.5 text-muted-foreground" size={20} />
                                <input
                                    className="w-full bg-accent/50 border border-border/50 pl-12 pr-4 py-3.5 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-background outline-none text-lg text-foreground transition-all shadow-sm"
                                    placeholder="Search product..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {isAddingNew ? (
                                <div className="bg-primary/5 p-5 rounded-3xl border border-primary/20 mb-6 animate-in zoom-in-95">
                                    <h3 className="font-bold text-sm text-foreground mb-4 flex items-center gap-2">
                                        <Package size={16} className="text-primary" />
                                        Add New Product
                                    </h3>
                                    <div className="space-y-4">
                                        <input
                                            className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 outline-none focus:border-primary font-medium"
                                            placeholder="Product Name"
                                            value={newItemName}
                                            onChange={e => setNewItemName(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="flex gap-3">
                                            <div className="relative w-1/3">
                                                <select
                                                    className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 appearance-none outline-none focus:border-primary font-bold text-sm"
                                                    value={newItemUnit}
                                                    onChange={e => setNewItemUnit(e.target.value)}
                                                >
                                                    <option value="kg">kg</option>
                                                    <option value="ltr">ltr</option>
                                                    <option value="pcs">pcs</option>
                                                    <option value="box">box</option>
                                                    <option value="pkt">pkt</option>
                                                </select>
                                                <div className="absolute right-3 top-3.5 pointer-events-none opacity-50"><ChevronRight size={14} className="rotate-90" /></div>
                                            </div>
                                            <Button size="sm" onClick={handleAddProduct} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 rounded-xl font-bold">Save Product</Button>
                                        </div>
                                        <button onClick={() => setIsAddingNew(false)} className="mx-auto block text-xs font-bold text-muted-foreground hover:text-destructive transition mt-2">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => { setIsAddingNew(true); setNewItemName(search); }} className="w-full p-4 mb-4 border-2 border-dashed border-border/60 rounded-2xl flex items-center justify-center text-primary font-bold hover:bg-primary/5 hover:border-primary/30 transition interactive text-sm group">
                                    <div className="p-1 bg-primary/10 rounded-full mr-3 group-hover:bg-primary group-hover:text-white transition-colors">
                                        <Plus size={16} />
                                    </div>
                                    Add "{search || "New Product"}"
                                </button>
                            )}

                            <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-4">
                                {products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setTempProd(p); setStep("details"); }}
                                        className="bg-card p-5 rounded-3xl border border-border/60 text-left hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg transition-all shadow-sm h-40 flex flex-col justify-between interactive group relative overflow-hidden"
                                    >
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110",
                                            p.category === 'ghee' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-primary/10 text-primary"
                                        )}>
                                            <Package size={24} />
                                        </div>
                                        <div className="relative z-10">
                                            <p className="font-bold text-foreground leading-tight line-clamp-2 text-lg">{p.name}</p>
                                            <span className="inline-block mt-2 px-2 py-0.5 bg-muted rounded-md text-[10px] font-bold uppercase tracking-wide text-muted-foreground group-hover:bg-background transition-colors">{p.unit}</span>
                                        </div>
                                        {/* Decorative gradient blob */}
                                        <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl group-hover:from-primary/20 transition-all opacity-0 group-hover:opacity-100" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                }

                {/* STEP 4: ITEM DETAILS */}
                {
                    step === "details" && tempProd && (
                        <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300 items-center justify-center -mt-10">
                            <div className="w-full max-w-sm">
                                <div className="text-center mb-8">
                                    <div className="inline-flex p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary mb-4 shadow-inner ring-1 ring-primary/20">
                                        <Package size={48} />
                                    </div>
                                    <h2 className="text-2xl font-black text-foreground mb-1">{tempProd.name}</h2>
                                    <p className="text-muted-foreground font-medium">Enter details below</p>
                                </div>

                                <div className="bg-card p-6 rounded-[2rem] border border-border shadow-xl shadow-black/5 space-y-6">
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block ml-1">Quantity ({tempProd.unit})</label>
                                        <input
                                            type="number"
                                            className="w-full bg-accent/50 border border-border/50 rounded-2xl py-4 px-6 text-3xl font-black text-center text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                            placeholder="0"
                                            value={qty}
                                            onChange={e => setQty(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block ml-1">Selling Rate</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full bg-accent/50 border border-border/50 rounded-2xl py-3.5 pl-10 pr-4 text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                                    placeholder="0"
                                                    value={sellPrice}
                                                    onChange={e => setSellPrice(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className={tempProd.category === 'ghee' ? "opacity-50 pointer-events-none" : ""}>
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block ml-1">{tempProd.category === 'ghee' ? "Auto Calc" : "Buying Rate"}</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full bg-accent/50 border border-border/50 rounded-2xl py-3.5 pl-10 pr-4 text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                                    placeholder="0"
                                                    value={buyPrice}
                                                    onChange={e => setBuyPrice(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Button onClick={addToCart} className="w-full h-16 text-lg bg-primary hover:bg-primary/90 text-primary-foreground mt-4 shadow-xl shadow-primary/20 font-bold rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                                        <span className="mr-2">Add to Bill</span>
                                        <span className="bg-white/20 px-2 py-1 rounded-lg text-sm font-normal backdrop-blur-sm">₹ {(parseFloat(qty || "0") * parseFloat(sellPrice || "0")).toLocaleString()}</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={closeConfirm}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                description={confirmConfig.description}
                variant={confirmConfig.variant}
                confirmText={confirmConfig.confirmText}
            />
        </div >
    );
}
