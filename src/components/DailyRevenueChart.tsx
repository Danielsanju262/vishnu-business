
import { useRef, useEffect, useState } from "react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { BarChart3, X } from "lucide-react";

interface DailyRevenueChartProps {
    summaryStats: any;
    selectedChartDay: string | null;
    setSelectedChartDay: (date: string | null) => void;
}

export function DailyRevenueChart({ summaryStats, selectedChartDay, setSelectedChartDay }: DailyRevenueChartProps) {
    const [chartMetric, setChartMetric] = useState<'revenue' | 'profit'>('revenue');

    const maxDataValue = Math.max(...summaryStats.dailyData.map((d: any) =>
        chartMetric === 'revenue' ? d.revenue : Math.abs(d.profit)
    ), 1);
    const chartMax = maxDataValue * 1.5;
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll to specific day (today) or end on mount
    useEffect(() => {
        if (scrollContainerRef.current) {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const todayIndex = summaryStats.dailyData.findIndex((d: any) => d.date === todayStr);

            if (todayIndex !== -1) {
                // Determine bar width based on data length (matching render logic)
                const barWidth = summaryStats.dailyData.length > 20 ? 32 : 40;
                const gap = 8; // gap-2
                const paddingLeft = 8; // px-2

                // Calculate the right edge position of today's bar
                const targetRightEdge = paddingLeft + (todayIndex * (barWidth + gap)) + barWidth;

                // We want this right edge to be at the right side of the container (plus a small buffer)
                const containerWidth = scrollContainerRef.current.clientWidth;
                const buffer = 8; // right padding buffer
                const targetScroll = targetRightEdge - containerWidth + buffer;

                scrollContainerRef.current.scrollLeft = Math.max(0, targetScroll);
            } else {
                // If today is not in list (e.g. past range), scroll to end for implied "latest" data
                scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
            }
        }
    }, [summaryStats.dailyData]);

    return (
        <div
            className="bg-card rounded-2xl border border-border/60 p-4 shadow-sm"
            onClick={() => setSelectedChartDay(null)}
        >
            <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <BarChart3 size={16} className="text-purple-500" />
                        Daily {chartMetric === 'revenue' ? 'Revenue' : 'Profit'}
                    </h3>

                    <div className="flex bg-muted/50 p-1 rounded-lg">
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('revenue'); }}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'revenue' ? "bg-emerald-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            Sales
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('profit'); }}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'profit' ? "bg-blue-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            Profit
                        </button>
                    </div>
                </div>

                {selectedChartDay ? (() => {
                    const selectedDayData = summaryStats.dailyData.find((d: any) => d.date === selectedChartDay);
                    return selectedDayData ? (
                        <div className="bg-muted/40 rounded-xl p-3 flex items-center justify-between animate-in slide-in-from-top-2 fade-in duration-200">
                            <div>
                                <p className="text-lg font-bold text-muted-foreground mb-0.5">{selectedDayData.label}</p>
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Sales</span>
                                        <span className="text-xl font-black text-foreground">₹{selectedDayData.revenue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground">{selectedDayData.profit >= 0 ? 'Profit' : 'Loss'}</span>
                                        <span className={cn("text-xl font-black", selectedDayData.profit >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                            ₹{Math.abs(selectedDayData.profit).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedChartDay(null); }}
                                className="p-2 hover:bg-background rounded-full transition-colors"
                            >
                                <X size={18} className="text-muted-foreground" />
                            </button>
                        </div>
                    ) : null;
                })() : null}
            </div>

            <div className="flex h-[180px] w-full gap-2">
                {/* Y-Axis Labels (Fixed Left Column) */}
                <div className="flex flex-col justify-between h-full w-[45px] flex-shrink-0 pb-[20px] text-[9px] font-bold text-muted-foreground pt-1">
                    <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax).toLocaleString()}</span></div>
                    <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax * 0.66).toLocaleString()}</span></div>
                    <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax * 0.33).toLocaleString()}</span></div>
                    <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹0</span></div>
                </div>

                {/* Chart Area (Scrollable) */}
                <div className="relative flex-1 h-full min-w-0">
                    {/* Fixed Grid Lines inside the chart area */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[20px] w-full z-0">
                        <div className="w-full border-t border-dashed border-muted/30 h-0"></div>
                        <div className="w-full border-t border-dashed border-muted/30 h-0"></div>
                        <div className="w-full border-t border-dashed border-muted/30 h-0"></div>
                        <div className="w-full border-t border-border/50 h-0"></div>
                    </div>

                    {/* Scrollable Bars */}
                    <div
                        ref={scrollContainerRef}
                        className="absolute inset-0 overflow-x-auto no-scrollbar z-10"
                    >
                        <div className="flex items-end gap-2 h-full pb-[20px] px-2 min-w-full w-max">
                            {summaryStats.dailyData.map((day: any) => {
                                const value = chartMetric === 'revenue' ? day.revenue : day.profit;
                                const displayValue = Math.abs(value);
                                const barHeight = Math.max((displayValue / chartMax) * 100, 4);
                                const isSelected = selectedChartDay === day.date;
                                // Width logic: Minimum 32px for 30 days to be touchable
                                const barWidth = summaryStats.dailyData.length > 20 ? '32px' : '40px';

                                // Determine bar color
                                let barGradient = "bg-muted";
                                let selectedGradient = "from-purple-600 to-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)] ring-2 ring-purple-500/50";

                                if (chartMetric === 'revenue') {
                                    if (value > 0) barGradient = "bg-gradient-to-t from-emerald-600 to-emerald-400";
                                } else {
                                    if (value > 0) barGradient = "bg-gradient-to-t from-emerald-600 to-emerald-400";
                                    else if (value < 0) barGradient = "bg-gradient-to-t from-rose-600 to-rose-400";
                                }

                                return (
                                    <div
                                        key={day.date}
                                        className="flex flex-col items-center group relative h-full justify-end flex-shrink-0"
                                        style={{ width: barWidth }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedChartDay(day.date === selectedChartDay ? null : day.date);
                                        }}
                                    >
                                        {/* Tooltip */}
                                        <div className={cn(
                                            "absolute bottom-full mb-1 flex-col items-center z-30 transition-all duration-200 pointer-events-none",
                                            isSelected ? "flex scale-100 opacity-100" : "hidden group-hover:flex scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                                        )}>
                                            <div className={cn(
                                                "bg-zinc-900 dark:bg-zinc-800 text-white text-[10px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap border border-white/10",
                                                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                            )}>
                                                <p className="font-bold text-xs mb-0.5">{day.label}</p>
                                                <p className="font-medium">Sales: <span className="text-emerald-400">₹{day.revenue.toLocaleString()}</span></p>
                                                <p className="text-muted-foreground">Profit: <span className={cn(day.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>₹{day.profit.toLocaleString()}</span></p>
                                            </div>
                                            <div className="w-2.5 h-2.5 bg-zinc-900 dark:bg-zinc-800 rotate-45 -mt-1 border-r border-b border-white/10"></div>
                                        </div>

                                        {/* Bar */}
                                        <div
                                            className={cn(
                                                "w-full rounded-t-lg transition-all duration-300 cursor-pointer relative",
                                                displayValue > 0 ? barGradient : "bg-muted",
                                                isSelected && selectedGradient
                                            )}
                                            style={{ height: `${barHeight}%` }}
                                        >
                                            {/* Value Label */}
                                            {displayValue > 0 && (
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                                                    <span className="inline-block bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                                        {(displayValue >= 1000) ?
                                                            `${(displayValue / 1000).toFixed(1)}k` :
                                                            displayValue
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* X-Axis Label */}
                                        <div className="absolute top-full mt-2 w-full text-center">
                                            <p className={cn(
                                                "text-[9px] truncate transition-colors font-medium",
                                                isSelected ? "text-primary font-bold" : "text-muted-foreground"
                                            )}>
                                                {summaryStats.dailyData.length <= 7 ? format(new Date(day.date), 'EEE') : format(new Date(day.date), 'dd')}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
