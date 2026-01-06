import { useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement>(
    handler: (event: MouseEvent | TouchEvent) => void,
    enabled: boolean = true
) {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!enabled) return;

        const listener = (event: MouseEvent | TouchEvent) => {
            const el = ref.current;
            if (!el || el.contains(event.target as Node)) {
                return;
            }
            handler(event);
        };

        // Use mousedown/touchstart for better responsiveness
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);

        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [handler, enabled]);

    return ref;
}
