import { useState, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

interface CalendarProps {
    selectedDate?: Date | null;
    onSelect: (date: Date) => void;
    minDate?: Date;
    maxDate?: Date;
    className?: string;
    title?: string;
    showOutsideDays?: boolean;
}

export function Calendar({ selectedDate, onSelect, minDate, maxDate, className, title, showOutsideDays = false }: CalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

    const days = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart);
        const calendarEnd = endOfWeek(monthEnd);

        return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }, [currentMonth]);

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    const isDateDisabled = (date: Date) => {
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    };

    return (
        <div className={cn("p-3 bg-card rounded-xl border border-border shadow-sm", className)}>
            {title && <div className="text-sm font-bold text-center mb-2">{title}</div>}

            <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={handlePrevMonth} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-semibold">
                    {format(currentMonth, 'MMMM yyyy')}
                </div>
                <Button variant="ghost" size="sm" onClick={handleNextMonth} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-7 mb-2">
                {weekDays.map(day => (
                    <div key={day} className="text-center text-[10px] font-medium text-muted-foreground uppercase">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isDisabled = isDateDisabled(day);
                    const isTodayDate = isToday(day);

                    if (!showOutsideDays && !isCurrentMonth) return <div key={idx} />;

                    return (
                        <Button
                            key={idx}
                            variant="ghost"
                            size="sm"
                            onClick={() => !isDisabled && onSelect(day)}
                            disabled={isDisabled}
                            className={cn(
                                "h-8 w-full p-0 font-normal text-xs",
                                !isCurrentMonth && "text-muted-foreground/30",
                                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                                isTodayDate && !isSelected && "text-primary font-bold bg-primary/10",
                                isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {format(day, 'd')}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
