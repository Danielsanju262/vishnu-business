import { format } from "date-fns";
import { X, ArrowDownLeft, TrendingUp, Wallet } from "lucide-react";
import { cn } from "../lib/utils";
import { Modal } from "./ui/Modal";

export type BreakdownItem = {
    id: string;
    date: string;
    type: 'cash_profit' | 'partial_payment' | 'collection';
    customerName: string;
    amount: number;
    originalTotal?: number; // For context (e.g. Total Sale Value)
};

interface CashInHandBreakdownProps {
    isOpen: boolean;
    onClose: () => void;
    items: BreakdownItem[];
    total: number;
    dateLabel: string;
}

export function CashInHandBreakdown({ isOpen, onClose, items, total, dateLabel }: CashInHandBreakdownProps) {
    // Sort items by date (newest first)
    const sortedItems = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex flex-col gap-1">
                    <span className="text-lg font-bold">Cash/Profit Breakdown</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{dateLabel}</span>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Header Summary */}
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 text-center">
                    <p className="text-xs text-sky-600 dark:text-sky-400 font-bold uppercase tracking-wider mb-1">
                        Total Cash In Hand
                    </p>
                    <p className="text-3xl font-black text-sky-600 dark:text-sky-400">
                        ₹{total.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-2 px-4 leading-relaxed">
                        Includes <b>Profits</b> from full cash sales, <b>Received Amounts</b> from partial sales, and <b>Debt Collections</b>.
                    </p>
                </div>

                {/* List */}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto min-h-[200px] pr-1">
                    {sortedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Wallet size={48} strokeWidth={1} className="mb-4 opacity-20" />
                            <p className="font-medium">No cash entries found</p>
                            <p className="text-xs opacity-60">Try selecting a different date range</p>
                        </div>
                    ) : (
                        sortedItems.map((item, idx) => (
                            <div
                                key={`${item.id}-${idx}`}
                                className="flex items-center justify-between p-3.5 bg-card border border-border/60 hover:border-sky-500/30 rounded-xl transition-colors group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg mt-0.5",
                                        item.type === 'collection'
                                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                            : "bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                                    )}>
                                        {item.type === 'collection' ? (
                                            <ArrowDownLeft size={16} strokeWidth={2.5} />
                                        ) : (
                                            <TrendingUp size={16} strokeWidth={2.5} />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-foreground">
                                            {item.customerName}
                                        </p>
                                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mt-0.5">
                                            <span>{format(new Date(item.date), 'dd MMM')}</span>
                                            <span className="w-0.5 h-0.5 bg-muted-foreground/40 rounded-full" />
                                            <span>
                                                {item.type === 'cash_profit' && 'Profit (Cash Sale)'}
                                                {item.type === 'partial_payment' && 'Partial Payment'}
                                                {item.type === 'collection' && 'Debt Collection'}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-foreground">
                                        ₹{item.amount.toLocaleString()}
                                    </p>
                                    {item.type === 'cash_profit' && item.originalTotal && (
                                        <p className="text-[10px] text-muted-foreground">
                                            Sale: ₹{item.originalTotal.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Modal>
    );
}
