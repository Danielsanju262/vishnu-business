import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ArrowLeft, Check, Flame, Fuel, Utensils, Wrench, Sparkles, Plus, Trash2, Edit2, Settings2, MoreVertical, X, CheckCircle2, Circle } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";

type Preset = {
    id: string;
    label: string;
    is_ghee_ingredient: boolean;
};

export default function NewExpense() {
    const navigate = useNavigate();
    const { toast, confirm } = useToast();

    // Form State
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");
    const [isGhee, setIsGhee] = useState(false);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [presetSearch, setPresetSearch] = useState("");

    // Presets Management
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isManageMode, setIsManageMode] = useState(false);
    const [isAddingPreset, setIsAddingPreset] = useState(false);

    // Preset Form
    const [presetName, setPresetName] = useState("");
    const [presetGhee, setPresetGhee] = useState(false);
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

    // Menu & Long Press
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const timerRef = useRef<any>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

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

    useEffect(() => {
        fetchPresets();
    }, []);

    const fetchPresets = async () => {
        const { data } = await supabase.from('expense_presets').select('*').is('deleted_at', null).order('label');
        if (data && data.length > 0) {
            setPresets(data);
        }
    };

    const handleSave = async () => {
        if (!title || !amount || !date) {
            toast("Please fill all fields", "warning");
            return;
        }

        const { error } = await supabase
            .from("expenses")
            .insert([{
                title,
                amount: parseFloat(amount),
                is_ghee_ingredient: isGhee,
                date: date
            }])
            .select();

        if (!error) {
            // Check if this expense title is in our presets
            const matchingPreset = presets.find(p => p.label.toLowerCase() === title.toLowerCase());
            if (!matchingPreset && title.trim()) {
                const shouldAdd = await confirm(`Add "${title}" to Quick Expenses?`, {
                    confirmText: "Yes",
                    cancelText: "No",
                    variant: "default"
                });
                if (shouldAdd) {
                    await supabase.from('expense_presets').insert([{ label: title, is_ghee_ingredient: isGhee }]);
                    fetchPresets(); // Refresh presets
                }
            }
            toast("Expense saved", "success");
            navigate("/");
        } else {
            toast(`Failed to save: ${error.message}`, "error");
        }
    };

    // Preset Operations
    const savePreset = async () => {
        if (!presetName) {
            toast("Please enter a name", "warning");
            return;
        }

        const payload = { label: presetName, is_ghee_ingredient: presetGhee };

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
            setPresetGhee(false);
            setEditingPresetId(null);
            setIsAddingPreset(false);
            fetchPresets();
        } else {
            toast(`Failed to save: ${error.message}`, "error");
        }
    };

    const deletePreset = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!await confirm("Delete this quick expense option?")) return;

        const { error } = await supabase.from('expense_presets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (!error) {
            fetchPresets();
            toast("Preset deleted", "success");
        }
    };

    const editPreset = (p: Preset, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresetName(p.label);
        setPresetGhee(p.is_ghee_ingredient);
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

    const getIcon = (name: string, isGhee: boolean) => {
        const lower = name.toLowerCase();
        if (isGhee) return Flame;
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
                <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm px-4 py-3 flex items-center justify-between transition-all">
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
                            <div
                                onClick={() => setPresetGhee(!presetGhee)}
                                className={cn("flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-200 hover:border-amber-400", presetGhee ? "bg-amber-100 dark:bg-amber-500/10 border-amber-500" : "bg-accent/50 border-border")}
                            >
                                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", presetGhee ? "bg-amber-500 border-amber-500" : "border-muted-foreground/30")}>
                                    {presetGhee && <Check size={12} className="text-white" />}
                                </div>
                                <span className={cn("text-sm font-bold", presetGhee ? "text-amber-700 dark:text-amber-500" : "text-foreground")}>Is Ghee Ingredient?</span>
                            </div>
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
                                                const Icon = getIcon(item.label, item.is_ghee_ingredient);
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
                                                                {item.is_ghee_ingredient && (
                                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">Ghee</span>
                                                                )}
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
                                        const Icon = getIcon(item.label, item.is_ghee_ingredient);
                                        const selected = title === item.label;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    // Only select if menu is not active (prevent selection on menu interaction)
                                                    if (!activeMenuId) {
                                                        setTitle(item.label);
                                                        setIsGhee(item.is_ghee_ingredient);
                                                    }
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

                                                {/* 3-Dot Menu Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveMenuId(activeMenuId === item.id ? null : item.id);
                                                    }}
                                                    className="absolute top-2 right-2 p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-all"
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                {/* The Menu Dropdown */}
                                                {activeMenuId === item.id && (
                                                    <div className="absolute right-2 top-8 w-32 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-xl z-[50] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5">
                                                        <div className="flex flex-col p-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    editPreset(item, e);
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground hover:bg-accent rounded-lg text-left"
                                                            >
                                                                <Edit2 size={12} /> Edit
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    deletePreset(item.id, e);
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                                                            >
                                                                <Trash2 size={12} /> Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
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
                            <div className="relative">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block ml-1">Title</label>
                                <Input
                                    value={title}
                                    onChange={e => {
                                        setTitle(e.target.value);
                                        setShowSuggestions(e.target.value.length > 0);
                                    }}
                                    onFocus={() => setShowSuggestions(title.length > 0)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
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
                                                        setIsGhee(p.is_ghee_ingredient);
                                                        setShowSuggestions(false);
                                                    }}
                                                    className="w-full px-4 py-3 text-left hover:bg-zinc-800 flex items-center gap-3 transition-colors border-b border-zinc-800/50 last:border-0"
                                                >
                                                    <Flame size={16} className={p.is_ghee_ingredient ? "text-amber-500" : "text-muted-foreground/30"} />
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

                            {/* Ghee Toggle Card */}
                            <div
                                onClick={() => setIsGhee(!isGhee)}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 cursor-pointer active:scale-[0.98]",
                                    isGhee
                                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 shadow-inner"
                                        : "bg-background border-border hover:bg-accent"
                                )}
                            >
                                <div className={cn(
                                    "w-12 h-7 rounded-full relative transition-colors duration-300 shrink-0",
                                    isGhee ? "bg-amber-500" : "bg-muted"
                                )}>
                                    <div className={cn(
                                        "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300",
                                        isGhee ? "left-6" : "left-1"
                                    )} />
                                </div>
                                <div>
                                    <p className={cn("font-bold text-sm", isGhee ? "text-amber-800 dark:text-amber-400" : "text-foreground")}>Ghee Production Cost</p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">Enable if this expense is for raw materials like butter/cream.</p>
                                </div>
                            </div>

                            <Button
                                size="lg"
                                className="w-full h-14 text-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xl shadow-rose-500/20 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleSave}
                            >
                                <Check className="mr-2" size={20} />
                                Add Expense
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Backdrop for Menu */}
            {activeMenuId && (
                <div
                    className="fixed inset-0 z-[40]"
                    onClick={() => setActiveMenuId(null)}
                />
            )}
        </div>
    );
}
