/**
 * Goal Bubble Widget - Floating widget showing goal progress overview
 * Features:
 * - Fluid Draggable floating button (left/right edges only, snaps to nearest edge)
 * - Remove zone at bottom to hide widget
 * - Click outside to close
 * - Opens as a modal panel (same style as AI chat)
 * - Shows due date for each goal
 * - Navigate to goals dashboard on expand
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { differenceInDays } from 'date-fns';
import {
    Target,
    X,
    Maximize2,
    Trophy,
    Flame,
    Clock,
    EyeOff,
    ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAllGoals, updateGoalProgress, type UserGoal } from '../../lib/aiMemory';
import { supabase } from '../../lib/supabase';

// Storage Keys
const WIDGET_VISIBLE_KEY = 'goal_widget_visible';
const WIDGET_POSITION_KEY = 'goal_widget_position_v2';
const WIDGET_AUTO_OPENED_KEY = 'goal_widget_auto_opened'; // Session storage - tracks if we auto-opened this session

interface WidgetPosition {
    side: 'left' | 'right';
    yPercent: number;
}

function getWidgetVisibility(): boolean {
    const stored = localStorage.getItem(WIDGET_VISIBLE_KEY);
    if (stored === null) return true;
    return stored === 'true';
}

// Check if we should auto-open the panel (only once per session)
function shouldAutoOpen(): boolean {
    const alreadyOpened = sessionStorage.getItem(WIDGET_AUTO_OPENED_KEY);
    if (alreadyOpened === 'true') return false;
    return true;
}

// Mark that we've auto-opened this session
function markAutoOpened(): void {
    sessionStorage.setItem(WIDGET_AUTO_OPENED_KEY, 'true');
}

function setWidgetVisibility(visible: boolean): void {
    localStorage.setItem(WIDGET_VISIBLE_KEY, visible ? 'true' : 'false');
}

function getWidgetPosition(): WidgetPosition {
    try {
        const stored = localStorage.getItem(WIDGET_POSITION_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if ((parsed.side === 'left' || parsed.side === 'right') &&
                typeof parsed.yPercent === 'number' && !isNaN(parsed.yPercent)) {
                return parsed;
            }
        }
    } catch { }
    return { side: 'right', yPercent: 70 };
}

function saveWidgetPosition(position: WidgetPosition): void {
    localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify(position));
}

export default function GoalBubbleWidget() {
    const navigate = useNavigate();
    const location = useLocation();

    // Core states
    const [isVisible, setIsVisible] = useState(getWidgetVisibility);
    const [isOpen, setIsOpen] = useState(false);
    const [openModalCount, setOpenModalCount] = useState(0);
    const [listenerRefreshKey, setListenerRefreshKey] = useState(0);

    // Goals data
    const [goals, setGoals] = useState<UserGoal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // DRAG STATE
    const [position, setPosition] = useState<WidgetPosition>(getWidgetPosition);
    const [isDragging, setIsDragging] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const removeZoneRef = useRef<HTMLDivElement>(null);

    // Refs for drag math
    const dragRef = useRef({
        startX: 0,
        startY: 0,
        isDragging: false,
        hasMoved: false,
        isOverRemoveZone: false
    });

    const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hide on certain routes
    const hiddenRoutes = ['/insights/goals'];
    const shouldHide = hiddenRoutes.includes(location.pathname);

    // Load goals
    const loadGoals = async () => {
        try {
            const allGoals = await getAllGoals();
            const activeGoals = allGoals.filter(g => g.status === 'active');

            const updatedGoals = [];
            for (const goal of activeGoals) {
                const updatedGoal = await updateGoalProgress(goal.id);
                if (updatedGoal) {
                    updatedGoals.push(updatedGoal);
                }
            }

            setGoals(updatedGoals);
        } catch (error) {
            console.error('Error loading goals:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Initialize
    useEffect(() => {
        loadGoals();

        // Load visibility from database (overrides localStorage)
        const loadVisibilityFromDB = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('goal_widget_visible')
                    .eq('id', 1)
                    .single();
                if (data && data.goal_widget_visible !== null && data.goal_widget_visible !== undefined) {
                    const dbValue = data.goal_widget_visible;
                    setIsVisible(dbValue);
                    localStorage.setItem(WIDGET_VISIBLE_KEY, dbValue ? 'true' : 'false');
                }
            } catch {
                // Column may not exist yet, keep localStorage value
            }
        };
        loadVisibilityFromDB();

        const channel = supabase
            .channel('goal-bubble-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_goals' }, () => loadGoals())
            .subscribe();

        const handleVisibilityChange = () => setIsVisible(getWidgetVisibility());
        window.addEventListener('goal-widget-visibility-changed', handleVisibilityChange);
        window.addEventListener('storage', handleVisibilityChange);

        const handleGoalUpdate = () => setTimeout(loadGoals, 500);
        window.addEventListener('goal-updated', handleGoalUpdate);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('goal-widget-visibility-changed', handleVisibilityChange);
            window.removeEventListener('storage', handleVisibilityChange);
            window.removeEventListener('goal-updated', handleGoalUpdate);
        };
    }, []);

    // Auto-open the panel on first app load (once per session)
    useEffect(() => {
        // Only auto-open when:
        // 1. Loading is complete
        // 2. Widget is visible
        // 3. We haven't auto-opened this session yet
        // 4. Not on a hidden route
        // 5. No modals are open
        if (!isLoading && isVisible && shouldAutoOpen() && !shouldHide && openModalCount === 0) {
            // Small delay to ensure UI is ready
            const timer = setTimeout(() => {
                window.history.pushState({ goalBubbleOpen: true }, '');
                setIsOpen(true);
                markAutoOpened();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isLoading, isVisible, shouldHide, openModalCount]);


    // Wake/resume handling
    useEffect(() => {
        const resetDragState = () => {
            dragRef.current = { startX: 0, startY: 0, isDragging: false, hasMoved: false, isOverRemoveZone: false };
            setIsDragging(false);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetDragState();
                setTimeout(() => {
                    setListenerRefreshKey(prev => prev + 1);
                    if (buttonRef.current) {
                        const isRight = position.side === 'right';
                        buttonRef.current.style.transition = 'none';
                        buttonRef.current.style.pointerEvents = 'auto';
                        buttonRef.current.style.left = isRight ? 'auto' : '16px';
                        buttonRef.current.style.right = isRight ? '16px' : 'auto';
                        buttonRef.current.style.top = `${position.yPercent}%`;
                        buttonRef.current.style.transform = 'translateY(-50%)';
                        buttonRef.current.style.opacity = '1';
                    }
                }, 100);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [position.side, position.yPercent]);

    // Modal events
    useEffect(() => {
        const handleModalOpen = () => setOpenModalCount(prev => prev + 1);
        const handleModalClose = () => setOpenModalCount(prev => Math.max(0, prev - 1));

        window.addEventListener('app-modal-opened', handleModalOpen);
        window.addEventListener('app-modal-closed', handleModalClose);
        return () => {
            window.removeEventListener('app-modal-opened', handleModalOpen);
            window.removeEventListener('app-modal-closed', handleModalClose);
        };
    }, []);

    // Handle opening
    const handleOpen = useCallback(() => {
        if (isDragging) return;
        window.history.pushState({ goalBubbleOpen: true }, '');
        setIsOpen(true);
    }, [isDragging]);

    // Back button handling
    useEffect(() => {
        const handlePopState = () => {
            if (isOpen) setIsOpen(false);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isOpen]);

    // Handle closing
    const handleClose = () => {
        if (isOpen) window.history.back();
    };

    // Hide widget
    const hideWidget = () => {
        setIsVisible(false);
        setWidgetVisibility(false);
        handleClose();
        window.dispatchEvent(new Event('goal-widget-visibility-changed'));
    };

    // Expand to full goals dashboard
    const handleExpand = () => {
        if (isOpen) {
            window.history.back();
            setTimeout(() => navigate('/insights/goals'), 10);
        } else {
            navigate('/insights/goals');
        }
    };

    // DRAG HANDLING
    useEffect(() => {
        const button = buttonRef.current;
        if (!button) return;

        const handleStart = (clientX: number, clientY: number) => {
            if (isOpen) return;
            if (snapTimerRef.current) {
                clearTimeout(snapTimerRef.current);
                snapTimerRef.current = null;
            }
            dragRef.current = { startX: clientX, startY: clientY, isDragging: false, hasMoved: false, isOverRemoveZone: false };
            button.style.transition = 'none';
        };

        const handleMove = (clientX: number, clientY: number) => {
            const { startX, startY } = dragRef.current;
            const diffX = clientX - startX;
            const diffY = clientY - startY;

            if (!dragRef.current.isDragging) {
                if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
                    dragRef.current.isDragging = true;
                    dragRef.current.hasMoved = true;
                    button.style.transform = 'translateY(-50%) scale(1.1)';
                    setIsDragging(true);
                } else return;
            }

            button.style.position = 'fixed';
            button.style.left = `${clientX - 28}px`;
            button.style.top = `${clientY}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';

            // Remove zone check
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const removeZoneX = screenWidth / 2;
            const removeZoneY = screenHeight - 60;
            const distToRemote = Math.hypot(clientX - removeZoneX, clientY - removeZoneY);
            const isOver = distToRemote < 60;

            dragRef.current.isOverRemoveZone = isOver;

            if (removeZoneRef.current) {
                if (isOver) {
                    removeZoneRef.current.style.opacity = '1';
                    removeZoneRef.current.style.backgroundColor = 'rgba(239, 68, 68, 0.4)';
                    removeZoneRef.current.style.borderColor = 'rgba(239, 68, 68, 1)';
                    removeZoneRef.current.style.transform = 'scale(1.2)';
                    button.style.opacity = '0.5';
                } else {
                    removeZoneRef.current.style.opacity = '1';
                    removeZoneRef.current.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    removeZoneRef.current.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    removeZoneRef.current.style.transform = 'scale(1)';
                    button.style.opacity = '1';
                }
            }
        };

        const handleEnd = (clientX: number, clientY: number) => {
            button.style.opacity = '1';

            if (!dragRef.current.hasMoved) {
                button.style.transition = '';
                button.style.transform = 'translateY(-50%)';
                const isRight = position.side === 'right';
                button.style.left = isRight ? 'auto' : '16px';
                button.style.right = isRight ? '16px' : 'auto';
                button.style.top = `${position.yPercent}%`;
                handleOpen();
                return;
            }

            if (dragRef.current.isOverRemoveZone) {
                dragRef.current.isDragging = false;
                setIsDragging(false);
                hideWidget();
                return;
            }

            dragRef.current.isDragging = false;
            setIsDragging(false);

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const side: 'left' | 'right' = clientX < screenWidth / 2 ? 'left' : 'right';
            let yPercent = (clientY / screenHeight) * 100;
            yPercent = Math.max(12, Math.min(80, yPercent));

            const newPos = { side, yPercent };
            setPosition(newPos);
            saveWidgetPosition(newPos);

            button.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
            button.style.top = `${yPercent}%`;
            button.style.transform = 'translateY(-50%)';

            if (side === 'left') {
                button.style.left = '16px';
                button.style.right = 'auto';
            } else {
                const leftPos = screenWidth - 16 - 56;
                button.style.left = `${leftPos}px`;
                button.style.right = 'auto';
                snapTimerRef.current = setTimeout(() => {
                    if (buttonRef.current) {
                        buttonRef.current.style.transition = 'none';
                        buttonRef.current.style.left = 'auto';
                        buttonRef.current.style.right = '16px';
                    }
                }, 550);
            }
        };

        // Event handlers
        const onTouchStart = (e: TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
        const onTouchMove = (e: TouchEvent) => {
            if (dragRef.current.isDragging) e.preventDefault();
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };
        const onTouchEnd = (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
            const touch = e.changedTouches[0];
            handleEnd(touch.clientX, touch.clientY);
        };
        const onTouchCancel = () => {
            dragRef.current.isDragging = false;
            dragRef.current.hasMoved = false;
            setIsDragging(false);
            if (buttonRef.current) {
                buttonRef.current.style.transition = '';
                buttonRef.current.style.opacity = '1';
                buttonRef.current.style.transform = 'translateY(-50%)';
                const isRight = position.side === 'right';
                buttonRef.current.style.left = isRight ? 'auto' : '16px';
                buttonRef.current.style.right = isRight ? '16px' : 'auto';
                buttonRef.current.style.top = `${position.yPercent}%`;
            }
        };
        const onMouseDown = (e: MouseEvent) => {
            handleStart(e.clientX, e.clientY);
            const onMouseMove = (moveE: MouseEvent) => { moveE.preventDefault(); handleMove(moveE.clientX, moveE.clientY); };
            const onMouseUp = (upE: MouseEvent) => {
                handleEnd(upE.clientX, upE.clientY);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        button.addEventListener('touchstart', onTouchStart, { passive: false });
        button.addEventListener('touchmove', onTouchMove, { passive: false });
        button.addEventListener('touchend', onTouchEnd, { passive: false });
        button.addEventListener('touchcancel', onTouchCancel);
        button.addEventListener('mousedown', onMouseDown);

        return () => {
            if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
            button.removeEventListener('touchstart', onTouchStart);
            button.removeEventListener('touchmove', onTouchMove);
            button.removeEventListener('touchend', onTouchEnd);
            button.removeEventListener('touchcancel', onTouchCancel);
            button.removeEventListener('mousedown', onMouseDown);
        };
    }, [isOpen, position.side, position.yPercent, handleOpen, isVisible, listenerRefreshKey, openModalCount, shouldHide]);

    // Don't render on hidden routes or if modal is open
    if (shouldHide || openModalCount > 0) return null;

    // Calculate overall progress
    const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0);
    const totalCurrent = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const overallProgress = totalTarget > 0 ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0;

    return createPortal(
        <>
            {/* Remove Zone */}
            {isDragging && (
                <div
                    ref={removeZoneRef}
                    className="fixed bottom-10 left-1/2 -ml-10 z-[90] w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center text-red-500 transition-all duration-200"
                >
                    <X size={36} />
                </div>
            )}

            {/* Floating Button */}
            {isVisible && !isOpen && (
                <button
                    ref={buttonRef}
                    className={cn(
                        "z-[9999]",
                        "w-14 h-14 rounded-full",
                        "bg-gradient-to-br from-purple-500 to-purple-700",
                        "shadow-xl shadow-purple-500/30",
                        "flex items-center justify-center",
                        "ring-2 ring-white/20",
                        "touch-none select-none",
                        "active:scale-95 transition-transform"
                    )}
                    style={{
                        position: 'fixed',
                        [position.side]: '16px',
                        top: `${position.yPercent}%`,
                        transform: 'translateY(-50%)',
                    }}
                >
                    <Target size={24} className="text-white pointer-events-none" />

                    {/* Progress Ring */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="25" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                        <circle cx="28" cy="28" r="25" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="3"
                            strokeDasharray={`${(overallProgress / 100) * 157} 157`} strokeLinecap="round" className="transition-all duration-500" />
                    </svg>

                    {/* Badge */}
                    {goals.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full shadow-lg pointer-events-none">
                            {goals.length}
                        </span>
                    )}
                </button>
            )}

            {/* Goals Panel (Modal) */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[210] flex items-start justify-center pointer-events-auto bg-black/60 backdrop-blur-sm transition-all duration-300 pt-20"
                    onClick={handleClose}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            "bg-zinc-900 border border-white/10 shadow-2xl shadow-black/50",
                            "flex flex-col overflow-hidden",
                            "w-[calc(100%-32px)] max-w-[380px] h-[550px] max-h-[calc(100svh-20px)] rounded-2xl",
                            "animate-in zoom-in-95 slide-in-from-top-5 duration-200",
                            "pointer-events-auto"
                        )}
                    >
                        {/* Header */}
                        <div className="shrink-0 px-4 py-3 border-b border-white/10 bg-zinc-900/80 backdrop-blur-xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                        <Target size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">My Goals</h3>
                                        <p className="text-[10px] text-white/50">{goals.length} active goals</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={hideWidget} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Hide">
                                        <EyeOff size={16} />
                                    </button>
                                    <button onClick={handleExpand} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="View all">
                                        <Maximize2 size={16} />
                                    </button>
                                    <button onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Goals List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : goals.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
                                        <Target size={32} className="text-purple-400" />
                                    </div>
                                    <h3 className="text-sm font-bold text-white mb-1">No Active Goals</h3>
                                    <p className="text-xs text-neutral-400">Set your first goal to track progress!</p>
                                </div>
                            ) : (
                                goals.map((goal) => {
                                    const progress = (goal.current_amount / goal.target_amount) * 100;
                                    const isComplete = progress >= 100;
                                    const daysLeft = goal.deadline ? differenceInDays(new Date(goal.deadline), new Date()) : null;
                                    const isOverdue = daysLeft !== null && daysLeft < 0;
                                    const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

                                    return (
                                        <div
                                            key={goal.id}
                                            className={cn(
                                                "p-3 rounded-xl border transition-all",
                                                isOverdue ? "bg-red-500/10 border-red-500/30" :
                                                    isComplete ? "bg-emerald-500/10 border-emerald-500/30" :
                                                        "bg-white/5 border-white/10"
                                            )}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "w-7 h-7 rounded-lg flex items-center justify-center",
                                                        isComplete ? "bg-emerald-500/20 text-emerald-400" :
                                                            isOverdue ? "bg-red-500/20 text-red-400" :
                                                                "bg-purple-500/20 text-purple-400"
                                                    )}>
                                                        {isComplete ? <Trophy size={14} /> : <Flame size={14} />}
                                                    </div>
                                                    <div>
                                                        <span className="text-xs font-semibold text-white block truncate max-w-[180px]">
                                                            {goal.title}
                                                        </span>
                                                        {/* Due Date */}
                                                        {goal.deadline && (
                                                            <span className={cn(
                                                                "text-[10px] flex items-center gap-1",
                                                                isOverdue ? "text-red-400" :
                                                                    isUrgent ? "text-amber-400" :
                                                                        "text-neutral-400"
                                                            )}>
                                                                <Clock size={10} />
                                                                {isOverdue ? `Overdue by ${Math.abs(daysLeft!)} days` :
                                                                    daysLeft === 0 ? 'Due Today' :
                                                                        `${daysLeft} days left`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={cn(
                                                    "text-xs font-bold",
                                                    isComplete ? "text-emerald-400" : "text-white"
                                                )}>
                                                    {progress.toFixed(0)}%
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        isComplete ? "bg-emerald-500" :
                                                            isOverdue ? "bg-red-500" :
                                                                "bg-gradient-to-r from-purple-500 to-purple-400"
                                                    )}
                                                    style={{ width: `${Math.min(100, progress)}%` }}
                                                />
                                            </div>

                                            {/* Values */}
                                            <div className="flex justify-between text-[10px] text-neutral-400">
                                                <span>₹{goal.current_amount.toLocaleString()}</span>
                                                <span>₹{goal.target_amount.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 p-3 border-t border-white/10">
                            <button
                                onClick={handleExpand}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors"
                            >
                                View All Goals
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
