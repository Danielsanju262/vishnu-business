import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ArrowLeft, Check, Fuel, Utensils, Wrench, Sparkles, Plus, Trash2, Edit2, Settings2, X, CheckCircle2, Circle, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";

import { useClickOutside } from "../hooks/useClickOutside";
import { useRealtimeTable } from "../hooks/useRealtimeSync";

type Preset = {
    id: string;
    label: string;
};

export default function NewExpense() {
    const navigate = useNavigate();
    const { toast, confirm } = useToast();

    // Form State
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [presetSearch, setPresetSearch] = useState("");

    // Hook for click outside
    const suggestionsRef = useClickOutside<HTMLDivElement>(() => setShowSuggestions(false));

    // Presets Management
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isManageMode, setIsManageMode] = useState(false);
    const [isAddingPreset, setIsAddingPreset] = useState(false);

    // Preset Form
    const [presetName, setPresetName] = useState("");
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

    // Payment Mode State
    const [paymentMode, setPaymentMode] = useState<'cash' | 'credit'>('cash');
    const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
    const [supplierSearch, setSupplierSearch] = useState("");
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
    const [paymentDueDate, setPaymentDueDate] = useState("");
    const [showSupplierList, setShowSupplierList] = useState(false);

    // Menu & Long Press
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const timerRef = useRef<any>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    useEffect(() => {
        const fetchSuppliers = async () => {
            const { data } = await supabase
                .from('suppliers')
                .select('id, name')
                .eq('is_active', true)
                .order('name');
            if (data) setSuppliers(data);
        };
        fetchSuppliers();
    }, []);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    );

    const handleTouchStart = (id: string, currentSelected: boolean = false) => {
        timerRef.current = setTimeout(() => {
            if (isManageMode) {
                // In manage mode, long press triggers selection
                if (navigator.vibrate) navigator.vibrate(50);
                if (!isSelectionMode) setIsSelectionMode(true);
                if (!currentSelected) toggleSelection(id);
            } else {
                // In Quick Select mode (Grid), long press opens menu
                setActiveMenuId(id);
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const fetchPresets = useCallback(async () => {
        const { data } = await supabase.from('expense_presets').select('*').is('deleted_at', null).order('label');
        if (data && data.length > 0) {
            setPresets(data);
        }
    }, []);

    // Real-time sync for expense presets - auto-refreshes when data changes on any device
    useRealtimeTable('expense_presets', fetchPresets, []);

    // Close menu on ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (activeMenuId) setActiveMenuId(null);
                if (showSuggestions) setShowSuggestions(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeMenuId, showSuggestions]);

    const handleSave = async () => {
        if (!title || !amount || !date) {
            toast("Please fill all fields", "warning");
            return;
        }

        if (paymentMode === 'credit' && (!selectedSupplierId || !paymentDueDate)) {
            toast("Please select a supplier and due date for credit expense", "warning");
            return;
        }

        // 1. Create Expense
        const { data: expenseData, error } = await supabase
            .from("expenses")
            .insert([{
                title,
                amount: parseFloat(amount),
                date: date
            }])
            .select();

        if (error) {
            toast(`Failed to save: ${error.message}`, "error");
            return;
        }

        // 2. Create Payable if Credit
        if (paymentMode === 'credit' && expenseData) {
            const { error: payableError } = await supabase
                .from('accounts_payable')
                .insert({
                    supplier_id: selectedSupplierId,
                    amount: parseFloat(amount),
                    due_date: paymentDueDate,
                    note: `Expense: ${title}`,
                    status: 'pending',
                    recorded_at: new Date().toISOString()
                });

            if (payableError) {
                console.error("Failed to create payable:", payableError);
                toast("Expense saved but failed to add to Payables", "warning");
            } else {
                toast("Expense & Payable saved", "success");
            }
        } else {
            toast("Expense saved", "success");
        }

        // Check presets logic...
        const matchingPreset = presets.find(p => p.label.toLowerCase() === title.toLowerCase());
        if (!matchingPreset && title.trim()) {
            const shouldAdd = await confirm(`Add "${title}" to Quick Expenses?`, {
                confirmText: "Yes",
                cancelText: "No",
                variant: "default"
            });
            if (shouldAdd) {
                await supabase.from('expense_presets').insert([{ label: title }]);
                fetchPresets();
            }
        }

        navigate("/");
    };

    // Preset Operations
    const savePreset = async () => {
        if (!presetName) {
            toast("Please enter a name", "warning");
            return;
        }

        const payload = { label: presetName };

        let error;
        if (editingPresetId) {
            const res = await supabase.from('expense_presets').update(payload).eq('id', editingPresetId);
            error = res.error;
        } else {
            const res = await supabase.from('expense_presets').insert([payload]);
            error = res.error;
        }

        if (!error) {
            toast(editingPresetId ? "Updated preset" : "Added preset", "success");
            setPresetName("");
            setEditingPresetId(null);
            setIsAddingPreset(false);
            fetchPresets();
        } else {
            toast(`Failed to save: ${error.message}`, "error");
        }
    };

    const deletePreset = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // Find preset to get label
        const preset = presets.find(p => p.id === id);
        if (!preset) return;

        if (!await confirm(`Delete "${preset.label}"?`)) return;

        // Optimistic update
        const previousPresets = [...presets];
        setPresets(presets.filter(p => p.id !== id));

        // Soft delete
        const { error } = await supabase.from('expense_presets').update({ deleted_at: new Date().toISOString() }).eq('id', id);

        if (!error) {
            toast("Preset deleted", "success", {
                label: "Undo",
                onClick: async () => {
                    // Restore
                    setPresets(previousPresets);
                    await supabase.from('expense_presets').update({ deleted_at: null }).eq('id', id);
                    toast("Deletion undone", "success");
                }
            }, 10000); // 10 seconds duration
        } else {
            setPresets(previousPresets); // Revert on error
            toast(`Failed to delete: ${error.message}`, "error");
        }
    };

    const editPreset = (p: Preset, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresetName(p.label);
        setEditingPresetId(p.id);
        setIsAddingPreset(true);
    };

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === presets.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(presets.map(p => p.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!await confirm(`Delete ${selectedIds.size} presets?`)) return;

        const { error } = await supabase.from('expense_presets').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedIds));
        if (!error) {
            toast(`Deleted ${selectedIds.size} presets`, "success");
            toggleSelectionMode();
            fetchPresets();
        } else {
            toast("Failed to delete", "error");
        }
    };

    const getIcon = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('petrol') || lower.includes('fuel')) return Fuel;
        if (lower.includes('food') || lower.includes('lunch')) return Utensils;
        if (lower.includes('repair') || lower.includes('main')) return Wrench;
        return Sparkles;
    };

    return (
        <div className="container mx-auto max-w-lg min-h-screen bg-background flex flex-col animate-in fade-in pb-8">
            {/* Glassmorphism Header */}
            {/* Glassmorphism Header */}
            {isSelectionMode && isManageMode ? (
                <div className="sticky top-0 z-50 bg-card border-b border-border shadow-sm px-4 py-3 flex items-center justify-between transition-all animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <Button size="icon" variant="ghost" onClick={toggleSelectionMode}>
                            <X size={20} />
                        </Button>
                        <span className="font-bold text-foreground">{selectedIds.size} Selected</span>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                            {selectedIds.size === presets.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border shadow-sm px-4 py-3 flex items-center justify-between transition-all w-full">
                    {isManageMode ? (
                        <button onClick={() => setIsManageMode(false)} className="p-2.5 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95">
                            <ArrowLeft size={20} />
                        </button>
                    ) : (
                        <button onClick={() => navigate("/")} className="p-2.5 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95">
                            <ArrowLeft size={20} />
                        </button>
                    )}

                    <h1 className="text-lg font-black text-foreground tracking-tight">New Expense</h1>

                    {/* Right Action Button */}
                    {isManageMode ? (
                        <button onClick={() => { setIsAddingPreset(true); setPresetName(""); setEditingPresetId(null); }} className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200 active:scale-95">
                            <Plus size={20} />
                        </button>
                    ) : (
                        <button onClick={() => setIsManageMode(true)} className="p-2.5 rounded-full bg-accent hover:bg-accent/80 text-muted-foreground transition-all duration-200 active:scale-95">
                            <Settings2 size={20} />
                        </button>
                    )}
                </div>
            )}

            <div className="p-4 flex-1 flex flex-col space-y-6">
                {/* Quick Select Grid */}
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">
                            {isManageMode ? "Manage Quick Expenses" : "Quick Select"}
                        </label>
                    </div>

                    {isAddingPreset ? (
                        <div className="bg-card p-5 rounded-3xl border border-border shadow-md space-y-4 animate-in zoom-in-95">
                            <div className="flex items-center gap-3 mb-2">
                                <button onClick={() => setIsAddingPreset(false)} className="p-1 -ml-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-200 active:scale-95">
                                    <ArrowLeft size={20} />
                                </button>
                                <span className="font-bold text-base text-foreground">{editingPresetId ? "Edit Expense Type" : "New Expense Type"}</span>
                            </div>
                            <Input placeholder="Label (e.g. Petrol)" value={presetName} onChange={e => setPresetName(e.target.value)} autoFocus className="bg-background" />
                            <Button size="sm" onClick={savePreset} className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold transition-all duration-200 active:scale-[0.98]">Save Preset</Button>
                        </div>
                    ) : (
                        <div>
                            {isManageMode ? (
                                <div className="space-y-3 animate-in fade-in">
                                    <Input
                                        placeholder="Search expenses..."
                                        value={presetSearch}
                                        onChange={(e) => setPresetSearch(e.target.value)}
                                        className="mb-4 bg-accent/50 border-border font-medium rounded-xl"
                                    />
                                    <div className="space-y-2.5 max-h-[500px] overflow-auto pr-1">
                                        {presets
                                            .filter(p => p.label.toLowerCase().includes(presetSearch.toLowerCase()))
                                            .map(item => {
                                                const Icon = getIcon(item.label);
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className={cn(
                                                            "flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 group select-none relative",
                                                            isSelectionMode && selectedIds.has(item.id)
                                                                ? "border-primary bg-primary/5 shadow-sm"
                                                                : "border-border/60 bg-card hover:border-primary/30 hover:shadow-md"
                                                        )}
                                                        onTouchStart={() => handleTouchStart(item.id, selectedIds.has(item.id))}
                                                        onTouchEnd={handleTouchEnd}
                                                        onMouseDown={() => handleTouchStart(item.id, selectedIds.has(item.id))}
                                                        onMouseUp={handleTouchEnd}
                                                        onMouseLeave={handleTouchEnd}
                                                    >
                                                        <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => isSelectionMode ? toggleSelection(item.id) : null}>
                                                            {isSelectionMode && (
                                                                <div className="mr-1">
                                                                    {selectedIds.has(item.id) ? (
                                                                        <CheckCircle2 className="text-primary fill-primary/20" size={20} />
                                                                    ) : (
                                                                        <Circle className="text-muted-foreground" size={20} />
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="p-2.5 rounded-xl bg-accent text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                                                                <Icon size={20} />
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-foreground text-sm">{item.label}</p>
                                                            </div>
                                                        </div>
                                                        {!isSelectionMode && (
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={(e) => editPreset(item, e)} className="p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-95"><Edit2 size={18} /></button>
                                                                <button onClick={(e) => deletePreset(item.id, e)} className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-95"><Trash2 size={18} /></button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {presets.length === 0 && (
                                        <div className="col-span-3 text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border/60 rounded-3xl bg-accent/20">
                                            No presets found. <br /> Tap the <Settings2 size={14} className="inline mx-1" /> icon to add one!
                                        </div>
                                    )}
                                    {presets.map(item => {
                                        const Icon = getIcon(item.label);
                                        const selected = title === item.label;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    setTitle(item.label);
                                                }}
                                                onTouchStart={() => handleTouchStart(item.id)}
                                                onTouchEnd={handleTouchEnd}
                                                onMouseDown={() => handleTouchStart(item.id)}
                                                onMouseUp={handleTouchEnd}
                                                onMouseLeave={handleTouchEnd}
                                                className={cn(
                                                    "relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 group min-h-[110px] justify-center active:scale-95 shadow-sm cursor-pointer select-none",
                                                    selected
                                                        ? "border-primary bg-primary/10 text-primary shadow-primary/20"
                                                        : "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50 hover:text-foreground"
                                                )}
                                            >
                                                <div className={cn("p-2 rounded-xl transition-colors", selected ? "bg-primary/20" : "bg-accent group-hover:bg-background")}>
                                                    <Icon size={24} />
                                                </div>
                                                <span className="text-xs font-bold text-center leading-tight">{item.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Custom Entry Fields */}
                {!isManageMode && (
                    <div className="bg-card border border-border rounded-t-3xl shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] -mx-4 -mb-4 p-6 space-y-5 animate-in slide-in-from-bottom-6 z-10">
                        {/* Title Input */}
                        <div className="space-y-4">
                            <div className="relative" ref={suggestionsRef}>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block ml-1">Title</label>
                                <Input
                                    value={title}
                                    onChange={e => {
                                        setTitle(e.target.value);
                                        setShowSuggestions(e.target.value.length > 0);
                                    }}
                                    onFocus={() => setShowSuggestions(title.length > 0)}
                                    placeholder="Expense Name"
                                    className="bg-accent/50 border-border/50 text-foreground placeholder:text-muted-foreground/50 font-bold h-12 rounded-xl focus:bg-background transition-all"
                                />

                                {/* Suggestions Dropdown */}
                                {showSuggestions && title.trim() && (
                                    <div className="absolute z-[100] bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 max-h-60 overflow-y-auto">
                                        {!presets.find(p => p.label.toLowerCase() === title.toLowerCase()) && (
                                            <div className="p-2 border-b border-border/50 bg-primary/5">
                                                <p className="text-[10px] text-primary font-bold uppercase tracking-wider px-2 py-1">New Entry</p>
                                            </div>
                                        )}
                                        {presets
                                            .filter(p => p.label.toLowerCase().includes(title.toLowerCase()))
                                            .map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setTitle(p.label);
                                                        setShowSuggestions(false);
                                                    }}
                                                    className="w-full px-4 py-3 text-left hover:bg-zinc-800 flex items-center gap-3 transition-colors border-b border-zinc-800/50 last:border-0"
                                                >
                                                    <Sparkles size={16} className="text-muted-foreground" />
                                                    <span className="font-bold text-foreground text-sm">{p.label}</span>
                                                </button>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block ml-1">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3.5 text-muted-foreground font-bold">₹</span>
                                        <input
                                            type="number"
                                            className="w-full bg-accent/50 border border-border/50 rounded-xl py-3 pl-8 pr-4 text-lg font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                            placeholder="0"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block ml-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full bg-accent/50 border border-border/50 rounded-xl py-3 px-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Payment Mode Toggle */}
                            <div className="bg-accent/30 p-1 rounded-xl flex">
                                <button
                                    className={cn(
                                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                                        paymentMode === 'cash'
                                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => setPaymentMode('cash')}
                                >
                                    Paid Now
                                </button>
                                <button
                                    className={cn(
                                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                                        paymentMode === 'credit'
                                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => setPaymentMode('credit')}
                                >
                                    Pay Later
                                </button>
                            </div>

                            {/* Credit Fields */}
                            {paymentMode === 'credit' && (
                                <div className="space-y-4 animate-in slide-in-from-top-2 pt-2">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Select Supplier</label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                            <input
                                                type="text"
                                                placeholder="Search supplier..."
                                                className="w-full bg-accent/50 border border-border/50 rounded-xl pl-10 pr-4 h-11 text-sm font-bold outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                                value={supplierSearch}
                                                onChange={e => {
                                                    setSupplierSearch(e.target.value);
                                                    setShowSupplierList(true);
                                                }}
                                                onFocus={() => setShowSupplierList(true)}
                                            />
                                        </div>

                                        {showSupplierList && (supplierSearch.trim() !== "") && (
                                            <div className="max-h-40 overflow-y-auto border border-border/50 bg-background rounded-xl shadow-lg divide-y divide-border/30">
                                                {filteredSuppliers.length > 0 ? (
                                                    filteredSuppliers.map(s => (
                                                        <button
                                                            key={s.id}
                                                            onClick={() => {
                                                                setSelectedSupplierId(s.id);
                                                                setSupplierSearch(s.name);
                                                                setShowSupplierList(false);
                                                            }}
                                                            className={cn(
                                                                "w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:bg-accent",
                                                                selectedSupplierId === s.id ? "bg-primary/5 text-primary" : "text-foreground"
                                                            )}
                                                        >
                                                            {s.name}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-3 text-center">
                                                        <p className="text-xs text-muted-foreground mb-2">No supplier found</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Payment Due Date</label>
                                        <input
                                            type="date"
                                            className="w-full bg-accent/50 border border-border/50 rounded-xl px-4 h-11 text-sm font-bold outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                            value={paymentDueDate}
                                            onChange={e => setPaymentDueDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <Button
                                size="lg"
                                className="w-full h-14 text-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xl shadow-rose-500/20 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleSave}
                            >
                                <Check className="mr-2" size={20} />
                                {paymentMode === 'credit' ? 'Record Expense & Payable' : 'Add Expense'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Backdrop for Menu */}
            {activeMenuId && (
                <div
                    className="fixed inset-0 z-[40] bg-black/5 backdrop-blur-[1px]"
                    onClick={() => setActiveMenuId(null)}
                />
            )}
        </div>
    );
}
