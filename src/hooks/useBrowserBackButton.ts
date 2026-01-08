import { useEffect, useRef } from 'react';

/**
 * Hook to handle browser back button behavior
 * Prevents default browser navigation and uses custom handler instead
 * 
 * @param onBack - Custom function to call when back button is pressed
 * @param shouldHandle - Whether to handle the back button (default: true)
 */
export function useBrowserBackButton(
    onBack: () => boolean | void,
    shouldHandle: boolean = true
) {
    // Keep reference to the callback to avoid re-running effect when callback changes
    const onBackRef = useRef(onBack);
    // Capture the URL that we want to lock to
    const checkPointUrl = useRef(window.location.href);

    // Update handler reference whenever it changes
    useEffect(() => {
        onBackRef.current = onBack;
    }, [onBack]);

    useEffect(() => {
        if (!shouldHandle) return;

        // Arm the trap with current URL - Capture BEFORE the back event happens
        // We use a unique state object to ensure the browser creates a new history entry
        // even if the URL is the same.
        const trapState = { isTrap: true, time: Date.now() };
        checkPointUrl.current = window.location.href;
        window.history.pushState(trapState, '', checkPointUrl.current);

        const handlePopState = () => {
            // We've already popped here. The URL might have changed to the previous page.

            // Call the callback to see if we should trap (stay) or let go
            let shouldStay = false;
            if (onBackRef.current) {
                shouldStay = onBackRef.current() === true;
            }

            if (shouldStay) {
                // Restore the state to our checkpoint
                window.history.pushState(trapState, '', checkPointUrl.current);
            }
            // Else: we let the pop stand. User goes to previous page.
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [shouldHandle]);
}
