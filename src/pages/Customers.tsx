import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, Trash2, Plus, User, Store, MoreVertical, CheckCircle2, Circle, X, Edit2 } from "lucide-react";
import { useToast } from "../components/toast-provider";
import { cn } from "../lib/utils";
import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { useDropdownClose } from "../hooks/useDropdownClose";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";

type Customer = {
    id: string;
    name: string;
};

export default function Customers() {
    const { toast } = useToast();

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

    // Long Press for Selection
    const timerRef = useRef<any>(null);

    const handleTouchStart = (id: string, currentSelected: boolean) => {
        // Store which element the touch started on
        const touchStartId = id;
        timerRef.current = setTimeout(() => {
            // Only trigger if we're still on the same element
            if (navigator.vibrate) navigator.vibrate(50);
            if (!isSelectionMode) setIsSelectionMode(true);
            if (!currentSelected) toggleSelection(touchStartId);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const handleTouchMove = () => {
        // Cancel the long-press if user moves their finger (scrolling)
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from("customers").select("*").eq('is_active', true).order("name");
        if (data) setCustomers(data);
        setLoading(false);
    }, []);

    // Real-time sync for customers - auto-refreshes when data changes on any device
    useRealtimeTable('customers', fetchCustomers, []);

    const handleSave = async () => {
        if (!newName) return;

        let error;
        if (editingId) {
            const res = await supabase.from("customers").update({ name: newName }).eq('id', editingId);
            error = res.error;
        } else {
            const res = await supabase.from("customers").insert([{ name: newName, is_active: true }]);
            error = res.error;
        }

        if (!error) {
            toast(editingId ? "Customer updated" : "Customer added", "success");
            setNewName("");
            setIsAdding(false);
            setEditingId(null);
            fetchCustomers();
        } else {
            toast("Failed to save", "error");
        }
    };

    const startEdit = (c: Customer) => {
        setNewName(c.name);
        setEditingId(c.id);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (id: string, name: string) => {
        setConfirmConfig({
            isOpen: true,
            title: `Delete "${name}"?`,
            description: "This action cannot be undone.",
            onConfirm: async () => {
                const { error } = await supabase.from("customers").update({ is_active: false }).eq("id", id);
                if (!error) {
                    toast("Customer deleted", "success");
                    fetchCustomers();
                } else {
                    toast("Failed to delete", "error");
                }
            },
            variant: "destructive",
            confirmText: "Delete"
        });
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
        if (selectedIds.size === customers.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(customers.map(c => c.id)));
        }
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIds.size} customers?`,
            description: "These customers will be marked as inactive.",
            onConfirm: async () => {
                const { error } = await supabase.from("customers").update({ is_active: false }).in("id", Array.from(selectedIds));
                if (!error) {
                    toast(`Deleted ${selectedIds.size} customers`, "success");
                    toggleSelectionMode();
                    fetchCustomers();
                }
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    // Close menu on ESC or click outside
    useDropdownClose(!!activeMenuId, () => setActiveMenuId(null));

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background pb-28 md:pb-32 w-full md:max-w-2xl md:mx-auto px-3 md:px-4">
            {/* Header */}
            {isSelectionMode ? (
                <div className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-border shadow-sm px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button size="icon" variant="ghost" onClick={toggleSelectionMode}>
                            <X size={20} />
                        </Button>
                        <span className="font-bold text-foreground">{selectedIds.size} Selected</span>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                            {selectedIds.size === customers.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-border shadow-sm px-3 py-3 md:px-4 flex items-center justify-between gap-4">
                    <Link to="/" className="p-3 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Link to="/" className="hover:text-primary transition">Home</Link>
                            <span>/</span>
                            <span className="text-primary font-semibold">Customers</span>
                        </div>
                        <h1 className="text-2xl font-black text-foreground tracking-tight">Customers</h1>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => { setIsAdding(!isAdding); setNewName(""); setEditingId(null); }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setIsAdding(!isAdding);
                                setNewName("");
                                setEditingId(null);
                            }
                        }}
                        tabIndex={0}
                        className={cn(
                            "rounded-full px-5 font-bold shadow-lg transition-all interactive focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2",
                            isAdding ? "bg-muted text-foreground hover:bg-muted/80" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20"
                        )}
                    >
                        {isAdding ? <X className="h-4 w-4" strokeWidth={3} /> : <><Plus className="mr-2 h-4 w-4" strokeWidth={3} />Add New</>}
                    </Button>
                </div>
            )}

            <div className="h-24 md:h-28" /> {/* Spacer for fixed header */}


            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Search Bar */}
                {
                    !isAdding && customers.length > 0 && (
                        <div className="relative mb-6">
                            <input
                                type="text"
                                placeholder="Search customers..."
                                className="w-full px-4 h-12 rounded-xl bg-background border-2 border-border focus:border-ring transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    )
                }

                {
                    isAdding && (
                        <div className="bg-gradient-to-br from-card to-accent/20 border border-border p-4 md:p-5 rounded-2xl mb-5 md:mb-6 shadow-xl animate-in slide-in-from-top-4 ring-1 ring-primary/5">
                            <h2 className="font-bold text-foreground text-sm mb-4 uppercase tracking-wider opacity-70 flex items-center gap-2">
                                {editingId ? <><User size={16} /> Edit Customer</> : <><Plus size={16} /> New Customer</>}
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Customer Name</label>
                                    <input
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3.5 md:py-3 text-lg font-semibold text-foreground focus:ring-2 focus:ring-primary outline-none shadow-sm placeholder:font-normal placeholder:text-muted-foreground/50 transition-all h-14 md:h-auto"
                                        placeholder="e.g. Hotel Woodlands"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <Button onClick={handleSave} className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 interactive">
                                    {editingId ? "Update Customer" : "Save Customer"}
                                </Button>
                            </div>
                        </div>
                    )
                }

                {
                    loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-20 bg-accent/30 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-2 md:gap-3">
                            {filteredCustomers.length === 0 && (
                                <div className="text-center py-16 px-6 text-muted-foreground border-2 border-dashed border-border/60 rounded-3xl bg-accent/10">
                                    <div className="bg-accent/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Store size={32} className="opacity-50" />
                                    </div>
                                    <p className="font-medium">No customers found</p>
                                    <p className="text-xs opacity-70 mt-1">Add a new customer to get started</p>
                                </div>
                            )}

                            {filteredCustomers.map((c) => (
                                <div key={c.id} className={cn(
                                    "group bg-card p-3 md:p-4 rounded-2xl shadow-sm border border-border/60 transition-all duration-300 relative",
                                    isSelectionMode && selectedIds.has(c.id) && "ring-2 ring-primary bg-primary",
                                    activeMenuId === c.id ? "z-50" : "z-0"
                                )}>
                                    {isSelectionMode ? (
                                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleSelection(c.id)}>
                                            <div className="flex items-center justify-center w-10 h-10 mr-1">
                                                {selectedIds.has(c.id) ? (
                                                    <CheckCircle2 className="text-primary fill-primary/20" size={24} strokeWidth={2.5} />
                                                ) : (
                                                    <Circle className="text-muted-foreground" size={24} strokeWidth={2} />
                                                )}
                                            </div>
                                            <div className="bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-500/20 dark:to-blue-500/20 text-indigo-600 dark:text-indigo-300 w-10 h-10 rounded-full flex items-center justify-center shadow-sm">
                                                <span className="text-sm font-black">{c.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-base md:text-lg text-foreground leading-tight">{c.name}</h3>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="flex justify-between items-center"
                                            onTouchStart={() => handleTouchStart(c.id, selectedIds.has(c.id))}
                                            onTouchEnd={handleTouchEnd}
                                            onTouchMove={handleTouchMove}
                                            onMouseDown={() => handleTouchStart(c.id, selectedIds.has(c.id))}
                                            onMouseUp={handleTouchEnd}
                                            onMouseLeave={handleTouchEnd}
                                        >
                                            <div
                                                className="flex items-center gap-3 md:gap-4 flex-1 cursor-pointer"
                                                onClick={() => startEdit(c)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        startEdit(c);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`Edit ${c.name}`}
                                            >
                                                <div className="bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-500/20 dark:to-blue-500/20 text-indigo-600 dark:text-indigo-300 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform select-none">
                                                    <span className="text-base md:text-lg font-black">{c.name.charAt(0).toUpperCase()}</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors leading-tight select-none">{c.name}</h3>
                                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5 select-none">Click to edit</p>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === c.id ? null : c.id); }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setActiveMenuId(activeMenuId === c.id ? null : c.id);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                    className="p-2.5 text-muted-foreground hover:bg-accent rounded-xl transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                                                    aria-label="More options"
                                                >
                                                    <MoreVertical size={20} />
                                                </button>

                                                {activeMenuId === c.id && (
                                                    <div
                                                        className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onTouchStart={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="flex flex-col p-1">
                                                            <button
                                                                onClick={() => { setActiveMenuId(null); startEdit(c); }}
                                                                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg text-left"
                                                            >
                                                                <Edit2 size={14} /> Edit
                                                            </button>
                                                            <button
                                                                onClick={() => { setActiveMenuId(null); handleDelete(c.id, c.name); }}
                                                                className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                                                            >
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                            <div className="h-px bg-border/50 my-1" />
                                                            <button
                                                                onClick={() => {
                                                                    setActiveMenuId(null);
                                                                    toggleSelectionMode();
                                                                    toggleSelection(c.id);
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
        </div >
    );
}
