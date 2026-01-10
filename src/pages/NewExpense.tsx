import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ArrowLeft, Check, Fuel, Utensils, Wrench, Sparkles, Plus, Trash2, Edit2, Settings2, X, CheckCircle2, Circle } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";

import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { useDropdownClose } from "../hooks/useDropdownClose";

type Preset = {
    id: string;
    label: string;
};

import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useHistorySyncedState } from "../hooks/useHistorySyncedState";

export default function NewExpense() {
    const navigate = useNavigate();
    const { toast, confirm } = useToast();

    // Form State
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [presetSearch, setPresetSearch] = useState("");

    // Hook for click outside
    const suggestionsRef = useRef<HTMLDivElement>(null);
    useDropdownClose(showSuggestions, () => setShowSuggestions(false), suggestionsRef);

    // Presets Management - synced with browser history for proper back navigation
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isManageMode, setIsManageMode] = useHistorySyncedState(false, 'expenseManageMode');
    const [isAddingPreset, setIsAddingPreset] = useHistorySyncedState(false, 'expenseAddingPreset');

    // Preset Form
    const [presetName, setPresetName] = useState("");
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

    // Menu & Long Press
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const timerRef = useRef<any>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

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

    const handleTouchMove = () => {
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

    // Close menu on ESC or click outside
    useDropdownClose(!!activeMenuId, () => setActiveMenuId(null));



    const handleSave = async () => {
        if (!title.trim()) {
            toast("Please enter an expense title", "warning");
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            toast("Please enter a valid amount", "warning");
            return;
        }
        if (!date) {
            toast("Please select a date", "warning");
            return;
        }

        // Create Expense
        const { error } = await supabase
            .from("expenses")
            .insert([{
                title,
                amount: parseFloat(amount),
                date: date
            }]);

        if (error) {
            toast(`Failed to save: ${error.message}`, "error");
            return;
        }

        toast("Expense saved", "success");

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

    const deletePreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // Find preset to get label
        const preset = presets.find(p => p.id === id);
        if (!preset) return;

        setConfirmConfig({
            isOpen: true,
            title: `Delete "${preset.label}"?`,
            description: "This preset will be moved to trash.",
            onConfirm: async () => {
                const { error } = await supabase.from('expense_presets').update({ deleted_at: new Date().toISOString() }).eq('id', id);

                if (!error) {
                    toast("Preset deleted", "success");
                    fetchPresets();
                } else {
                    toast(`Failed to delete: ${error.message}`, "error");
                }
            },
            variant: "destructive",
            confirmText: "Delete"
        });
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
        if (newSet.size === 0) setIsSelectionMode(false);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === presets.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(presets.map(p => p.id)));
        }
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIds.size} presets?`,
            description: "These presets will be moved to trash.",
            onConfirm: async () => {
                const { error } = await supabase.from('expense_presets').update({ deleted_at: new Date().toISOString() }).in('id', Array.from(selectedIds));
                if (!error) {
                    toast(`Deleted ${selectedIds.size} presets`, "success");
                    toggleSelectionMode();
                    fetchPresets();
                } else {
                    toast("Failed to delete", "error");
                }
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    const getIcon = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('petrol') || lower.includes('fuel')) return Fuel;
        if (lower.includes('food') || lower.includes('lunch')) return Utensils;
        if (lower.includes('repair') || lower.includes('main')) return Wrench;
        return Sparkles;
    };

    return (
        <div className="w-full md:max-w-lg md:mx-auto bg-background flex flex-col animate-in fade-in">
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
                <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-b border-border shadow-sm px-3 py-3 md:px-4 flex items-center justify-between transition-all w-full mb-4">
                    {isManageMode ? (
                        <button
                            onClick={() => window.history.back()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    window.history.back();
                                }
                            }}
                            tabIndex={0}
                            className="p-3 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                            aria-label="Back to expense form"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    ) : (
                        <button
                            onClick={() => window.history.back()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    navigate("/");
                                }
                            }}
                            tabIndex={0}
                            className="p-3 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                            aria-label="Go back to dashboard"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}

                    <h1 className="text-base md:text-lg font-black text-foreground tracking-tight">New Expense</h1>

                    {/* Right Action Button */}
                    {isManageMode ? (
                        <button
                            onClick={() => { setIsAddingPreset(true); setPresetName(""); setEditingPresetId(null); }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setIsAddingPreset(true);
                                    setPresetName("");
                                    setEditingPresetId(null);
                                }
                            }}
                            tabIndex={0}
                            className="p-3 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1"
                            aria-label="Add new expense type"
                        >
                            <Plus size={20} />
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsManageMode(true)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setIsManageMode(true);
                                }
                            }}
                            tabIndex={0}
                            className="p-3 rounded-full bg-accent hover:bg-accent/80 text-muted-foreground transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                            aria-label="Manage quick expenses"
                        >
                            <Settings2 size={20} />
                        </button>
                    )}
                </div>
            )}

            <div className="p-3 md:p-4 flex flex-col space-y-3 md:space-y-4 pt-20 md:pt-20">
                {/* Quick Select Grid */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">
                            {isManageMode ? "Manage Quick Expenses" : "Quick Select"}
                        </label>
                    </div>

                    {isAddingPreset ? (
                        <div className="bg-card p-5 rounded-3xl border border-border shadow-md space-y-4 animate-in zoom-in-95">
                            <div className="flex items-center gap-3 mb-2">
                                <button onClick={() => window.history.back()} className="p-1 -ml-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-200 active:scale-95">
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
                                        className="mb-4 bg-accent/50 border-2 border-zinc-200 dark:border-zinc-700 font-medium rounded-xl"
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
                                                        onTouchMove={handleTouchMove}
                                                        onMouseDown={() => handleTouchStart(item.id, selectedIds.has(item.id))}
                                                        onMouseUp={handleTouchEnd}
                                                        onMouseLeave={handleTouchEnd}
                                                    >
                                                        <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => isSelectionMode ? toggleSelection(item.id) : null}>
                                                            {isSelectionMode && (
                                                                <div className="flex items-center justify-center w-10 h-10 mr-1">
                                                                    {selectedIds.has(item.id) ? (
                                                                        <CheckCircle2 className="text-primary fill-primary/20" size={24} strokeWidth={2.5} />
                                                                    ) : (
                                                                        <Circle className="text-muted-foreground" size={24} strokeWidth={2} />
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
                                                                <button onClick={(e) => editPreset(item, e)} className="p-2.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all active:scale-95" aria-label="Edit preset">
                                                                    <Edit2 size={18} />
                                                                </button>
                                                                <button onClick={(e) => deletePreset(item.id, e)} className="p-2.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all active:scale-95" aria-label="Delete preset">
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 md:gap-3">
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
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setTitle(item.label);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="button"
                                                onTouchStart={() => handleTouchStart(item.id)}
                                                onTouchEnd={handleTouchEnd}
                                                onTouchMove={handleTouchMove}
                                                onMouseDown={() => handleTouchStart(item.id)}
                                                onMouseUp={handleTouchEnd}
                                                onMouseLeave={handleTouchEnd}
                                                className={cn(
                                                    "relative flex flex-col items-center gap-2 md:gap-3 p-3 md:p-4 rounded-2xl border-2 transition-all duration-200 group min-h-[100px] md:min-h-[110px] justify-center active:scale-95 shadow-sm cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                                                    selected
                                                        ? "border-primary bg-primary/10 text-primary shadow-primary/20"
                                                        : "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50 hover:text-foreground"
                                                )}
                                                aria-label={`Select ${item.label}`}
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
                    <div className="bg-card border border-border rounded-3xl shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] p-4 md:p-5 space-y-3 md:space-y-4 animate-in slide-in-from-bottom-6 z-10 mt-4 mb-1">
                        {/* Title Input */}
                        <div className="space-y-3 md:space-y-4">
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
                                    className="bg-accent/50 border-border/50 text-foreground placeholder:text-muted-foreground/50 font-bold h-14 md:h-12 rounded-xl focus:bg-background transition-all"
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
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full bg-accent/50 border border-border/50 rounded-xl py-3 md:py-3 px-4 text-base md:text-lg font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all h-14 md:h-12"
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
                                        className="w-full bg-accent/50 border border-border/50 rounded-xl py-3 md:py-3 px-3 text-xs md:text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all h-14 md:h-12"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                            </div>



                            <Button
                                size="lg"
                                className="w-full h-12 md:h-14 text-base md:text-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xl shadow-rose-500/20 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleSave}
                            >
                                <Check className="mr-2" size={20} />
                                Add Expense
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={closeConfirm}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                description={confirmConfig.description}
                variant={confirmConfig.variant}
                confirmText={confirmConfig.confirmText}
            />
        </div>
    );
}
