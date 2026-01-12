import { useState, useEffect } from 'react';

export function useIsMobileKeyboardOpen() {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    useEffect(() => {
        // Only run on client-side
        if (typeof window === 'undefined') return;

        // Store the initial window height to compare against
        const initialHeight = window.innerHeight;

        const checkKeyboard = () => {
            // Logic: If the current visual viewport height is significantly smaller 
            // than the initial window height (by >150px or ~20%), we assume the keyboard 
            // is open or the device is in a cramped landscape mode.
            // In both cases, hiding fixed bottom elements is usually good UX.

            const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const heightDifference = initialHeight - currentHeight;

            // We use a threshold of 150px. Approximate height of a minimal keyboard or significant resize.
            if (heightDifference > 150) {
                setIsKeyboardOpen(true);
            } else {
                setIsKeyboardOpen(false);
            }
        };

        // Use visualViewport API if available for better mobile support
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', checkKeyboard);
        } else {
            window.addEventListener('resize', checkKeyboard);
        }

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', checkKeyboard);
            } else {
                window.removeEventListener('resize', checkKeyboard);
            }
        };
    }, []);

    return isKeyboardOpen;
}
