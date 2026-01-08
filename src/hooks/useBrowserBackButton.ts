
import { useEffect, useRef } from 'react';

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
            // Important: Mark as not trapped BEFORE calling back() to prevent
            // the popstate handler from re-trapping
            isTrapped.current = false;
            window.history.back();
        }
    }, [isActive]);

    useEffect(() => {
        const handlePopState = () => {
            // If we were trapped, and a pop happens, it means the user tried to go back.
            if (isTrapped.current) {
                // IMMEDIATE TRAP RESTORATION
                // We push state immediately to effectively "cancel" the back navigation from the user's perspective
                // and keep the history stack size constant.
                window.history.pushState({ trap: true, id: Date.now() }, '', window.location.href);

                // Now we handle the logical "back" action (e.g., change modal state)
                if (onBackRef.current) {
                    onBackRef.current();
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
}
