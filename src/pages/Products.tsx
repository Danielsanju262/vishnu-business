import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Trash2, Plus, Milk, Package, ArrowLeft, Search, Tag, Box, MoreVertical, CheckCircle2, Circle, X, Edit2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";

type Product = {
    id: string;
    name: string;
    unit: string;
    category: string;
};

export default function Products() {
    const { toast, confirm } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
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
    const [searchQuery, setSearchQuery] = useState("");

    // New Product Form
    const [newName, setNewName] = useState("");
    const [newUnit, setNewUnit] = useState("kg");
    const [newCategory, setNewCategory] = useState("general");

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        const { data } = await supabase.from("products").select("*").eq('is_active', true).order("name");
        if (data) setProducts(data);
        setLoading(false);
    };

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
                { name: newName, unit: newUnit, category: newCategory }
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

    const handleDelete = async (id: string, name: string) => {
        if (!await confirm(`Delete "${name}"?`)) return;

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
        if (selectedIds.size === products.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(products.map(p => p.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!await confirm(`Delete ${selectedIds.size} products?`)) return;

        const { error } = await supabase.from("products").update({ is_active: false }).in("id", Array.from(selectedIds));
        if (!error) {
            toast(`Deleted ${selectedIds.size} products`, "success");
            toggleSelectionMode();
            fetchProducts();
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

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background px-4 pt-4 pb-32 animate-in fade-in max-w-lg mx-auto">
            {/* Header */}
            {/* Header */}
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
                            {selectedIds.size === products.length ? "Deselect All" : "Select All"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="relative bg-background -mx-4 px-4 py-4 mb-6 border-b border-border/50 flex items-center gap-4 transition-all">
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
                        onClick={() => { setIsAdding(!isAdding); if (!isAdding) cleanForm(); }}
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
            {!isAdding && products.length > 0 && (
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Search products..."
                        className="w-full pl-10 h-12 rounded-xl bg-accent/50 border-transparent focus:bg-background focus:border-ring transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {isAdding && (
                <div className="bg-gradient-to-br from-card to-accent/20 border border-border p-5 rounded-2xl mb-6 shadow-xl animate-in slide-in-from-top-4 ring-1 ring-primary/5 space-y-5">
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
                <div className="grid gap-3">
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
                            "group bg-card p-4 rounded-2xl shadow-sm border border-border/60 transition-all duration-300 relative",
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
                                        "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                                        p.category === 'ghee' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    )}>
                                        {p.category === 'ghee' ? <Milk size={20} strokeWidth={2.5} /> : <Package size={20} strokeWidth={2.5} />}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-foreground leading-tight">{p.name}</h3>
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
                                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => {
                                        setNewName(p.name);
                                        setNewUnit(p.unit);
                                        setNewCategory(p.category);
                                        setEditingId(p.id);
                                        setIsAdding(true);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}>
                                        <div className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 select-none",
                                            p.category === 'ghee' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                        )}>
                                            {p.category === 'ghee' ? <Milk size={24} strokeWidth={2.5} /> : <Package size={24} strokeWidth={2.5} />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors leading-tight select-none">{p.name}</h3>
                                            <div className="flex gap-2 mt-1.5 align-middle select-none">
                                                <span className="text-[10px] uppercase font-bold tracking-widest bg-accent px-2 py-0.5 rounded-md text-muted-foreground">
                                                    {p.unit}
                                                </span>
                                                {p.category === 'ghee' && (
                                                    <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 px-2 py-0.5 rounded-md">
                                                        Ghee
                                                    </span>
                                                )}
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
                                            <div className="absolute right-0 top-full mt-1 w-36 bg-card dark:bg-zinc-900 border border-border rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 ring-1 ring-black/5">
                                                <div className="flex flex-col p-1">
                                                    <button
                                                        onClick={() => {
                                                            setActiveMenuId(null);
                                                            setNewName(p.name);
                                                            setNewUnit(p.unit);
                                                            setNewCategory(p.category);
                                                            setEditingId(p.id);
                                                            setIsAdding(true);
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
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
