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
    const [state, setStateInternal] = useState(initialState);
    const stateKeyRef = useRef(stateKey);
    const isInternalChange = useRef(false);

    // Handle popstate (back navigation)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Check if this popstate is for our state key
            const historyState = event.state?.[stateKeyRef.current];

            // If we were true and history doesn't have our state, we're going back
            if (state && historyState !== true) {
                isInternalChange.current = true;
                setStateInternal(false);
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
    // Initialize all states to false
    const initialStates = {} as Record<T, boolean>;
    stateKeys.forEach(key => { initialStates[key] = false; });

    const [states, setStates] = useState(initialStates);
    const isInternalChange = useRef(false);
    const hasHistoryEntry = useRef(false);

    const isAnyActive = Object.values(states).some(v => v);

    // Handle popstate
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            if (hasHistoryEntry.current && !event.state?.[groupKey]) {
                isInternalChange.current = true;
                setStates(initialStates);
                hasHistoryEntry.current = false;
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [groupKey]);

    // Create setters for each state
    const setters = {} as Record<T, (value: boolean) => void>;

    stateKeys.forEach(key => {
        setters[key] = (value: boolean) => {
            setStates(prev => {
                const newStates = { ...prev, [key]: value };
                const willBeActive = Object.values(newStates).some(v => v);

                if (value && !hasHistoryEntry.current) {
                    // Opening first modal - push history
                    window.history.pushState(
                        { ...window.history.state, [groupKey]: true },
                        '',
                        window.location.href
                    );
                    hasHistoryEntry.current = true;
                } else if (!willBeActive && hasHistoryEntry.current && !isInternalChange.current) {
                    // Closing last modal via UI - go back
                    window.history.back();
                    hasHistoryEntry.current = false;
                }

                isInternalChange.current = false;
                return newStates;
            });
        };
    });

    const closeAll = useCallback(() => {
        if (hasHistoryEntry.current) {
            window.history.back();
            hasHistoryEntry.current = false;
        }
        setStates(initialStates);
    }, []);

    return { states, setters, isAnyActive, closeAll };
}
