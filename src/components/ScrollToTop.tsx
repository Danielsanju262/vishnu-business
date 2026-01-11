import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
    const { pathname } = useLocation();

    // Disable browser's automatic scroll restoration
    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        // Cleanup: restore default behavior when component unmounts
        return () => {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'auto';
            }
        };
    }, []);

    // Use useLayoutEffect for immediate scroll before browser paints
    // This ensures no flash of scrolled content
    useLayoutEffect(() => {
        // Scroll to top on route change and initial load
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname]);

    // Also handle initial page load (runs once on mount)
    useEffect(() => {
        // Small timeout to ensure DOM is ready after hydration
        const timer = setTimeout(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }, 0);

        return () => clearTimeout(timer);
    }, []);

    return null;
}
