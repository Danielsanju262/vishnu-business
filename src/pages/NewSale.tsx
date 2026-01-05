import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { ArrowLeft, ChevronRight, Package, Search, Plus, Trash2, ShoppingCart, User, X, ArrowRight, Calendar } from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-provider";

type Customer = { id: string; name: string };
type Product = { id: string; name: string; unit: string; category: string };
type CartItem = {
    product: Product;
    quantity: number;
    sellPrice: number;
    buyPrice: number;
};

export default function NewSale() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Workflow State
    const [step, setStep] = useState<"customer" | "cart" | "product" | "details">("customer");

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState("");

    // Tranasction State
    const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    // Temporary Selection State
    const [tempProd, setTempProd] = useState<Product | null>(null);
    const [qty, setQty] = useState("");
    const [sellPrice, setSellPrice] = useState("");
    const [buyPrice, setBuyPrice] = useState("");

    // Inline Add State
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [newItemUnit, setNewItemUnit] = useState("kg");

    useEffect(() => {
        Promise.all([
            supabase.from("customers").select("*").eq('is_active', true).order("name"),
            supabase.from("products").select("*").eq('is_active', true).order("name")
        ]).then(([custRes, prodRes]) => {
            if (custRes.data) setCustomers(custRes.data);
            if (prodRes.data) setProducts(prodRes.data);
        });
    }, []);

    // Fetch Last Price when Product Selected
    useEffect(() => {
        if (selectedCust && tempProd && step === "details") {
            fetchLastTransaction();
        }
    }, [tempProd, step]);

    const fetchLastTransaction = async () => {
        if (!selectedCust || !tempProd) return;

        // Check if already in cart (use that price)
        const inCart = cart.find(i => i.product.id === tempProd.id);
        if (inCart) {
            setSellPrice(inCart.sellPrice.toString());
            setBuyPrice(inCart.buyPrice.toString());
            return;
        }

        const { data } = await supabase.from('transactions')
            .select('sell_price, buy_price')
            .eq('customer_id', selectedCust.id)
            .eq('product_id', tempProd.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            setSellPrice(data.sell_price.toString());
            setBuyPrice(data.buy_price.toString());
        }
    };

    // --- Actions ---

    const handleAddCustomer = async () => {
        if (!newItemName) return;
        const { data, error } = await supabase.from("customers").insert([{ name: newItemName }]).select().single();
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
        const { data, error } = await supabase.from("products").insert([{ name: newItemName, unit: newItemUnit, category: 'general' }]).select().single();
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

        setCart(prev => [...prev.filter(i => i.product.id !== tempProd.id), newItem]);

        // Reset and go back to cart
        setTempProd(null);
        setQty("");
        setSellPrice("");
        setBuyPrice("");
        setStep("cart");
        toast("Added to bill", "success");
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.product.id !== id));
    };

    const confirmSale = async () => {
        if (!selectedCust || cart.length === 0) return;

        const transactions = cart.map(item => ({
            customer_id: selectedCust.id,
            product_id: item.product.id,
            quantity: item.quantity,
            sell_price: item.sellPrice,
            buy_price: item.buyPrice,
            date: date
        }));

        const { error } = await supabase.from("transactions").insert(transactions);
        if (!error) {
            toast("Sale saved successfully!", "success");
            navigate("/");
        } else {
            toast("Failed to save sale", "error");
        }
    };

    // --- Render ---

    return (
        <div className="container mx-auto max-w-lg min-h-screen bg-background flex flex-col animate-in fade-in pb-8">
            {/* Glassmorphism Header */}
            <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm px-4 py-3 flex items-center justify-between transition-all">
                <button
                    onClick={() => {
                        if (step === "details") { setStep("product"); return; }
                        if (step === "product") { setStep("cart"); return; }
                        if (step === "cart") { setStep("customer"); return; }
                        navigate("/");
                    }}
                    className="p-2.5 -ml-2 rounded-full hover:bg-accent hover:text-foreground text-muted-foreground transition interactive active:scale-95"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="font-black text-foreground text-lg tracking-tight">
                    {step === "customer" && "Select Customer"}
                    {step === "cart" && "New Sale"}
                    {step === "product" && "Add Item"}
                    {step === "details" && "Item Details"}
                </div>
                <div className="w-10" /> {/* Spacer */}
            </div>

            <div className="p-4 flex-1 flex flex-col">
                {/* STEP 1: CUSTOMER */}
                {step === "customer" && (
                    <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-3.5 text-muted-foreground" size={20} />
                            <input
                                className="w-full bg-accent/50 border border-border/50 pl-12 pr-4 py-3.5 rounded-2xl focus:ring-2 focus:ring-primary focus:bg-background outline-none text-lg text-foreground transition-all shadow-sm"
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
                                        className="flex-1 bg-background border border-border/50 rounded-xl px-4 py-3 outline-none focus:border-primary font-medium"
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
                            <button onClick={() => { setIsAddingNew(true); setNewItemName(search); }} className="w-full p-4 mb-4 border-2 border-dashed border-border/60 rounded-2xl flex items-center justify-center text-primary font-bold hover:bg-primary/5 hover:border-primary/30 transition interactive text-sm group">
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
                                    className="w-full bg-card p-4 rounded-2xl border border-border/50 flex items-center justify-between shadow-sm hover:shadow-md hover:border-primary/50 hover:bg-accent/50 transition-all interactive group text-left"
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
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 text-white p-5 rounded-3xl mb-6 shadow-xl shadow-slate-900/10 flex justify-between items-center relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <User size={120} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-xs text-slate-300 uppercase font-bold tracking-wider mb-1">Billing To</p>
                                <p className="text-xl font-black">{selectedCust.name}</p>
                            </div>
                            <button onClick={() => setStep("customer")} className="relative z-10 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold backdrop-blur-md transition border border-white/10">
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

                            {cart.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground bg-accent/30 rounded-3xl border-2 border-dashed border-border/60 mb-4">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
                                        <ShoppingCart size={32} />
                                    </div>
                                    <p className="font-semibold text-lg mb-1">Your cart is empty</p>
                                    <p className="text-sm opacity-70">Add items to proceed with sale</p>
                                </div>
                            ) : (
                                <div className="space-y-3 mb-6 relative z-0">
                                    {cart.map((item, idx) => (
                                        <div key={idx} className="bg-card p-4 rounded-2xl border border-border/60 flex justify-between items-center shadow-sm hover:shadow-md transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                    {item.quantity}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground text-sm">{item.product.name}</p>
                                                    <p className="text-xs text-muted-foreground font-medium">{item.product.unit} x ₹{item.sellPrice}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <p className="font-black text-foreground text-lg">₹{(item.quantity * item.sellPrice).toLocaleString()}</p>
                                                <button onClick={() => removeFromCart(item.product.id)} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition opacity-0 group-hover:opacity-100">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => { setStep("product"); setSearch(""); }}
                                className="w-full py-4 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold flex items-center justify-center hover:bg-primary/5 transition interactive active:scale-[0.98] mb-6"
                            >
                                <div className="p-1 bg-primary/20 rounded-full mr-2">
                                    <Plus size={16} />
                                </div>
                                Add Item
                            </button>
                        </div>

                        {/* Summary Footer */}
                        <div className="bg-card border border-border rounded-t-3xl shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] -mx-4 -mb-4 p-6 space-y-5 animate-in slide-in-from-bottom-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-sm text-muted-foreground font-medium mb-1">Total Amount</p>
                                    <h2 className="text-3xl font-black text-foreground tracking-tight">₹ {cart.reduce((acc, item) => acc + (item.quantity * item.sellPrice), 0).toLocaleString()}</h2>
                                </div>
                                <div className="text-right">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-end gap-1 mb-1">
                                        <Calendar size={10} /> Date
                                    </label>
                                    <input
                                        type="date"
                                        className="bg-accent border border-border/50 rounded-lg py-1 px-2 text-xs font-bold text-foreground outline-none focus:ring-1 focus:ring-primary text-right"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Button
                                disabled={cart.length === 0}
                                onClick={confirmSale}
                                className={cn(
                                    "w-full h-14 text-lg font-bold rounded-2xl shadow-xl transition-all transform active:scale-[0.98]",
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

                {/* STEP 3: PRODUCT SELECT */}
                {step === "product" && (
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
                )}

                {/* STEP 4: ITEM DETAILS */}
                {step === "details" && tempProd && (
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
                                            <span className="absolute left-4 top-4 text-muted-foreground font-bold">₹</span>
                                            <input
                                                type="number"
                                                className="w-full bg-accent/50 border border-border/50 rounded-2xl py-3.5 pl-8 pr-4 text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                                                placeholder="0"
                                                value={sellPrice}
                                                onChange={e => setSellPrice(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className={tempProd.category === 'ghee' ? "opacity-50 pointer-events-none" : ""}>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block ml-1">{tempProd.category === 'ghee' ? "Auto Calc" : "Buying Rate"}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-4 text-muted-foreground font-bold">₹</span>
                                            <input
                                                type="number"
                                                className="w-full bg-accent/50 border border-border/50 rounded-2xl py-3.5 pl-8 pr-4 text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
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
                )}
            </div>
        </div>
    );
}
