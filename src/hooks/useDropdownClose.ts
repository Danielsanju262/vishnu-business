import { useEffect, useCallback } from "react";

/**
 * Hook to close dropdowns/menus on:
 * 1. Click/touch anywhere outside
 * 2. ESC key press
 * 
 * @param isOpen - Whether the dropdown is currently open
 * @param onClose - Function to close the dropdown
 */
export function useDropdownClose<T extends HTMLElement>(
    isOpen: boolean,
    onClose: () => void,
    ignoreRef?: React.RefObject<T | null>,
    additionalRefs: React.RefObject<HTMLElement | null>[] = []
) {
    // Handle click/touch outside
    const handleClickOutside = useCallback((event: MouseEvent | TouchEvent) => {
        const target = event.target as Node;

        // If an ignoreRef is provided, check if the click was inside it
        if (ignoreRef?.current && ignoreRef.current.contains(target)) {
            return;
        }

        // Check additional refs
        if (additionalRefs.some(ref => ref.current && ref.current.contains(target))) {
            return;
        }

        // The dropdown menus typically use stopPropagation on their trigger buttons
        // So if we reach here, it means the click was outside the dropdown
        if (isOpen) {
            onClose();
        }
    }, [isOpen, onClose, ignoreRef, additionalRefs]);

    // Handle ESC key
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === "Escape" && isOpen) {
            onClose();
        }
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;

        // Use a small delay to avoid closing on the same click that opened it
        const timeoutId = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
            window.addEventListener("keydown", handleKeyDown);
        }, 10);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, handleClickOutside, handleKeyDown]);
}
