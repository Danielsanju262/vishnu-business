import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * This hook ensures that if a user opens the app directly on a deep link (e.g., /reports)
 * and presses the back button, instead of closing the app, they are taken to the dashboard.
 * 
 * Strategy:
 * When the app loads on a non-root path, we manipulate the history stack:
 * 1. Replace the current "entry" with the home path ('/').
 * 2. Immediately push the actual current path back on top.
 * 
 * Result: The history stack looks like [..., '/', '/current-path']
 * So pressing Back goes to '/', which React Router handles by rendering the Dashboard.
 */
export function useDeepLinkBackHandler() {
    const location = useLocation();
    const hasHandledDeepLink = useRef(false);

    useEffect(() => {
        // Only run once on mount
        if (hasHandledDeepLink.current) return;
        hasHandledDeepLink.current = true;

        // If we are starting on the dashboard, no need to do anything
        if (location.pathname === "/") return;

        // Check if we have history state indicating we came from internal navigation
        // React Router usually sets a 'key' in state. If state is null, it's likely a fresh load.
        // However, even simply checking for "fresh load" is hard reliably. 
        // We'll stick to the robust insertion method. The side effect of an extra "Home" entry 
        // on refresh is minimal compared to the app closing.

        const currentPath = location.pathname + location.search + location.hash;

        // 1. Physically replace current browser history entry with Dashboard
        // Note: React Router doesn't listen to this directly so it won't render Home yet.
        window.history.replaceState(null, "", "/");

        // 2. Push the actual path back on top
        // React Router sees this as "we are where we were", so no re-render needed.
        window.history.pushState(null, "", currentPath);

    }, []); // Empty dependency array = run only on mount
}
