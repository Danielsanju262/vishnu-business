/**
 * Global AI Widget - The floating chat assistant that appears on all pages
 * Features:
 * - Fluid Draggable floating button (left/right edges only, snaps to nearest edge)
 * - Quick chat popover
 * - Expandable to full screen
 * - Morning briefing on first load of the day
 * - Easy hide/show toggle via Settings
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import {
    Sparkles,
    X,
    Maximize2,
    Send,
    Trash2,
    Bot,
    ChevronDown,
    Target,
    Bell,
    AlertCircle,
    CheckCircle2,
    Loader2,
    EyeOff,
    Check
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobileKeyboardOpen } from '../../hooks/useIsMobileKeyboardOpen';
import { enhancedChatWithAI, executePendingAction, type PendingAction } from '../../lib/enhancedAI';
import {
    generateMorningBriefing,
    hasReadTodaysBriefing,
    markBriefingAsRead,
    getAIConfig,
    getOrCreateActiveSession,
    getChatMessages,
    addChatMessage,
    clearChatSession,
    type MorningBriefing
} from '../../lib/aiMemory';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// ===== POSITION PERSISTENCE =====
interface WidgetPosition {
    side: 'left' | 'right';
    yPercent: number; // 0-100, percentage from top
}

const WIDGET_VISIBLE_KEY = 'ai_widget_visible';
const WIDGET_POSITION_KEY = 'ai_widget_position_v3'; // Bumped version for new logic

function getWidgetVisibility(): boolean {
    const stored = localStorage.getItem(WIDGET_VISIBLE_KEY);
    return stored !== 'false'; // Default to visible
}

function setWidgetVisibility(visible: boolean): void {
    localStorage.setItem(WIDGET_VISIBLE_KEY, visible ? 'true' : 'false');
}

function getWidgetPosition(): WidgetPosition {
    try {
        const stored = localStorage.getItem(WIDGET_POSITION_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate bounds
            if ((parsed.side === 'left' || parsed.side === 'right') &&
                typeof parsed.yPercent === 'number' &&
                !isNaN(parsed.yPercent)) {
                return parsed;
            }
        }
    } catch { }
    return { side: 'right', yPercent: 70 }; // Default: right side, 70% from top
}

function saveWidgetPosition(position: WidgetPosition): void {
    localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify(position));
}

// ===== MAIN COMPONENT =====
export default function GlobalAIWidget() {
    const navigate = useNavigate();
    const location = useLocation();

    // Core states
    const [isVisible, setIsVisible] = useState(getWidgetVisibility);
    const [isOpen, setIsOpen] = useState(false);
    const [openModalCount, setOpenModalCount] = useState(0);
    const isKeyboardOpen = useIsMobileKeyboardOpen();
    const [listenerRefreshKey, setListenerRefreshKey] = useState(0);

    // DRAG STATE
    // We use direct DOM manipulation for dragging to ensure 60fps performance on mobile
    const [position, setPosition] = useState<WidgetPosition>(getWidgetPosition);
    const [isDragging, setIsDragging] = useState(false); // Used for showing the X zone
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

    // Timer ref to safely handle property switching after animation
    const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Chat states
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    // AI config
    const [botName, setBotName] = useState('Via AI');
    const [userName, setUserName] = useState('');

    // Morning briefing
    const [hasUnreadBriefing, setHasUnreadBriefing] = useState(false);
    const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
    const [showBriefing, setShowBriefing] = useState(false);

    // Pending action awaiting user confirmation
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    // Refs
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Hide on certain routes
    const hiddenRoutes = ['/insights/chat'];
    const shouldHide = hiddenRoutes.includes(location.pathname);

    // Initialize
    useEffect(() => {
        initializeWidget();
    }, []);

    // Listen for visibility changes from Settings page
    useEffect(() => {
        const handleStorageChange = () => {
            setIsVisible(getWidgetVisibility());
        };

        // Custom event for same-tab updates
        window.addEventListener('ai-widget-visibility-changed', handleStorageChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('ai-widget-visibility-changed', handleStorageChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    // Force re-attach listeners when app wakes up or becomes visible
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Small delay to ensure DOM is ready/stabilized after wake
                setTimeout(() => {
                    setListenerRefreshKey(prev => prev + 1);
                }, 100);
            }
        };

        const handlePageShow = () => {
            setListenerRefreshKey(prev => prev + 1);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []);

    // Listen for modal events to hide widget when modals are open
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

    const initializeWidget = async () => {
        // Load AI config
        try {
            const config = await getAIConfig();
            if (config.bot_name) setBotName(config.bot_name);
            if (config.user_name) setUserName(config.user_name);

            // Load chat session
            const session = await getOrCreateActiveSession();
            if (session) {
                setSessionId(session.id);
                const history = await getChatMessages(session.id);
                setMessages(history.map(m => ({
                    id: m.id,
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                    timestamp: new Date(m.created_at)
                })));
            }

            // Check for morning briefing
            if (!hasReadTodaysBriefing()) {
                setHasUnreadBriefing(true);
                const briefingData = await generateMorningBriefing();
                setBriefing(briefingData);
            }
        } catch (error) {
            console.error('[AI Widget] Init error:', error);
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle opening widget
    const handleOpen = useCallback(() => {
        if (isDragging) return; // Guard against opening when drag ends (though click logic handles this)

        // Push a history state so back button closes the modal
        window.history.pushState({ aiChatOpen: true }, '');
        setIsOpen(true);

        // Show briefing on first open of the day
        if (hasUnreadBriefing && briefing) {
            setShowBriefing(true);
            setHasUnreadBriefing(false);
            markBriefingAsRead();
        }
    }, [hasUnreadBriefing, briefing, isDragging]);

    // Handle back button / swipe back
    useEffect(() => {
        const handlePopState = () => {
            if (isOpen) {
                // If the modal was open and user hit back, close it locally
                setIsOpen(false);
                setShowBriefing(false);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isOpen]);

    // Handle closing widget
    const handleClose = () => {
        // Instead of setting state directly, we go back in history.
        // This triggers the popstate listener above, which closes the modal.
        // This ensures history stays clean.
        if (isOpen) {
            window.history.back();
        }
    };

    // Toggle visibility (hide/show the floating button)
    const hideWidget = () => {
        setIsVisible(false);
        setWidgetVisibility(false);
        handleClose();
        window.dispatchEvent(new Event('ai-widget-visibility-changed'));
    };

    // Expose show function globally
    useEffect(() => {
        (window as any).__showAIWidget = () => {
            setIsVisible(true);
            setWidgetVisibility(true);
            window.dispatchEvent(new Event('ai-widget-visibility-changed'));
        };
        (window as any).__hideAIWidget = () => {
            setIsVisible(false);
            setWidgetVisibility(false);
            window.dispatchEvent(new Event('ai-widget-visibility-changed'));
        };
        (window as any).__isAIWidgetVisible = () => getWidgetVisibility();

        return () => {
            delete (window as any).__showAIWidget;
            delete (window as any).__hideAIWidget;
            delete (window as any).__isAIWidgetVisible;
        };
    }, []);

    // Expand to full screen (navigate to insights chat)
    const handleExpand = () => {
        // We go back to remove the modal state from history, then navigate
        if (isOpen) {
            window.history.back();
            // Small timeout to allow popstate to process before navigating? 
            // Actually router navigation pushes new state, so order matters.
            // If we don't wait, race condition might occur?
            // Safer to just navigate immediately, but accept one dirty history entry?
            // No, back() is async-ish.
            setTimeout(() => {
                navigate('/insights/chat');
            }, 10);
        } else {
            navigate('/insights/chat');
        }
    };

    // ===== FLUID DRAG HANDLING =====
    // We attach non-passive event listeners for maximum responsiveness
    useEffect(() => {
        const button = buttonRef.current;
        if (!button) return;

        const handleStart = (clientX: number, clientY: number) => {
            if (isOpen) return;

            // Clear any pending snap timer if user grabs it mid-animation
            if (snapTimerRef.current) {
                clearTimeout(snapTimerRef.current);
                snapTimerRef.current = null;
            }

            dragRef.current = {
                startX: clientX,
                startY: clientY,
                isDragging: false,
                hasMoved: false,
                isOverRemoveZone: false
            };

            // Visually prepare for drag, but don't move yet
            // Removing transition is key for 1:1 movement
            button.style.transition = 'none';
        };

        const handleMove = (clientX: number, clientY: number) => {
            const { startX, startY } = dragRef.current;
            const diffX = clientX - startX;
            const diffY = clientY - startY;

            // Threshold to detect drag vs click
            if (!dragRef.current.isDragging) {
                if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
                    dragRef.current.isDragging = true;
                    dragRef.current.hasMoved = true;
                    button.style.transform = 'translateY(-50%) scale(1.1)'; // Visual feedback

                    // Trigger React state to show the X zone
                    setIsDragging(true);
                } else {
                    return; // Ignore micro-movements
                }
            }

            // We are dragging
            // Update position immediately using fixed positioning
            button.style.position = 'fixed';
            button.style.left = `${clientX - 28}px`; // Center horizontally
            button.style.top = `${clientY}px`; // Center vertically (transform handles Y centering)
            button.style.right = 'auto'; // Clear right
            button.style.bottom = 'auto'; // Clear bottom

            // Check for overlap with Remove Zone
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const removeZoneX = screenWidth / 2;
            const removeZoneY = screenHeight - 60;

            // Distance from finger to remove zone center
            const distToRemote = Math.hypot(clientX - removeZoneX, clientY - removeZoneY);
            const isOver = distToRemote < 60; // 60px radius capture zone

            dragRef.current.isOverRemoveZone = isOver;

            // Visual feedback via DOM manipulation
            // STABLE REMOVE ZONE: Opacity and Color only, NO movement
            if (removeZoneRef.current) {
                if (isOver) {
                    // Active state - Highlighted
                    removeZoneRef.current.style.opacity = '1';
                    removeZoneRef.current.style.backgroundColor = 'rgba(239, 68, 68, 0.4)'; // Brighter/Darker Red bg
                    removeZoneRef.current.style.borderColor = 'rgba(239, 68, 68, 1)'; // Solid Red border
                    // Scale only - centering handled by CSS margin
                    removeZoneRef.current.style.transform = 'scale(1.2)';

                    button.style.opacity = '0.5'; // Fade bubble
                } else {
                    // Passive state - Consistent visibility
                    removeZoneRef.current.style.opacity = '1'; // Maintain full visibility
                    removeZoneRef.current.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; // Subtle background
                    removeZoneRef.current.style.borderColor = 'rgba(239, 68, 68, 0.5)'; // Semi-transparent border
                    // Reset scale
                    removeZoneRef.current.style.transform = 'scale(1)';

                    button.style.opacity = '1';
                }
            }
        };

        const handleEnd = (clientX: number, clientY: number) => {
            // Restore opacity
            button.style.opacity = '1';

            // If needed, check if it was a click
            if (!dragRef.current.hasMoved) {
                // Restore transition
                button.style.transition = '';
                button.style.transform = 'translateY(-50%)';

                // Reset styles to pure props state just to be safe
                const isRight = position.side === 'right';
                button.style.left = isRight ? 'auto' : '16px';
                button.style.right = isRight ? '16px' : 'auto';
                button.style.top = `${position.yPercent}%`;

                handleOpen();
                return;
            }

            // Check if dropped in Remove Zone
            if (dragRef.current.isOverRemoveZone) {
                dragRef.current.isDragging = false;
                setIsDragging(false);
                hideWidget(); // This will unmount the component or hide it
                return;
            }

            // Normal Snap Logic
            dragRef.current.isDragging = false;
            setIsDragging(false); // Hide the X zone

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            const distToLeft = clientX;
            const distToRight = screenWidth - clientX;
            const side: 'left' | 'right' = distToLeft < distToRight ? 'left' : 'right';

            // Clamp vertical position
            let yPercent = (clientY / screenHeight) * 100;
            yPercent = Math.max(12, Math.min(80, yPercent)); // 80% max to stay clear of bottom nav/remove zone

            // Update state for persistence
            const newPos = { side, yPercent };
            setPosition(newPos);
            saveWidgetPosition(newPos);

            // ANIMATION LOGIC:
            // 500ms transition for extra smoothness
            button.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
            button.style.top = `${yPercent}%`;
            button.style.transform = 'translateY(-50%)';

            if (side === 'left') {
                button.style.left = '16px';
                button.style.right = 'auto';
            } else {
                // Precise calculation for right side target
                // windowWidth - margin - buttonWidth
                const leftPos = screenWidth - 16 - 56;
                button.style.left = `${leftPos}px`;
                button.style.right = 'auto';

                // Switch to 'right' property AFTER animation + buffer
                snapTimerRef.current = setTimeout(() => {
                    if (buttonRef.current) {
                        buttonRef.current.style.transition = 'none'; // Switch silently
                        buttonRef.current.style.left = 'auto';
                        buttonRef.current.style.right = '16px';
                    }
                }, 550); // 550ms > 500ms transition
            }
        };

        // Touch handlers with preventative logic
        const onTouchStart = (e: TouchEvent) => {
            // Don't prevent default here immediately to allow scrolling elsewhere if missed target
            // But for the button itself, we want to grab it.
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
        };

        const onTouchMove = (e: TouchEvent) => {
            // If we've started dragging, definitely prevent scrolling
            if (dragRef.current.isDragging) {
                e.preventDefault();
            }
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };

        const onTouchEnd = (e: TouchEvent) => {
            // Prevent default mouse emulation to avoid double-firing events (blinking)
            if (e.cancelable) e.preventDefault();

            // Use changedTouches for the final position
            const touch = e.changedTouches[0];
            handleEnd(touch.clientX, touch.clientY);
        };

        const onTouchCancel = (e: TouchEvent) => {
            // Reset drag state if touch is interrupted (e.g. incoming call, screen off)
            dragRef.current.isDragging = false;
            dragRef.current.hasMoved = false;
            setIsDragging(false);
            if (buttonRef.current) {
                buttonRef.current.style.transition = ''; // Restore snap transition if needed? No, just reset.
                buttonRef.current.style.opacity = '1';
                // Snap back to nearest edge effectively
                // We rely on the fact that handleEnd wasn't called, so position state is unchanged.
                // We just need to reset the visual transform that might be mid-drag.
                buttonRef.current.style.transform = 'translateY(-50%)';

                // Re-apply static positioning based on last known state
                const isRight = position.side === 'right';
                buttonRef.current.style.left = isRight ? 'auto' : '16px';
                buttonRef.current.style.right = isRight ? '16px' : 'auto';
                buttonRef.current.style.top = `${position.yPercent}%`;
            }
        };

        // Mouse handlers
        const onMouseDown = (e: MouseEvent) => {
            // If touch is active/supported, mouse down might still fire in some hybrids, 
            // but usually preventDefault in touchStart/End handles it. 
            // To be safe, we can leave this as is, relying on touchEnd's preventDefault.
            handleStart(e.clientX, e.clientY);

            const onMouseMove = (moveE: MouseEvent) => {
                moveE.preventDefault(); // Always prevent selection during mouse drag
                handleMove(moveE.clientX, moveE.clientY);
            };

            const onMouseUp = (upE: MouseEvent) => {
                handleEnd(upE.clientX, upE.clientY);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        // Attach listeners
        button.addEventListener('touchstart', onTouchStart, { passive: false });
        button.addEventListener('touchmove', onTouchMove, { passive: false });
        button.addEventListener('touchend', onTouchEnd, { passive: false }); // Passive false needed for preventDefault
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
    }, [isOpen, position.side, position.yPercent, handleOpen, isVisible, listenerRefreshKey]);

    // Send message
    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const message = inputValue.trim();
        setInputValue('');
        setIsLoading(true);
        setShowBriefing(false);

        // Add user message immediately
        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);

        // Save to database
        if (sessionId) {
            await addChatMessage(sessionId, 'user', message);
        }

        try {
            // Get AI response
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            const response = await enhancedChatWithAI(message, history, botName, userName);

            const aiMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: response.text,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);

            // Save to database
            if (sessionId) {
                await addChatMessage(sessionId, 'assistant', response.text);
            }

            // If there's a pending action, store it for user confirmation
            if (response.pendingAction) {
                setPendingAction(response.pendingAction);
            }
        } catch (error) {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: "[Error] I'm having trouble connecting right now.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle confirming a pending action
    const handleConfirmAction = async () => {
        if (!pendingAction) return;

        setIsLoading(true);
        try {
            const result = await executePendingAction(pendingAction);

            const confirmMsg: ChatMessage = {
                id: `confirm-${Date.now()}`,
                role: 'assistant',
                content: result,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, confirmMsg]);

            // Save to database
            if (sessionId) {
                await addChatMessage(sessionId, 'assistant', result);
            }
        } catch (error) {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `❌ Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setPendingAction(null);
            setIsLoading(false);
        }
    };

    // Handle declining a pending action
    const handleDeclineAction = () => {
        const declineMsg: ChatMessage = {
            id: `decline-${Date.now()}`,
            role: 'assistant',
            content: '✋ Got it! I won\'t make that change. Let me know if you need anything else.',
            timestamp: new Date()
        };
        setMessages(prev => [...prev, declineMsg]);
        setPendingAction(null);
    };

    // Clear chat
    const handleClearChat = async () => {
        if (sessionId) {
            await clearChatSession(sessionId);
        }
        setMessages([]);
        setShowBriefing(false);
    };

    // Don't render on hidden routes or if a modal is open
    if (shouldHide || openModalCount > 0) return null;

    // Calculate badge count
    const badgeCount = hasUnreadBriefing ? (briefing?.totalPendingTasks || 1) : 0;



    return createPortal(
        <>
            {/* Remove Zone - Hidden by default, shown when dragging */}
            {isDragging && (
                <div
                    ref={removeZoneRef}
                    className="fixed bottom-10 left-1/2 -ml-10 z-[90] w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center text-red-500 transition-all duration-200"
                >
                    <X size={36} />
                </div>
            )}

            {/* Floating Button - Positioned initially via style prop/CSS */}
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
                        "touch-none select-none", // Important for gesture handling
                        "active:scale-95 transition-transform" // Visual feedback on tap
                    )}
                    style={{
                        position: 'fixed',
                        [position.side]: '16px',
                        top: `${position.yPercent}%`,
                        transform: 'translateY(-50%)',
                        // Note: We intentionally don't put transition here initially 
                        // to allow instant movement start. The JS logic handles adding it back for snap.
                    }}
                >
                    <Sparkles size={24} className="text-white pointer-events-none" />

                    {/* Notification Badge */}
                    {badgeCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse pointer-events-none">
                            {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Popover */}
            {isOpen && (
                <div
                    className={cn(
                        "fixed inset-0 z-[210] flex items-start justify-center pointer-events-auto bg-black/60 backdrop-blur-sm transition-all duration-300",
                        isKeyboardOpen ? "pt-2" : "pt-20"
                    )}
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
                                        <Sparkles size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">{botName}</h3>
                                        <p className="text-[10px] text-white/50">Your Business Assistant</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {messages.length > 0 && (
                                        <button
                                            onClick={handleClearChat}
                                            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                            title="Clear chat"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <button
                                        onClick={hideWidget}
                                        className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                        title="Hide (Go to Settings > AI Assistant to show again)"
                                    >
                                        <EyeOff size={16} />
                                    </button>
                                    <button
                                        onClick={handleExpand}
                                        className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                        title="Full screen"
                                    >
                                        <Maximize2 size={16} />
                                    </button>
                                    <button
                                        onClick={handleClose}
                                        className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Chat Content */}
                        <div
                            ref={chatContainerRef}
                            className="flex-1 overflow-y-auto p-4 space-y-3"
                        >
                            {/* Morning Briefing Card */}
                            {showBriefing && briefing && (
                                <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10 rounded-xl p-4 mb-4 backdrop-blur-sm">
                                    <div className="mb-4">
                                        <h4 className="font-bold text-white text-md mb-1">{briefing.briefingTitle}</h4>
                                        <p className="text-xs text-white/60">Here are your tasks for today:</p>
                                    </div>

                                    {/* Task Summary List */}
                                    <div className="space-y-3 mb-5">
                                        {/* Receivables */}
                                        {(briefing.overduePaymentReminders.length > 0 || briefing.todayPaymentReminders.length > 0) && (
                                            <div className="bg-white/5 rounded-lg p-2.5">
                                                <div className="flex items-center gap-2 mb-2 text-amber-400">
                                                    <AlertCircle size={14} />
                                                    <span className="text-xs font-bold">Payments to Collect</span>
                                                </div>
                                                <ul className="space-y-1.5 pl-1">
                                                    {briefing.overduePaymentReminders.map((r, i) => (
                                                        <li key={`od-${i}`} className="text-[11px] text-white/80 flex justify-between">
                                                            <span>{r.customerName} (Overdue)</span>
                                                            <span className="font-mono text-red-300">₹{r.amount.toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                    {briefing.todayPaymentReminders.map((r, i) => (
                                                        <li key={`td-${i}`} className="text-[11px] text-white/80 flex justify-between">
                                                            <span>{r.customerName} (Due Today)</span>
                                                            <span className="font-mono text-amber-200">₹{r.amount.toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Payables */}
                                        {(briefing.overduePayables.length > 0 || briefing.todayPayables.length > 0) && (
                                            <div className="bg-white/5 rounded-lg p-2.5">
                                                <div className="flex items-center gap-2 mb-2 text-blue-400">
                                                    <Bell size={14} />
                                                    <span className="text-xs font-bold">Payments Due From You</span>
                                                </div>
                                                <ul className="space-y-1.5 pl-1">
                                                    {briefing.overduePayables.map((p, i) => (
                                                        <li key={`od-pay-${i}`} className="text-[11px] text-white/80 flex justify-between">
                                                            <span>{p.supplierName} (Overdue)</span>
                                                            <span className="font-mono text-red-300">₹{p.amount.toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                    {briefing.todayPayables.map((p, i) => (
                                                        <li key={`td-pay-${i}`} className="text-[11px] text-white/80 flex justify-between">
                                                            <span>{p.supplierName} (Due Today)</span>
                                                            <span className="font-mono text-blue-200">₹{p.amount.toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {briefing.totalPendingTasks === 0 && (
                                            <div className="flex items-center gap-2 text-xs text-emerald-400 py-2">
                                                <CheckCircle2 size={14} />
                                                <span>All caught up on payments! No urgent tasks 🎉</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Waterfall Goal Motivation */}
                                    {briefing.waterfallGoals && briefing.waterfallGoals.length > 0 && (
                                        <div className="border-t border-white/10 pt-4">
                                            <div className="flex items-center gap-2 mb-2 text-purple-400">
                                                <Target size={14} />
                                                <span className="text-xs font-bold">Priority Goal Focus</span>
                                            </div>

                                            {/* Show only the first non-completed goal for focus, or all? 
                                            User prompt implies focusing on "Next Goal". Let's show the first one that needs money.
                                        */}
                                            {(() => {
                                                const focusGoal = briefing.waterfallGoals.find(g => !g.isFullyFunded) || briefing.waterfallGoals[0];
                                                if (!focusGoal) return null;

                                                return (
                                                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className="text-xs font-bold text-white">{focusGoal.goal.title}</span>
                                                            <span className="text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-200">
                                                                {focusGoal.daysLeft} days left
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between text-[10px] text-white/60 mb-1">
                                                            <span>Allocated: ₹{focusGoal.allocatedAmount.toLocaleString()}</span>
                                                            <span>Target: ₹{focusGoal.goal.target_amount.toLocaleString()}</span>
                                                        </div>

                                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-purple-400 to-pink-400"
                                                                style={{ width: `${Math.min(100, (focusGoal.allocatedAmount / focusGoal.goal.target_amount) * 100)}%` }}
                                                            />
                                                        </div>

                                                        <p className="text-[11px] leading-relaxed text-purple-100 italic">
                                                            "{focusGoal.statusMessage}"
                                                        </p>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setShowBriefing(false)}
                                        className="mt-3 w-full py-2 text-xs text-white/70 hover:text-white transition-colors flex items-center justify-center gap-1"
                                    >
                                        <ChevronDown size={14} />
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            {/* Welcome Message */}
                            {messages.length === 0 && !showBriefing && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                                        <Bot size={32} className="text-purple-400" />
                                    </div>
                                    <h4 className="font-bold text-white mb-2">Hey there! 👋</h4>
                                    <p className="text-sm text-white/60 max-w-xs mx-auto">
                                        I'm your assistant. Drag me to any side to move me out of the way!
                                    </p>

                                    {/* Quick Actions */}
                                    <div className="mt-4 space-y-2">
                                        <button
                                            onClick={() => setInputValue("How was my business this month?")}
                                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm text-white/80 transition-colors"
                                        >
                                            📊 How was my business this month?
                                        </button>
                                        <button
                                            onClick={() => setInputValue("Who owes me money?")}
                                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm text-white/80 transition-colors"
                                        >
                                            💰 Who owes me money?
                                        </button>
                                        <button
                                            onClick={() => setInputValue("Set a goal: Earn 50000 profit this month")}
                                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm text-white/80 transition-colors"
                                        >
                                            🎯 Set a new goal
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Chat Messages */}
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "flex",
                                        msg.role === 'user' ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "max-w-[85%] p-3 text-sm rounded-2xl",
                                            msg.role === 'user'
                                                ? "bg-purple-600 text-white rounded-br-md"
                                                : "bg-zinc-800 text-white border border-white/5 rounded-bl-md"
                                        )}
                                    >
                                        <div className={cn(
                                            "prose prose-sm max-w-none break-words prose-invert",
                                            "prose-p:my-1 prose-p:leading-relaxed",
                                            "prose-ul:my-2 prose-ul:pl-4",
                                            "prose-li:my-0.5"
                                        )}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                        <div className={cn(
                                            "text-[10px] mt-1 opacity-50",
                                            msg.role === 'user' ? "text-right" : "text-left"
                                        )}>
                                            {format(msg.timestamp, 'h:mm a')}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Loading Indicator */}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="p-3 bg-zinc-800 rounded-2xl rounded-bl-md border border-white/5">
                                        <div className="flex items-center gap-1.5">
                                            <Loader2 size={14} className="animate-spin text-purple-400" />
                                            <span className="text-xs text-white/50">Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pending Action Confirmation */}
                            {pendingAction && !isLoading && (
                                <div className="flex justify-start">
                                    <div className="p-3 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-2xl rounded-bl-md max-w-[95%]">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertCircle size={14} className="text-purple-400" />
                                            <span className="text-xs font-semibold text-purple-300">Confirm Action</span>
                                        </div>
                                        <p className="text-sm text-white mb-3">{pendingAction.description}</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleConfirmAction}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-medium transition-colors"
                                            >
                                                <Check size={14} />
                                                Confirm
                                            </button>
                                            <button
                                                onClick={handleDeclineAction}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-xs font-medium transition-colors"
                                            >
                                                <X size={14} />
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <form
                            onSubmit={handleSendMessage}
                            className="shrink-0 p-3 border-t border-white/10 bg-zinc-900/80"
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder="Ask me anything..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/30"
                                    disabled={isLoading}
                                />
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || isLoading}
                                    className="p-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed rounded-full text-white transition-all shrink-0"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}

// Export function to check/control visibility from other components
export function showAIWidget() {
    (window as any).__showAIWidget?.();
}

export function hideAIWidget() {
    (window as any).__hideAIWidget?.();
}

export function isAIWidgetVisible(): boolean {
    return (window as any).__isAIWidgetVisible?.() ?? true;
}
