import { useState, useEffect, useCallback } from 'react';

/**
 * A hook that syncs React state with browser history.
 * Use this for multi-step flows (like NewSale's customer → cart → product → details)
 * so that browser back button / edge swipes work correctly.
 * 
 * @param initialStep - The initial step value
 * @param stepKey - Unique key to store in history state (e.g., 'newSaleStep')
 * @returns [currentStep, setStep, goBack] - Similar to useState but synced with history
 */
export function useHistorySyncedStep<T extends string>(
    initialStep: T,
    stepKey: string = 'step'
): [T, (newStep: T, options?: { replace?: boolean }) => void, () => void] {
    const [step, setStepState] = useState<T>(() => {
        // Check if there's a step in the current history state
        const historyStep = window.history.state?.[stepKey];
        return historyStep || initialStep;
    });

    // Handle popstate (back/forward navigation)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            const historyStep = event.state?.[stepKey];
            if (historyStep) {
                setStepState(historyStep);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [stepKey]);

    // Replace current state on mount to include initial step
    useEffect(() => {
        if (!window.history.state?.[stepKey]) {
            window.history.replaceState(
                { ...window.history.state, [stepKey]: step },
                '',
                window.location.href
            );
        }
    }, []);

    // Set step and push to history
    const setStep = useCallback((newStep: T, options?: { replace?: boolean }) => {
        if (newStep !== step) {
            if (options?.replace) {
                window.history.replaceState(
                    { ...window.history.state, [stepKey]: newStep },
                    '',
                    window.location.href
                );
            } else {
                window.history.pushState(
                    { ...window.history.state, [stepKey]: newStep },
                    '',
                    window.location.href
                );
            }
            setStepState(newStep);
        }
    }, [step, stepKey]);

    // Go back (triggers popstate which updates step)
    const goBack = useCallback(() => {
        window.history.back();
    }, []);

    return [step, setStep, goBack];
}
