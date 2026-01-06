import { useState, createContext, useContext } from "react";
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { cn } from "../lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface ConfirmOptions {
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'default';
}

interface ToastContextType {
    toast: (message: string, type?: ToastType, action?: { label: string, onClick: () => void }, duration?: number) => void;
    confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmState, setConfirmState] = useState<{
        message: string;
        options?: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const toast = (message: string, type: ToastType = "info", action?: { label: string, onClick: () => void }, duration: number = 5000) => {
        const id = Date.now().toString();

        // Wrap onClick to dismiss toast
        const wrappedAction = action ? {
            ...action,
            onClick: () => {
                action.onClick();
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }
        } : undefined;

        setToasts((prev) => [...prev, { id, message, type, action: wrappedAction }]);

        // Auto dismiss
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    };

    const confirm = (message: string, options?: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({ message, options, resolve });
        });
    };

    const handleConfirm = (result: boolean) => {
        confirmState?.resolve(result);
        setConfirmState(null);
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case "success": return <CheckCircle className="text-emerald-500" size={20} />;
            case "error": return <AlertTriangle className="text-rose-500" size={20} />;
            case "warning": return <AlertTriangle className="text-amber-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    return (
        <ToastContext.Provider value={{ toast, confirm }}>
            {children}

            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[110] space-y-2 max-w-sm w-full">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cn(
                            "flex items-center gap-3 p-4 rounded-xl shadow-2xl border-2 animate-in slide-in-from-right relative overflow-hidden",
                            "bg-surface-elevation-3 dark:bg-zinc-900 border-border z-[120]"
                        )}
                    >
                        {getIcon(t.type)}
                        <div className="flex-1">
                            <p className="text-sm font-medium">{t.message}</p>
                            {t.action && (
                                <button
                                    onClick={t.action.onClick}
                                    className="mt-1.5 text-xs font-bold text-primary hover:underline block"
                                >
                                    {t.action.label}
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                            className="text-muted-foreground hover:text-foreground p-1 self-start"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Confirm Modal */}
            {confirmState && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl max-w-sm mx-4 animate-in zoom-in-95 w-full">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                                <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-foreground mb-1">Confirm Action</h3>
                                <p className="text-muted-foreground text-sm">{confirmState.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-foreground font-medium hover:bg-accent transition"
                            >
                                {confirmState.options?.cancelText || "Cancel"}
                            </button>
                            <button
                                onClick={() => handleConfirm(true)}
                                className={cn(
                                    "flex-1 px-4 py-2.5 rounded-xl text-white font-medium transition shadow-lg",
                                    confirmState.options?.variant === 'default'
                                        ? "bg-primary hover:bg-primary/90 shadow-primary/20"
                                        : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20"
                                )}
                            >
                                {confirmState.options?.confirmText || "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ToastContext.Provider>
    );
}
