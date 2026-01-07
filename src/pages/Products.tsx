import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Trash2, Plus, Milk, Package, ArrowLeft, Search, Tag, Box, MoreVertical, CheckCircle2, Circle, X, Edit2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";
import { useRealtimeTable } from "../hooks/useRealtimeSync";
import { useDropdownClose } from "../hooks/useDropdownClose";

type Product = {
    id: string;
    name: string;
    unit: string;
    category: string;
};

import { ConfirmationModal } from "../components/ui/ConfirmationModal";

export default function Products() {
    const { toast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
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
        timerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            if (!isSelectionMode) setIsSelectionMode(true);
            if (!currentSelected) toggleSelection(id);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };
    const [searchQuery, setSearchQuery] = useState("");

    // New Product Form
    const [newName, setNewName] = useState("");
    const [newUnit, setNewUnit] = useState("kg");
    const [newCategory, setNewCategory] = useState("general");

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from("products").select("*").eq('is_active', true).order("name");
        if (data) setProducts(data);
        setLoading(false);
    }, []);

    // Real-time sync for products - auto-refreshes when data changes on any device
    useRealtimeTable('products', fetchProducts, []);

    const cleanForm = () => {
        setNewName("");
        setNewUnit("kg");
        setNewCategory("general");
        setEditingId(null);
        setIsAdding(false);
    };

    const handleAdd = async () => {
        if (!newName) {
            toast("Name is required", "warning");
            return;
        }
        if (editingId) {
            const { error } = await supabase.from("products").update({
                name: newName, unit: newUnit, category: newCategory
            }).eq('id', editingId);

            if (!error) {
                toast("Product updated", "success");
                fetchProducts();
                cleanForm();
            } else {
                toast("Failed to update", "error");
            }
        } else {
            const { error } = await supabase.from("products").insert([
                { name: newName, unit: newUnit, category: newCategory, is_active: true }
            ]);

            if (!error) {
                toast("Product saved", "success");
                fetchProducts();
                cleanForm();
            } else {
                toast("Failed to save", "error");
            }
        }
    };

    const startEdit = (product: Product) => {
        setNewName(product.name);
        setNewUnit(product.unit);
        setNewCategory(product.category);
        setEditingId(product.id);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (id: string, name: string) => {
        setConfirmConfig({
            isOpen: true,
            title: `Delete "${name}"?`,
            description: "This action cannot be undone immediately, but you can undo within 10 seconds.",
            onConfirm: async () => {
                // Optimistic Remove
                const previousProducts = [...products];
                setProducts(prev => prev.filter(p => p.id !== id));

                const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
                if (!error) {
                    toast("Deleted product", "success", {
                        label: "Undo",
                        onClick: async () => {
                            // Restore
                            setProducts(previousProducts);
                            const { error: restoreError } = await supabase.from("products").update({ is_active: true }).eq("id", id);
                            if (!restoreError) {
                                toast("Restored", "success");
                                fetchProducts();
                            }
                        }
                    }, 10000); // 10s undo
                } else {
                    setProducts(previousProducts); // Revert
                    toast("Failed to delete", "error");
                    fetchProducts();
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
        if (selectedIds.size === products.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(products.map(p => p.id)));
        }
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${selectedIds.size} products?`,
            description: "These products will be marked as inactive.",
            onConfirm: async () => {
                const { error } = await supabase.from("products").update({ is_active: false }).in("id", Array.from(selectedIds));
                if (!error) {
                    toast(`Deleted ${selectedIds.size} products`, "success");
                    toggleSelectionMode();
                    fetchProducts();
                }
            },
            variant: "destructive",
            confirmText: "Delete All"
        });
    };

    // Close menu on ESC or click outside
    useDropdownClose(!!activeMenuId, () => setActiveMenuId(null));

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background pb-28 md:pb-32 w-full md:max-w-2xl md:mx-auto px-3 md:px-4">
            {/* Header */}
            {isSelectionMode ? (
                <div className="fixed top-0 left-0 right-0 z-40 bg-card px-4 py-3 border-b border-border shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button size="icon" variant="ghost" onClick={toggleSelectionMode}>
                            <X size={20} />
                        </Button>
                        <span className="font-bold text-foreground">{selectedIds.size} Selected</span>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                            {selectedIds.size === products.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 px-3 md:px-4 py-3 md:py-4 border-b border-border shadow-sm flex items-center gap-3 md:gap-4">
                    <Link to="/" className="p-2.5 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Link to="/" className="hover:text-primary transition">Home</Link>
                            <span>/</span>
                            <span className="text-primary font-semibold">Products</span>
                        </div>
                        <h1 className="text-2xl font-black text-foreground tracking-tight">Products</h1>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => {
                            if (isAdding) {
                                cleanForm();
                            } else {
                                setNewName("");
                                setNewUnit("kg");
                                setNewCategory("general");
                                setEditingId(null);
                                setIsAdding(true);
                            }
                        }}
                        className={cn(
                            "rounded-full px-5 font-bold shadow-lg transition-all interactive",
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
                {!isAdding && products.length > 0 && (
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            className="w-full pl-10 h-10 md:h-12 rounded-xl bg-accent/50 border-transparent focus:bg-background focus:border-ring transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}

                {isAdding && (
                    <div className="bg-gradient-to-br from-card to-accent/20 border border-border p-4 md:p-5 rounded-2xl mb-5 md:mb-6 shadow-xl animate-in slide-in-from-top-4 ring-1 ring-primary/5 space-y-4 md:space-y-5">
                        <h2 className="font-bold text-foreground text-sm uppercase tracking-wider opacity-70 flex items-center gap-2">
                            {editingId ? <><Tag size={16} /> Edit Product</> : <><Plus size={16} /> New Product</>}
                        </h2>

                        <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block ml-1">Product Name</label>
                            <input
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-semibold text-foreground focus:ring-2 focus:ring-primary outline-none shadow-sm transition-all"
                                placeholder="e.g. Paneer"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block ml-1">Unit</label>
                                <div className="relative">
                                    <select
                                        className="w-full appearance-none bg-background border border-border rounded-xl px-4 py-3 text-base font-medium text-foreground focus:ring-2 focus:ring-primary outline-none shadow-sm transition-all"
                                        value={newUnit}
                                        onChange={(e) => setNewUnit(e.target.value)}
                                    >
                                        <option value="kg">Kilogram (kg)</option>
                                        <option value="ltr">Liter (ltr)</option>
                                        <option value="pcs">Pieces (pcs)</option>
                                        <option value="box">Box</option>
                                        <option value="bottle">Bottle</option>
                                        <option value="packet">Packet</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <Button onClick={handleAdd} className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 interactive mt-2">
                            {editingId ? "Update Product" : "Save Product"}
                        </Button>
                    </div>
                )}

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-24 bg-accent/30 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-2 md:gap-3">
                        {filteredProducts.length === 0 && (
                            <div className="text-center py-16 px-6 text-muted-foreground border-2 border-dashed border-border/60 rounded-3xl bg-accent/10">
                                <div className="bg-accent/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Box size={32} className="opacity-50" />
                                </div>
                                <p className="font-medium">No products found</p>
                                <p className="text-xs opacity-70 mt-1">Add items to your inventory</p>
                            </div>
                        )}

                        {filteredProducts.map((p) => (
                            <div key={p.id} className={cn(
                                "group bg-card p-3 md:p-4 rounded-2xl shadow-sm border border-border/60 transition-all duration-300 relative",
                                isSelectionMode && selectedIds.has(p.id) && "ring-2 ring-primary bg-primary/5",
                                activeMenuId === p.id ? "z-50" : "z-0"
                            )}>
                                {isSelectionMode ? (
                                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleSelection(p.id)}>
                                        <div className="mr-1">
                                            {selectedIds.has(p.id) ? (
                                                <CheckCircle2 className="text-primary fill-primary/20" />
                                            ) : (
                                                <Circle className="text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className={cn(
                                            "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-sm",
                                            p.category === 'ghee' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                        )}>
                                            {p.category === 'ghee' ? <Milk size={20} strokeWidth={2.5} className="md:w-6 md:h-6" /> : <Package size={20} strokeWidth={2.5} className="md:w-6 md:h-6" />}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-base md:text-lg text-foreground leading-tight">{p.name}</h3>
                                            <div className="flex gap-2 mt-1.5 opacity-80">
                                                <span className="text-[10px] uppercase font-bold tracking-widest bg-accent px-2 py-0.5 rounded-md text-muted-foreground">
                                                    {p.unit}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="flex justify-between items-center"
                                        onTouchStart={() => handleTouchStart(p.id, selectedIds.has(p.id))}
                                        onTouchEnd={handleTouchEnd}
                                        onMouseDown={() => handleTouchStart(p.id, selectedIds.has(p.id))}
                                        onMouseUp={handleTouchEnd}

                                        onMouseLeave={handleTouchEnd}
                                    >
                                        <div className="flex items-center gap-3 md:gap-4 flex-1 cursor-pointer" onClick={() => startEdit(p)}>
                                            <div className={cn(
                                                "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105",
                                                p.category === 'ghee' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                            )}>
                                                {p.category === 'ghee' ? <Milk size={20} strokeWidth={2.5} className="md:w-6 md:h-6" /> : <Package size={20} strokeWidth={2.5} className="md:w-6 md:h-6" />}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors leading-tight select-none">{p.name}</h3>
                                                <div className="flex gap-2 mt-1.5 opacity-80">
                                                    <span className="text-[10px] uppercase font-bold tracking-widest bg-accent px-2 py-0.5 rounded-md text-muted-foreground select-none">
                                                        {p.unit}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === p.id ? null : p.id); }}
                                                className="p-2 text-muted-foreground hover:bg-accent rounded-xl transition"
                                            >
                                                <MoreVertical size={20} />
                                            </button>

                                            {activeMenuId === p.id && (
                                                <div
                                                    className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex flex-col p-1">
                                                        <button
                                                            onClick={() => { setActiveMenuId(null); startEdit(p); }}
                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg text-left"
                                                        >
                                                            <Edit2 size={14} /> Edit
                                                        </button>
                                                        <button
                                                            onClick={() => { setActiveMenuId(null); handleDelete(p.id, p.name); }}
                                                            className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg text-left"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                        <div className="h-px bg-border/50 my-1" />
                                                        <button
                                                            onClick={() => {
                                                                setActiveMenuId(null);
                                                                toggleSelectionMode();
                                                                toggleSelection(p.id);
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
            {/* Backdrop for Menu */}

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
