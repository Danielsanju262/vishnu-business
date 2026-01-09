import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// Global state for web fallback
let globalTrapInitialized = false;
let globalTrapCount = 0;
const MIN_TRAP_COUNT = 5;

/**
 * Hook to handle browser/hardware back button behavior across all platforms.
 * 
 * - On native mobile (Capacitor): Uses native back button API
 * - On web/PWA: Falls back to history trap system
 * 
 * @param onBack - Function to call when back button is pressed
 * @param shouldCallOnBack - If false, back is trapped but onBack won't be called
 * @param isRootScreen - If true and on native, pressing back will close the app
 */
export function useBrowserBackButton(
    onBack: () => void,
    shouldCallOnBack: boolean = true,
    isRootScreen: boolean = false
) {
    const onBackRef = useRef(onBack);
    const shouldCallRef = useRef(shouldCallOnBack);
    const isRootRef = useRef(isRootScreen);

    // Track last back press time for throttling (web only)
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

    // NATIVE: Use Capacitor's native back button handling
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) {
            return; // Skip on web, handled below
        }

        let listenerHandle: { remove: () => Promise<void> } | null = null;

        const setupListener = async () => {
            listenerHandle = await App.addListener('backButton', () => {
                // Check if keyboard was visible - close it first
                if (keyboardVisibleRef.current) {
                    const activeElement = document.activeElement as HTMLElement;
                    if (activeElement && activeElement.blur) {
                        activeElement.blur();
                    }
                    return;
                }

                // If we should call onBack and have somewhere to go
                if (shouldCallRef.current && onBackRef.current) {
                    onBackRef.current();
                } else if (isRootRef.current) {
                    // On root screen with nothing to do - minimize app
                    App.minimizeApp();
                }
            });
        };

        setupListener();

        // Track keyboard visibility
        const updateKeyboardState = () => {
            keyboardVisibleRef.current = isKeyboardVisible();
        };

        document.addEventListener('focusin', updateKeyboardState);
        document.addEventListener('focusout', updateKeyboardState);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateKeyboardState);
        }

        return () => {
            if (listenerHandle) {
                listenerHandle.remove();
            }
            document.removeEventListener('focusin', updateKeyboardState);
            document.removeEventListener('focusout', updateKeyboardState);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', updateKeyboardState);
            }
        };
    }, [isKeyboardVisible]);

    // WEB FALLBACK: Use history trap system for browsers/PWA
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            return; // Skip on native, handled above
        }

        // Initialize global trap system on first mount
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

        const handlePopState = () => {
            const now = Date.now();

            // Decrement and replenish trap
            globalTrapCount--;
            window.history.pushState(
                { trap: true, timestamp: now },
                '',
                window.location.href
            );
            globalTrapCount++;

            // Replenish buffer if needed
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

            // Throttle rapid presses
            const timeSinceLastPress = now - lastBackPressRef.current;
            if (timeSinceLastPress < 250 && timeSinceLastPress > 0) {
                return;
            }
            lastBackPressRef.current = now;

            // Handle keyboard
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

            // Call onBack if we should
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

// Helper function to reinitialize web traps (call after hard navigation)
export function reinitializeBackButtonTraps() {
    globalTrapInitialized = false;
    globalTrapCount = 0;
}
