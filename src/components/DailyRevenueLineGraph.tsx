
import { useRef, useEffect, useState } from "react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { X, TrendingUp } from "lucide-react";

interface DailyRevenueLineGraphProps {
    chartData: any[]; // Decoupled from summaryStats
    selectedChartDay: string | null;
    setSelectedChartDay: (date: string | null) => void;
}


export function DailyRevenueLineGraph({ chartData, selectedChartDay, setSelectedChartDay }: DailyRevenueLineGraphProps) {
    const [chartMetric, setChartMetric] = useState<'revenue' | 'profit' | 'margin'>('profit');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const prevMetricRef = useRef(chartMetric);

    // Smooth transition when metric changes
    useEffect(() => {
        if (prevMetricRef.current !== chartMetric) {
            setIsTransitioning(true);
            const timer = setTimeout(() => setIsTransitioning(false), 350);
            prevMetricRef.current = chartMetric;
            return () => clearTimeout(timer);
        }
    }, [chartMetric]);

    const maxDataValue = Math.max(...chartData.map((d: any) => {
        if (chartMetric === 'margin') {
            return d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
        }
        return chartMetric === 'revenue' ? d.revenue : Math.abs(d.profit);
    }), 1);

    // For margin, cap at 100 usually, but let it flow if super high profit? standardized to 100 is better for %, 
    // but simplified: if metric is margin, use 100 as fixed scale or max observed? 
    // Let's use max observed but at least 100 if it's small, to keep 0-100 scale feeling right.
    const chartMaxRaw = chartMetric === 'margin' ? Math.max(maxDataValue, 100) : maxDataValue * 1.05;

    // Helper for nice ticks
    const getNiceTicks = (max: number) => {
        if (chartMetric === 'margin') return [0, 50, 100];

        const tickCount = 4;
        const roughStep = max / (tickCount - 1);

        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const normalizedStep = roughStep / magnitude;

        let niceStep;
        if (normalizedStep < 1.5) niceStep = 1;
        else if (normalizedStep < 3) niceStep = 2;
        else if (normalizedStep < 7) niceStep = 5;
        else niceStep = 10;

        const step = niceStep * magnitude;

        const ticks = [];
        for (let i = 0; i < tickCount; i++) {
            ticks.push(i * step);
        }
        if (ticks[ticks.length - 1] < max) {
            ticks.push(ticks[ticks.length - 1] + step);
        }
        return ticks;
    };

    const yTicks = getNiceTicks(chartMaxRaw);
    const yMax = yTicks[yTicks.length - 1];

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll to end to ensure last point is visible - with proper timing
    useEffect(() => {
        if (scrollContainerRef.current && chartData.length > 0) {
            // Delay scroll until after transition completes (400ms = 350ms transition + 50ms buffer)
            const scrollTimer = setTimeout(() => {
                // Use requestAnimationFrame to ensure DOM is fully rendered
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (scrollContainerRef.current) {
                            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
                        }
                    });
                });
            }, isTransitioning ? 400 : 0); // Only delay if transitioning

            return () => clearTimeout(scrollTimer);
        }
    }, [chartData, isTransitioning]); // Scroll when data changes


    const titlePrefix = 'Daily';
    const metricLabel = chartMetric === 'revenue' ? 'Revenue' : chartMetric === 'profit' ? 'Profit' : 'Margin';

    // Filter out ONLY future dates. Keep past dates even if they have 0 data.
    const effectiveData = chartData.filter(d => {
        const date = new Date(d.date);
        const today = new Date();
        // Reset time for accurate comparison
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        return date <= today;
    });

    // Generate SVG path for smoothed line
    const getPathData = () => {
        if (effectiveData.length === 0) return "";

        const pointWidth = 50; // Increased spacing for labels
        const paddingLeft = 10;
        const height = 120; // Reduced height to fit labels above
        const topPadding = 20; // Space for labels

        const points = effectiveData.map((d: any, index: number) => {
            let value;
            if (chartMetric === 'margin') {
                value = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
            } else {
                value = chartMetric === 'revenue' ? d.revenue : d.profit;
            }
            const normalizedValue = Math.max(0, Math.min(Math.abs(value), yMax)); // Clip to max
            const y = topPadding + (height - ((normalizedValue / yMax) * height));
            const x = paddingLeft + (index * pointWidth);
            return { x, y, value, date: d.date, label: d.label, axisLabel: d.axisLabel, originalData: d };
        });

        // Generate smooth curve (Catmull-Rom spline or simple bezier)
        // Let's use a simple cubic bezier smoothing
        if (points.length === 1) {
            return { path: `M ${points[0].x} ${points[0].y} h 10`, points }; // Simple line for single point
        }

        let path = `M ${points[0].x} ${points[0].y}`;

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];

            // Control points for smooth curve
            const cp1x = p0.x + (p1.x - p0.x) / 3;
            const cp1y = p0.y;
            const cp2x = p1.x - (p1.x - p0.x) / 3;
            const cp2y = p1.y;

            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
        }

        // Create area fill path (closed loop)
        const areaPath = `${path} L ${points[points.length - 1].x} ${height + topPadding} L ${points[0].x} ${height + topPadding} Z`;

        return { path, areaPath, points };
    };

    const { path, areaPath, points } = getPathData() || { path: "", areaPath: "", points: [] };
    const chartWidth = points.length > 0 ? points[points.length - 1].x + 60 : 100; // Increased padding for last point visibility

    // Colors
    let strokeColor = "#3b82f6"; // Blue (Revenue)
    let fillColor = "url(#blueGradient)";

    if (chartMetric === 'profit') {
        const totalProfit = chartData.reduce((acc, d) => acc + d.profit, 0);
        strokeColor = totalProfit >= 0 ? "#10b981" : "#f43f5e"; // Emerald or Rose
        fillColor = totalProfit >= 0 ? "url(#emeraldGradient)" : "url(#roseGradient)";
    } else if (chartMetric === 'margin') {
        strokeColor = "#f59e0b"; // Amber
        fillColor = "url(#amberGradient)";
    }


    return (
        <div
            className="w-full mt-4"
            onClick={() => setSelectedChartDay(null)}
        >
            <div className="flex flex-col gap-3 mb-4 px-1">
                {/* Row 1: Title and Metric Toggles */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-white/50" />
                        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{titlePrefix} {metricLabel}</span>
                    </div>

                    <div className="flex bg-black/20 p-0.5 rounded-lg backdrop-blur-md border border-white/5">
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('revenue'); }}
                            className={cn(
                                "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'revenue' ? "bg-blue-500/20 text-blue-200 shadow-sm ring-1 ring-blue-500/30" : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            Sales
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('profit'); }}
                            className={cn(
                                "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'profit' ?
                                    (chartData.reduce((acc, d) => acc + d.profit, 0) >= 0 ? "bg-emerald-500/20 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30" : "bg-rose-500/20 text-rose-200 shadow-sm ring-1 ring-rose-500/30")
                                    : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            Profit
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setChartMetric('margin'); }}
                            className={cn(
                                "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                                chartMetric === 'margin' ? "bg-amber-500/20 text-amber-200 shadow-sm ring-1 ring-amber-500/30" : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            Margin
                        </button>
                    </div>
                </div>
            </div>



            {
                selectedChartDay ? (() => {
                    const selectedDayData = chartData.find((d: any) => d.date === selectedChartDay);
                    let marginVal = 0;
                    if (selectedDayData && selectedDayData.revenue > 0) {
                        marginVal = (selectedDayData.profit / selectedDayData.revenue) * 100;
                    }

                    return selectedDayData ? (
                        <div className="bg-black/20 border border-white/5 backdrop-blur-md rounded-xl p-3 flex items-center justify-between animate-in slide-in-from-top-2 fade-in duration-200 mb-2 mx-1">
                            <div>
                                <p className="text-sm font-bold text-white/70 mb-0.5">{selectedDayData.label}</p>
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[10px] uppercase font-bold text-white/40">Sales</span>
                                        <span className="text-sm font-black text-white">₹{selectedDayData.revenue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[10px] uppercase font-bold text-white/40">{selectedDayData.profit >= 0 ? 'Profit' : 'Loss'}</span>
                                        <span className={cn("text-sm font-black", selectedDayData.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                            ₹{Math.abs(selectedDayData.profit).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[10px] uppercase font-bold text-white/40">Margin</span>
                                        <span className={cn("text-sm font-black", marginVal >= 0 ? "text-amber-400" : "text-rose-400")}>
                                            {marginVal.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedChartDay(null); }}
                                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X size={14} className="text-white/60" />
                            </button>
                        </div>
                    ) : null;
                })() : null
            }


            {/* Chart with Smooth Transitions */}
            <div className="flex h-[180px] w-full gap-2">
                {/* Y-Axis Labels (Fixed Left Column) */}
                <div
                    className={cn(
                        "flex flex-col justify-between h-full w-[40px] flex-shrink-0 pb-[36px] text-[9px] font-bold text-white/40 pt-[20px]",
                        "transition-opacity duration-300 ease-in-out",
                        isTransitioning ? "opacity-40" : "opacity-100"
                    )}
                >
                    {yTicks.slice().reverse().map((tick) => (
                        <div key={tick} className="relative h-0 w-full text-right">
                            <span className="absolute -top-1.5 right-0 block w-full">
                                {chartMetric === 'margin' ? `${tick}%` :
                                    (tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick)}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="relative flex-1 h-full min-w-0">
                    {/* Scrollable Graph Area */}
                    <div
                        ref={scrollContainerRef}
                        className="absolute inset-0 overflow-x-auto no-scrollbar z-10"
                        style={{ scrollBehavior: 'smooth' }}
                    >
                        <div
                            className={cn(
                                "min-w-full h-full relative",
                                "transition-all duration-500 ease-in-out"
                            )}
                            style={{ width: Math.max(chartWidth, 100) }}
                        >
                            <svg
                                width={chartWidth}
                                height="180"
                                className={cn(
                                    "overflow-visible",
                                    "transition-opacity duration-300 ease-in-out",
                                    isTransitioning ? "opacity-60" : "opacity-100"
                                )}
                            >
                                <defs>
                                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                    </linearGradient>
                                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                    </linearGradient>
                                    <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                    </linearGradient>
                                    <linearGradient id="amberGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {/* Grid Lines */}
                                {yTicks.map((tick: number) => {
                                    const height = 120;
                                    const topPadding = 20;
                                    const y = topPadding + (height - ((tick / yMax) * height));
                                    return (
                                        <line
                                            key={tick}
                                            x1="0"
                                            y1={y}
                                            x2={chartWidth}
                                            y2={y}
                                            stroke="rgba(255,255,255,0.05)"
                                            strokeWidth="1"
                                            strokeDasharray="4 4"
                                            className="transition-all duration-500 ease-in-out"
                                        />
                                    );
                                })}

                                {/* Area Fill with Smooth Transition */}
                                <path
                                    d={areaPath}
                                    fill={fillColor}
                                    className="transition-all duration-500 ease-out"
                                    style={{ opacity: 0.8 }}
                                />

                                {/* Line Stroke with Smooth Transition */}
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="transition-all duration-500 ease-out"
                                />

                                {/* Data Points - Synchronized Transitions */}
                                {points.map((p: any) => {
                                    const isSelected = selectedChartDay === p.date;
                                    return (
                                        <g
                                            key={p.date}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedChartDay(isSelected ? null : p.date);
                                            }}
                                            className={cn(
                                                "cursor-pointer group",
                                                "transition-opacity duration-300 ease-in-out",
                                                isTransitioning ? "opacity-60" : "opacity-100"
                                            )}
                                        >
                                            {/* Invisible Hit Area */}
                                            <rect
                                                x={p.x - 20}
                                                y={0}
                                                width={40}
                                                height={180}
                                                fill="transparent"
                                            />

                                            {/* Outer Glow Ring (when selected) */}
                                            {isSelected && (
                                                <circle
                                                    cx={p.x}
                                                    cy={p.y}
                                                    r="8"
                                                    fill="none"
                                                    stroke="white"
                                                    strokeOpacity="0.2"
                                                    strokeWidth="4"
                                                    className="animate-pulse"
                                                />
                                            )}

                                            {/* Point Circle */}
                                            <circle
                                                cx={p.x}
                                                cy={p.y}
                                                r="4"
                                                fill="white"
                                                stroke={strokeColor}
                                                strokeWidth="2"
                                                className="transition-all duration-200 group-hover:r-5"
                                            />

                                            {/* Value Label Above Point */}
                                            <text
                                                x={p.x}
                                                y={p.y - 10}
                                                textAnchor="middle"
                                                fill="white"
                                                fontSize="9"
                                                fontWeight="bold"
                                                className="pointer-events-none drop-shadow-md transition-opacity duration-300"
                                            >
                                                {chartMetric === 'margin' ?
                                                    `${p.value.toFixed(0)}%` :
                                                    (Math.abs(p.value) >= 1000 ? `${(Math.abs(p.value) / 1000).toFixed(1)}k` : Math.abs(p.value).toFixed(0))}
                                            </text>

                                            {/* X Axis Label */}
                                            <text
                                                x={p.x}
                                                y="175"
                                                textAnchor="middle"
                                                fill={isSelected ? "white" : "rgba(255,255,255,0.5)"}
                                                fontSize="10"
                                                fontWeight={isSelected ? "bold" : "normal"}
                                                className="pointer-events-none transition-all duration-300"
                                            >
                                                {format(new Date(p.date), 'dd')}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
