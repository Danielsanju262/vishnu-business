import { useState } from 'react';
import { Calendar } from './Calendar';
import { Button } from './Button';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';

interface CustomDateRangePickerProps {
    initialStartDate: string; // yyyy-MM-dd
    initialEndDate: string;   // yyyy-MM-dd
    onApply: (start: string, end: string) => void;
    onCancel?: () => void;
}

export function CustomDateRangePicker({ initialStartDate, initialEndDate, onApply, onCancel }: CustomDateRangePickerProps) {
    const [step, setStep] = useState<'start' | 'end'>('start');
    const [start, setStart] = useState<Date>(new Date(initialStartDate));
    const [end, setEnd] = useState<Date>(new Date(initialEndDate));

    const handleStartSelect = (date: Date) => {
        setStart(date);
        // Automatically move to end date selection
        // If previously selected end date is invalid (before new start), reset it
        if (end < date) {
            setEnd(date);
        }
        setStep('end');
    };

    const handleEndSelect = (date: Date) => {
        setEnd(date);
    };

    return (
        <div className="flex flex-col gap-3 min-w-[300px]">
            {/* Range Display / Toggle */}
            <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border/50">
                <div
                    onClick={() => setStep('start')}
                    className={cn(
                        "flex-1 p-2 rounded-lg text-center cursor-pointer transition-all border border-transparent",
                        step === 'start' ? "bg-background shadow-sm border-border text-foreground" : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                    )}
                >
                    <div className="text-[10px] uppercase font-bold tracking-wider mb-0.5">Start</div>
                    <div className="text-sm font-black">{format(start, 'dd MMM')}</div>
                </div>

                <div className="text-muted-foreground/50">
                    <ArrowLeft size={14} className="rotate-180" />
                </div>

                <div
                    onClick={() => setStep('end')}
                    className={cn(
                        "flex-1 p-2 rounded-lg text-center cursor-pointer transition-all border border-transparent",
                        step === 'end' ? "bg-background shadow-sm border-border text-foreground" : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                    )}
                >
                    <div className="text-[10px] uppercase font-bold tracking-wider mb-0.5">End</div>
                    <div className="text-sm font-black">{format(end, 'dd MMM')}</div>
                </div>
            </div>

            {/* Calendar Area */}
            <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                {step === 'start' ? (
                    <div className="space-y-2">
                        <Calendar
                            selectedDate={start}
                            onSelect={handleStartSelect}
                            title="Select Start Date"
                            className="border-0 shadow-none bg-transparent p-0"
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Calendar
                            selectedDate={end}
                            onSelect={handleEndSelect}
                            minDate={start}
                            title="Select End Date"
                            className="border-0 shadow-none bg-transparent p-0"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStep('start')}
                            className="w-full flex items-center justify-center gap-2 text-xs h-9 bg-background/50"
                        >
                            <ArrowLeft size={14} /> Back to Start Date
                        </Button>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-border/50 flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="flex-1 text-muted-foreground hover:text-foreground"
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    onClick={() => onApply(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'))}
                    className="flex-[2] gap-2 bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                >
                    Apply Range
                </Button>
            </div>
        </div>
    );
}
