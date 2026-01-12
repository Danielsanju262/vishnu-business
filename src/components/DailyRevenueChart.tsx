
import { useRef, useEffect, useState } from "react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { BarChart3, X } from "lucide-react";

interface DailyRevenueChartProps {
    chartData: any[]; // Decoupled from summaryStats
    selectedChartDay: string | null;
    setSelectedChartDay: (date: string | null) => void;
    aggregation?: 'day' | 'week' | 'month';
}

export function DailyRevenueChart({ chartData, selectedChartDay, setSelectedChartDay, aggregation = 'day' }: DailyRevenueChartProps) {
    const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'margin'>('revenue');

    const maxDataValue = Math.max(...chartData.map((d: any) => {
        if (chartMetric === 'margin') {
            return d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
        }
        return chartMetric === 'revenue' ? d.revenue : Math.abs(d.profit);
    }), 1);

    // For margin, cap at 100 usually, but let it flow if super high profit? standardized to 100 is better for %, 
    // but simplified: if metric is margin, use 100 as fixed scale or max observed? 
    // Let's use max observed but at least 100 if it's small, to keep 0-100 scale feeling right.
    const chartMax = chartMetric === 'margin' ? Math.max(maxDataValue, 100) : maxDataValue * 1.25; // Adjusted buffer to 1.25 for label space

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll to specific day (today) or end on mount
    useEffect(() => {
        if (scrollContainerRef.current) {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const todayIndex = chartData.findIndex((d: any) => d.date === todayStr);

            if (todayIndex !== -1) {
                // Determine bar width based on data length (matching render logic)
                const barWidth = chartData.length > 20 ? 32 : 40;
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
    }, [chartData]);

    const titlePrefix = aggregation === 'week' ? 'Weekly' : aggregation === 'month' ? 'Monthly' : 'Daily';
    const metricLabel = chartMetric === 'revenue' ? 'Revenue' : chartMetric === 'profit' ? 'Profit' : 'Margin';

    return (
        <div
            className="bg-card rounded-2xl border border-border/60 p-4 shadow-sm"
            onClick={() => setSelectedChartDay(null)}
        >
            <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <BarChart3 size={16} className="text-purple-500" />
                        {titlePrefix} {metricLabel}
                    </h3>

                    <div className="flex bg-muted/50 p-1 rounded-lg">
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('revenue'); }}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'revenue' ? "bg-blue-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            Sales
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('profit'); }}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'profit' ? "bg-emerald-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            Profit
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('margin'); }}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'margin' ? "bg-amber-500 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            Margin
                        </button>
                    </div>
                </div>

                {selectedChartDay ? (() => {
                    const selectedDayData = chartData.find((d: any) => d.date === selectedChartDay);
                    let marginVal = 0;
                    if (selectedDayData && selectedDayData.revenue > 0) {
                        marginVal = (selectedDayData.profit / selectedDayData.revenue) * 100;
                    }

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
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Margin</span>
                                        <span className={cn("text-xl font-black", marginVal >= 0 ? "text-amber-500" : "text-rose-500")}>
                                            {marginVal.toFixed(1)}%
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
                    {chartMetric === 'margin' ? (
                        <>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">{Math.round(chartMax)}%</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">{Math.round(chartMax * 0.66)}%</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">{Math.round(chartMax * 0.33)}%</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">0%</span></div>
                        </>
                    ) : (
                        <>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax).toLocaleString()}</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax * 0.66).toLocaleString()}</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹{Math.round(chartMax * 0.33).toLocaleString()}</span></div>
                            <div className="relative h-0 w-full text-right"><span className="absolute -top-2 right-0">₹0</span></div>
                        </>
                    )}
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
                            {chartData.map((day: any) => {
                                let value;
                                if (chartMetric === 'margin') {
                                    value = day.revenue > 0 ? (day.profit / day.revenue) * 100 : 0;
                                } else {
                                    value = chartMetric === 'revenue' ? day.revenue : day.profit;
                                }

                                const displayValue = Math.abs(value);
                                const barHeight = Math.max((displayValue / chartMax) * 100, 8); // Min height increased to 8% for visibility // Min 4% height
                                const isSelected = selectedChartDay === day.date;
                                // Width logic: Minimum 32px for 30 days to be touchable
                                const barWidth = chartData.length > 20 ? '32px' : '40px';

                                // Determine bar color
                                let barGradient = "bg-muted";
                                let selectedGradient = "ring-2"; // default

                                if (chartMetric === 'revenue') {
                                    if (value > 0) barGradient = "bg-gradient-to-t from-blue-600 to-blue-400";
                                    selectedGradient = "from-blue-600 to-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] ring-2 ring-blue-500/50";
                                } else if (chartMetric === 'profit') {
                                    if (value > 0) barGradient = "bg-gradient-to-t from-emerald-600 to-emerald-400";
                                    else if (value < 0) {
                                        barGradient = "bg-gradient-to-t from-rose-600 to-rose-400";
                                        selectedGradient = "from-rose-600 to-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)] ring-2 ring-rose-500/50";
                                    } else { // 0 profit
                                        selectedGradient = "from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-2 ring-emerald-500/50";
                                    }
                                } else if (chartMetric === 'margin') {
                                    if (value > 0) barGradient = "bg-gradient-to-t from-amber-500 to-amber-300";
                                    else if (value < 0) {
                                        barGradient = "bg-gradient-to-t from-rose-600 to-rose-400";
                                        selectedGradient = "from-rose-600 to-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)] ring-2 ring-rose-500/50";
                                    } else {
                                        selectedGradient = "from-amber-500 to-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)] ring-2 ring-amber-500/50";
                                    }
                                }

                                const marginHere = day.revenue > 0 ? ((day.profit / day.revenue) * 100) : 0;

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
                                                <p className="font-medium">Sales: <span className="text-blue-400">₹{day.revenue.toLocaleString()}</span></p>
                                                <p className="font-medium">Profit: <span className={cn(day.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>₹{day.profit.toLocaleString()}</span></p>
                                                <p className="font-medium">Margin: <span className={cn(marginHere >= 0 ? "text-amber-400" : "text-rose-400")}>{marginHere.toFixed(1)}%</span></p>
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
                                                        {chartMetric === 'margin' ?
                                                            `${displayValue.toFixed(0)}%` :
                                                            ((displayValue >= 1000) ? `${(displayValue / 1000).toFixed(1)}k` : displayValue)
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
                                                {day.axisLabel || (chartData.length <= 7 ? format(new Date(day.date), 'EEE') : format(new Date(day.date), 'dd'))}
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
