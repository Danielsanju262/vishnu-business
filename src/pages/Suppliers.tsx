import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Trash2, Plus, User, Search, Truck, MoreVertical, CheckCircle2, Circle, X, Edit2, WifiOff } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { useRealtimeTable } from "../hooks/useRealtimeSync";

type Supplier = {
    id: string;
    name: string;
};

export default function Suppliers() {
    const { toast, confirm } = useToast();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Long Press for Selection
    const timerRef = useRef<any>(null);

    const handleTouchStart = (id: string, currentSelected: boolean) => {
        timerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            if (!isSelectionMode) setIsSelectionMode(true);
            if (!currentSelected) toggleSelection(id);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const [setupRequired, setSetupRequired] = useState(false);

    const fetchSuppliers = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from("suppliers").select("*").eq('is_active', true).order("name");

        if (error) {
            console.error("Error loading suppliers:", error);
            if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('relation "suppliers" does not exist')) {
                setSetupRequired(true);
            } else {
                toast("Failed to load suppliers", "error");
            }
        } else if (data) {
            setSuppliers(data);
        }
        setLoading(false);
    }, []);

    // Real-time sync
    useRealtimeTable('suppliers', fetchSuppliers, []);

    const handleSave = async () => {
        if (!newName) return;

        let error;
        if (editingId) {
            const res = await supabase.from("suppliers").update({ name: newName }).eq('id', editingId);
            error = res.error;
        } else {
            const res = await supabase.from("suppliers").insert([{ name: newName, is_active: true }]);
            error = res.error;
        }

        if (!error) {
            toast(editingId ? "Supplier updated" : "Supplier added", "success");
            setNewName("");
            setIsAdding(false);
            setEditingId(null);
            fetchSuppliers();
        } else {
            toast("Failed to save", "error");
        }
    };

    const startEdit = (s: Supplier) => {
        setNewName(s.name);
        setEditingId(s.id);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string, name: string) => {
        if (!await confirm(`Delete "${name}"?`)) return;

        // Optimistic Remove
        const previousSuppliers = [...suppliers];
        setSuppliers(prev => prev.filter(s => s.id !== id));

        const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
        if (!error) {
            toast("Supplier deleted", "success", {
                label: "Undo",
                onClick: async () => {
                    // Restore
                    setSuppliers(previousSuppliers);
                    const { error: restoreError } = await supabase.from("suppliers").update({ is_active: true }).eq("id", id);
                    if (!restoreError) {
                        toast("Restored", "success");
                        fetchSuppliers();
                    }
                }
            }, 10000);
        } else {
            setSuppliers(previousSuppliers);
            toast("Failed to delete", "error");
            fetchSuppliers();
        }
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
        if (selectedIds.size === suppliers.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(suppliers.map(s => s.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!await confirm(`Delete ${selectedIds.size} suppliers?`)) return;

        const { error } = await supabase.from("suppliers").update({ is_active: false }).in("id", Array.from(selectedIds));
        if (!error) {
            toast(`Deleted ${selectedIds.size} suppliers`, "success");
            toggleSelectionMode();
            fetchSuppliers();
        }
    };

    // Close menu on ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && activeMenuId) {
                setActiveMenuId(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeMenuId]);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (setupRequired) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-6">
                    <WifiOff size={32} />
                </div>
                <h1 className="text-2xl font-black text-foreground mb-2">Setup Required</h1>
                <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
                    The suppliers table needs to be created in Supabase first.
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
                        create policy "Enable all" on suppliers for all using (true) with check (true);
                    </code>
                </div>
                <Button onClick={() => { setSetupRequired(false); fetchSuppliers(); }} className="font-bold">
                    I've Run the SQL, Retry
                </Button>
                <Link to="/" className="mt-4 text-sm font-semibold text-muted-foreground hover:text-foreground">
                    Go Back Home
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background px-4 pt-4 pb-32 animate-in fade-in max-w-lg mx-auto">
            {/* Header / Bulk Header */}
            {isSelectionMode ? (
                <div className="flex justify-between items-center gap-4 mb-6 bg-card -mx-4 px-4 py-3 border-b border-border sticky top-0 z-30 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <Button size="icon" variant="ghost" onClick={toggleSelectionMode}>
                            <X size={20} />
                        </Button>
                        <span className="font-bold text-foreground">{selectedIds.size} Selected</span>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                            {selectedIds.size === suppliers.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-4 mb-8 relative bg-background py-4 -mx-4 px-4 border-b border-border/50">
                    <Link to="/" className="p-2.5 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Link to="/" className="hover:text-primary transition">Home</Link>
                            <span>/</span>
                            <span className="text-primary font-semibold">Suppliers</span>
                        </div>
                        <h1 className="text-2xl font-black text-foreground tracking-tight">Suppliers</h1>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => { setIsAdding(!isAdding); setNewName(""); setEditingId(null); }}
                        className={cn(
                            "rounded-full px-5 font-bold shadow-lg transition-all interactive",
                            isAdding ? "bg-muted text-foreground hover:bg-muted/80" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20"
                        )}
                    >
                        {isAdding ? "Cancel" : <><Plus className="mr-2 h-4 w-4" strokeWidth={3} />Add New</>}
                    </Button>
                </div>
            )}

            {/* Search Bar */}
            {!isAdding && suppliers.length > 0 && (
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Search suppliers..."
                        className="w-full pl-10 h-12 rounded-xl bg-accent/50 border-transparent focus:bg-background focus:border-ring transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {isAdding && (
                <div className="bg-gradient-to-br from-card to-accent/20 border border-border p-5 rounded-2xl mb-6 shadow-xl animate-in slide-in-from-top-4 ring-1 ring-primary/5">
                    <h2 className="font-bold text-foreground text-sm mb-4 uppercase tracking-wider opacity-70 flex items-center gap-2">
                        {editingId ? <><User size={16} /> Edit Supplier</> : <><Plus size={16} /> New Supplier</>}
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Supplier Name</label>
                            <input
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-semibold text-foreground focus:ring-2 focus:ring-primary outline-none shadow-sm placeholder:font-normal placeholder:text-muted-foreground/50 transition-all"
                                placeholder="e.g. ABC Trading"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <Button onClick={handleSave} className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 interactive">
                            {editingId ? "Update Supplier" : "Save Supplier"}
                        </Button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-accent/30 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-3">
                    {filteredSuppliers.length === 0 && (
                        <div className="text-center py-16 px-6 text-muted-foreground border-2 border-dashed border-border/60 rounded-3xl bg-accent/10">
                            <div className="bg-accent/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Truck size={32} className="opacity-50" />
                            </div>
                            <p className="font-medium">No suppliers found</p>
                            <p className="text-xs opacity-70 mt-1">Add a new supplier to get started</p>
                        </div>
                    )}

                    {filteredSuppliers.map((s) => (
                        <div key={s.id} className={cn(
                            "group bg-card p-4 rounded-2xl shadow-sm border border-border/60 transition-all duration-300 relative",
                            isSelectionMode && selectedIds.has(s.id) && "ring-2 ring-primary bg-primary/5",
                            activeMenuId === s.id ? "z-50" : "z-0"
                        )}>
                            {isSelectionMode ? (
                                <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleSelection(s.id)}>
                                    <div className="mr-1">
                                        {selectedIds.has(s.id) ? (
                                            <CheckCircle2 className="text-primary fill-primary/20" />
                                        ) : (
                                            <Circle className="text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-500/20 dark:to-blue-500/20 text-indigo-600 dark:text-indigo-300 w-10 h-10 rounded-full flex items-center justify-center shadow-sm">
                                        <span className="text-sm font-black">{s.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-foreground leading-tight">{s.name}</h3>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="flex justify-between items-center"
                                    onTouchStart={() => handleTouchStart(s.id, selectedIds.has(s.id))}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={() => handleTouchStart(s.id, selectedIds.has(s.id))}
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                >
                                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => startEdit(s)}>
                                        <div className="bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-500/20 dark:to-blue-500/20 text-indigo-600 dark:text-indigo-300 w-12 h-12 rounded-full flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform select-none">
                                            <span className="text-lg font-black">{s.name.charAt(0).toUpperCase()}</span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors leading-tight select-none">{s.name}</h3>
                                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5 select-none">Click to edit</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === s.id ? null : s.id); }}
                                            className="p-2 text-muted-foreground hover:bg-accent rounded-xl transition"
                                        >
                                            <MoreVertical size={20} />
                                        </button>

                                        {activeMenuId === s.id && (
                                            <div className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5">
                                                <div className="flex flex-col p-1">
                                                    <button
                                                        onClick={() => { setActiveMenuId(null); startEdit(s); }}
                                                        className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg text-left"
                                                    >
                                                        <Edit2 size={14} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => { setActiveMenuId(null); handleDelete(s.id, s.name); }}
                                                        className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                    <div className="h-px bg-border/50 my-1" />
                                                    <button
                                                        onClick={() => {
                                                            setActiveMenuId(null);
                                                            toggleSelectionMode();
                                                            toggleSelection(s.id);
                                                        }}
                                                        className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg text-left"
                                                    >
                                                        <CheckCircle2 size={14} /> Select
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )
            }
            {/* Backdrop for Menu */}
            {
                activeMenuId && (
                    <div
                        className="fixed inset-0 z-[40] bg-black/5 backdrop-blur-[1px]"
                        onClick={() => setActiveMenuId(null)}
                    />
                )
            }
        </div >
    );
}
