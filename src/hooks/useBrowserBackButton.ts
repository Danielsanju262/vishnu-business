import { useEffect, useRef, useState } from 'react';

/**
 * Hook to handle browser back button behavior
 * 
 * @param onBack - Function to call when back button is pressed while "active" (trapped)
 * @param isActive - Whether to trap the back button. If true, a history entry is added. 
 *                   If false, standard navigation behavior applies.
 */
export function useBrowserBackButton(
    onBack: () => void,
    isActive: boolean = false
) {
    const onBackRef = useRef(onBack);
    // Track if we currently own a history trap
    const isTrapped = useRef(false);
    // Trigger to force re-evaluation after popstate
    const [tick, setTick] = useState(0);

    useEffect(() => {
        onBackRef.current = onBack;
    }, [onBack]);

    useEffect(() => {
        // If becoming active and not trapped, push trap
        if (isActive && !isTrapped.current) {
            window.history.pushState({ trap: true, id: Date.now() }, '', window.location.href);
            isTrapped.current = true;
        }
        // If becoming inactive but strictly trapped, remove trap
        else if (!isActive && isTrapped.current) {
            // We assume if isTrapped is true, we haven't popped it yet.
            // This handles the case where the user closes the modal via UI button (not back button)
            window.history.back();
            isTrapped.current = false;
        }
    }, [isActive, tick]);

    useEffect(() => {
        const handlePopState = () => {
            // If we were trapped, and a pop happens, it means the trap was consumed.
            if (isTrapped.current) {
                isTrapped.current = false;

                // Allow browser to settle the pop event before re-evaluating
                setTimeout(() => {
                    // Notify parent to handle the "Back" intent (e.g. close modal)
                    onBackRef.current();
                    // Force re-evaluation to potentially restore trap
                    setTick(t => t + 1);
                }, 10);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
}
