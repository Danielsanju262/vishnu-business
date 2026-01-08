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
    // Tick to force verification of trap state
    const [tick, setTick] = useState(0);

    useEffect(() => {
        onBackRef.current = onBack;
    }, [onBack]);

    useEffect(() => {
        // If meant to be active:
        if (isActive) {
            // Check if we need to apply the trap
            // 1. If internal ref says not trapped
            // 2. OR if actual browser history differs from our expectation (Safety check)
            const actualTrapped = !!window.history.state?.trap;

            if (!isTrapped.current && !actualTrapped) {
                window.history.pushState({ trap: true, id: Date.now() }, '', window.location.href);
                isTrapped.current = true;
            } else if (actualTrapped && !isTrapped.current) {
                // Sync ref if we missed it
                isTrapped.current = true;
            } else if (!actualTrapped && isTrapped.current) {
                // Repair: We thought we were trapped, but browser is not. Restore it.
                // This catches interruptions or race conditions.
                window.history.pushState({ trap: true, id: Date.now() }, '', window.location.href);
            }
        }
        // If meant to be inactive:
        else if (!isActive && isTrapped.current) {
            isTrapped.current = false;
            // Only cleanup if the trap actually exists to avoid popping "real" history
            if (window.history.state?.trap) {
                window.history.back();
            }
        }
    }, [isActive, tick]);

    useEffect(() => {
        const handlePopState = () => {
            // If we are currently tracking a trap
            if (isTrapped.current) {
                // 1. Immediate Restoration (Synchronous)
                // Prevents the browser from settling on the previous page
                window.history.pushState({ trap: true, id: Date.now() }, '', window.location.href);

                // 2. Trigger Logic
                if (onBackRef.current) {
                    onBackRef.current();
                }

                // 3. Force Verification (Asynchronous)
                // Triggers the effect above to double-check that the trap stuck
                setTick(t => t + 1);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
}
