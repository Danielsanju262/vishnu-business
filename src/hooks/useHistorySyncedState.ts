import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * A hook that syncs a boolean state (like modal open/close) with browser history.
 * When the state becomes true, a history entry is pushed.
 * When back is pressed, the state becomes false.
 * 
 * Use this for modals, dropdowns, selection modes, etc.
 * This makes edge swipes and back gestures work to close modals.
 * 
 * @param initialState - Initial boolean state (usually false)
 * @param stateKey - Unique key for this state in history (e.g., 'customDateModal')
 * @returns [state, setState] - Similar to useState but synced with history
 */
export function useHistorySyncedState(
    initialState: boolean = false,
    stateKey: string
): [boolean, (newState: boolean) => void] {
    // Initialize from history if present, otherwise use initial state
    const [state, setStateInternal] = useState(() => {
        // Safe check for window existence (SSR safe-ish, though this is client hook)
        if (typeof window !== 'undefined' && window.history.state?.[stateKey]) {
            return true;
        }
        return initialState;
    });

    const stateKeyRef = useRef(stateKey);
    const isInternalChange = useRef(false);

    // Sync state with history on mount (ensure history reflects current state)
    // This handles cases where we load with initialState=true but history doesn't have it
    useEffect(() => {
        const historyValue = window.history.state?.[stateKeyRef.current];
        if (state && !historyValue) {
            // We are open, but history says closed/missing -> Replace to add marker
            window.history.replaceState(
                { ...window.history.state, [stateKeyRef.current]: true },
                '',
                window.location.href
            );
        } else if (!state && historyValue) {
            // We are closed, but history says open -> Replace to remove marker
            // This effectively "cleans" the phantom entry if we opted to start closed
            // But since we opted to "start from history" in useState, this branch shouldn't hit 
            // unless we forced initialState=false in a way I ignored?
            // Actually, if we want to support "always start closed", we would do this.
            // But "start from history" is better for "Back" navigation.
            // Let's keep it consistent.

            // NOTE: If we want to strictly follow history, we barely need this logic,
            // but for robustness:
            const newState = { ...window.history.state };
            delete newState[stateKeyRef.current];
            window.history.replaceState(newState, '', window.location.href);
        }
    }, [state]);

    // Handle popstate (back navigation)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Check if this popstate is for our state key
            const historyState = event.state?.[stateKeyRef.current];

            // Sync internal state to history state
            if (historyState === true) {
                if (!state) setStateInternal(true);
            } else {
                if (state) {
                    isInternalChange.current = true;
                    setStateInternal(false);
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [state]);

    // Set state and manage history
    const setState = useCallback((newState: boolean) => {
        if (newState === state) return;

        if (newState) {
            // Opening - push history entry
            window.history.pushState(
                { ...window.history.state, [stateKeyRef.current]: true },
                '',
                window.location.href
            );
            setStateInternal(true);
        } else {
            // Closing
            if (!isInternalChange.current) {
                // User closed via UI button - go back in history
                window.history.back();
            }
            isInternalChange.current = false;
            setStateInternal(false);
        }
    }, [state]);

    return [state, setState];
}

/**
 * Hook for multiple related boolean states that should all close on back press.
 * When any state becomes true, a history entry is pushed.
 * When back is pressed, all states become false.
 * 
 * @param stateKeys - Array of state names (e.g., ['showModal', 'showDropdown'])
 * @param groupKey - Unique key for this group in history
 * @returns Object with each state and its setter, plus an isAnyActive boolean
 */
export function useHistorySyncedStates<T extends string>(
    stateKeys: readonly T[],
    groupKey: string
): {
    states: Record<T, boolean>;
    setters: Record<T, (value: boolean) => void>;
    isAnyActive: boolean;
    closeAll: () => void;
} {
    // Initialize states
    const [states, setStates] = useState<Record<T, boolean>>(() => {
        const initialStates = {} as Record<T, boolean>;
        // Check history: if groupKey is present, we don't necessarily know WHICH one was active, 
        // as we only tracked "groupKey: true". 
        // This is a limitation of the original implementation.
        // However, we default to false unless we can persist granular state.
        // Given the simplified "groupKey" (one boolean), we can't restore EXACT state if multiple exist.
        // BUT, if the group implementation implies only one is active at a time?
        // Or if we just accept we can't restore perfectly without changing the history structure.

        // BETTER FIX: If history thinks we are open, but we don't know which one, 
        // we might be in a "phantom" state.
        // To fix the loop, we should probably REPLACE the state to remove the groupKey 
        // if we are initializing to all false.

        stateKeys.forEach(key => { initialStates[key] = false; });
        return initialStates;
    });

    const isInternalChange = useRef(false);
    const hasHistoryEntry = useRef(false);

    // Initial Sync: If history has the key but we are all closed, remove the key from history
    // This prevents the "duplicate" (phantom) history entry.
    useEffect(() => {
        if (window.history.state?.[groupKey]) {
            // We are mounting fresh (all false), but history says "Active".
            // Since we don't know WHICH one was active, we can't open it.
            // So we must CLEAN UP the history to match our state (Closed).
            const newState = { ...window.history.state };
            delete newState[groupKey];
            window.history.replaceState(newState, '', window.location.href);
        }
    }, [groupKey]);

    const isAnyActive = Object.values(states).some(v => v);

    // Handle popstate
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Note: We check 'hasHistoryEntry.current' to know if WE pushed it.
            // But if we navigated back to here, 'hasHistoryEntry.current' might be false (ref reset).
            // We rely on the event state.

            if (!event.state?.[groupKey]) {
                // History says "Closed".
                if (isAnyActive) {
                    isInternalChange.current = true;
                    // Reset all to false
                    const resetStates = {} as Record<T, boolean>;
                    stateKeys.forEach(key => { resetStates[key] = false; });
                    setStates(resetStates);
                    hasHistoryEntry.current = false;
                }
            } else {
                // History says "Open". But we might be closed?
                // If we are closed, do we open something? No, we don't know what.
                // This is the asymmetry. 
                // Ideally, we'd update `useHistorySyncedStates` to save the specific active key in history.
                // For now, this hook is less robust than the single one. 
                // But ensuring we close when history says close is the main job.
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [groupKey, isAnyActive, stateKeys]);

    // Create setters for each state
    const setters = {} as Record<T, (value: boolean) => void>;

    stateKeys.forEach(key => {
        setters[key] = (value: boolean) => {
            setStates(prev => {
                const newStates = { ...prev, [key]: value };
                const willBeActive = Object.values(newStates).some(v => v);
                const wasActive = Object.values(prev).some(v => v);

                // Logic:
                // If transitioning form None Active -> Some Active: Push State
                // If transitioning form Some Active -> None Active: Back State
                // If transitioning form Some Active -> Some Active (switching): Do nothing to history

                if (willBeActive && !wasActive) {
                    // Opening first modal - push history
                    // Ensure we haven't already marked it (shouldn't happen if !wasActive, but refs can stay if unmounted?)
                    // hasHistoryEntry ref is local to this mount.
                    window.history.pushState(
                        { ...window.history.state, [groupKey]: true },
                        '',
                        window.location.href
                    );
                    hasHistoryEntry.current = true;
                } else if (!willBeActive && wasActive) {
                    // Closing last modal
                    if (!isInternalChange.current) {
                        // UI triggered close
                        window.history.back();
                    }
                    hasHistoryEntry.current = false;
                }

                isInternalChange.current = false;
                return newStates;
            });
        };
    });

    const closeAll = useCallback(() => {
        const anyActive = Object.values(states).some(v => v);
        if (anyActive) {
            window.history.back();
            // The popstate handler will reset the state
            // But we also reset local state immediately for responsiveness?
            // Actually, window.history.back() is async-ish.
            // But usually we want to let the popstate handler do it OR do it manually.
            // If we do it manually, we need to set isInternalChange.
            // But simplicity: let history drive it if we pushed it.
            // Wait, if we pushed it, we go back.
        } else {
            // Already closed, just reset state to be sure
            const resetStates = {} as Record<T, boolean>;
            stateKeys.forEach(key => { resetStates[key] = false; });
            setStates(resetStates);
        }
    }, [states, stateKeys]);

    return { states, setters, isAnyActive, closeAll };
}
