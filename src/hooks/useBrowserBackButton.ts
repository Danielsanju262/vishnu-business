import { useEffect, useRef, useCallback } from 'react';

// Global state for history trap (web/PWA)
let globalTrapInitialized = false;
let globalTrapCount = 0;
const MIN_TRAP_COUNT = 5;

/**
 * Hook to handle back button behavior across all platforms and navigation methods.
 * 
 * Works with:
 * - Hardware back button (Android legacy)
 * - Edge swipe gestures (Android 10+)
 * - Bottom gesture bar swipe up
 * - Browser back button
 * - In-app UI back buttons
 * 
 * Strategy:
 * - Let the system handle all back gestures/buttons via window.history.back()
 * - Use popstate listener to intercept and handle navigation
 * - Keep history trap for root screen to prevent app from closing
 * 
 * @param onBack - Function to call when back is triggered
 * @param shouldCallOnBack - If false, back is trapped but onBack won't be called
 * @param isRootScreen - If true, back press is trapped (doesn't close app)
 */
export function useBrowserBackButton(
    onBack: () => void,
    shouldCallOnBack: boolean = true,
    isRootScreen: boolean = false
) {
    const onBackRef = useRef(onBack);
    const shouldCallRef = useRef(shouldCallOnBack);
    const isRootRef = useRef(isRootScreen);

    // Track last back press time for throttling
    const lastBackPressRef = useRef<number>(0);
    // Track if keyboard was visible before back press
    const keyboardVisibleRef = useRef(false);

    // Update refs when props change
    useEffect(() => {
        onBackRef.current = onBack;
    }, [onBack]);

    useEffect(() => {
        shouldCallRef.current = shouldCallOnBack;
    }, [shouldCallOnBack]);

    useEffect(() => {
        isRootRef.current = isRootScreen;
    }, [isRootScreen]);

    // Utility function to check if keyboard is likely visible
    const isKeyboardVisible = useCallback((): boolean => {
        const activeElement = document.activeElement;
        const isInputFocused = !!(activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            (activeElement as HTMLElement).contentEditable === 'true'
        ));

        if (window.visualViewport) {
            const viewportHeight = window.visualViewport.height;
            const windowHeight = window.innerHeight;
            const keyboardLikelyOpen = viewportHeight < windowHeight * 0.75;
            return isInputFocused && keyboardLikelyOpen;
        }

        return isInputFocused;
    }, []);

    // Unified back handling via popstate - works for all platforms and navigation methods
    useEffect(() => {
        // Initialize history trap on first mount (prevents app from closing at root)
        if (!globalTrapInitialized) {
            globalTrapInitialized = true;
            for (let i = 0; i < MIN_TRAP_COUNT; i++) {
                window.history.pushState(
                    { trap: true, index: i, timestamp: Date.now() },
                    '',
                    window.location.href
                );
                globalTrapCount++;
            }
        }

        // Track keyboard visibility
        const updateKeyboardState = () => {
            keyboardVisibleRef.current = isKeyboardVisible();
        };

        document.addEventListener('focusin', updateKeyboardState);
        document.addEventListener('focusout', updateKeyboardState);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateKeyboardState);
        }

        // Handle all back navigation via popstate
        // This catches: hardware back, edge swipes, gesture bar, browser back
        const handlePopState = () => {
            const now = Date.now();

            // Replenish history trap (prevents app from closing)
            globalTrapCount--;
            window.history.pushState(
                { trap: true, timestamp: now },
                '',
                window.location.href
            );
            globalTrapCount++;

            // Ensure buffer is maintained
            if (globalTrapCount < MIN_TRAP_COUNT) {
                for (let i = globalTrapCount; i < MIN_TRAP_COUNT; i++) {
                    window.history.pushState(
                        { trap: true, index: i, timestamp: now },
                        '',
                        window.location.href
                    );
                    globalTrapCount++;
                }
            }

            // Throttle rapid back presses (250ms)
            const timeSinceLastPress = now - lastBackPressRef.current;
            if (timeSinceLastPress < 250 && timeSinceLastPress > 0) {
                return;
            }
            lastBackPressRef.current = now;

            // If keyboard is open, close it first without navigating
            if (keyboardVisibleRef.current) {
                const activeElement = document.activeElement as HTMLElement;
                if (activeElement && activeElement.blur) {
                    activeElement.blur();
                }
                setTimeout(() => {
                    keyboardVisibleRef.current = isKeyboardVisible();
                }, 100);
                return;
            }

            // If on root screen, back is trapped (don't navigate or close app)
            if (isRootRef.current && !shouldCallRef.current) {
                return; // Trapped - do nothing
            }

            // Call the onBack handler
            if (shouldCallRef.current && onBackRef.current) {
                onBackRef.current();
            }
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            document.removeEventListener('focusin', updateKeyboardState);
            document.removeEventListener('focusout', updateKeyboardState);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', updateKeyboardState);
            }
        };
    }, [isKeyboardVisible]);
}

// Helper function to reinitialize traps (call after hard navigation if needed)
export function reinitializeBackButtonTraps() {
    globalTrapInitialized = false;
    globalTrapCount = 0;
}
