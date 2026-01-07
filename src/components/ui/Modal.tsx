import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { createPortal } from "react-dom";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: React.ReactNode;
    className?: string; // Content container class
    showCloseButton?: boolean;
}

export function Modal({ isOpen, onClose, children, title, className, showCloseButton = true }: ModalProps) {
    // US-15: Lock Background Scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // US-22: Close on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // US-14: Center All Popups & US-17: Fixed positioning relative to viewport
    const content = (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                onClick={onClose}
                onTouchStart={onClose}
            />

            {/* Content */}
            <div
                className={cn(
                    "relative w-full max-w-sm bg-popover border border-border rounded-2xl shadow-2xl p-6 transition-all animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto",
                    "mx-auto my-auto", // Ensure visual centering
                    className
                )}
                role="dialog"
                aria-modal="true"
            >
                {showCloseButton && (
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 text-muted-foreground hover:bg-accent rounded-full transition z-10"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                )}

                {title && (
                    <div className="mb-6 text-center space-y-2">
                        {title}
                    </div>
                )}

                {children}
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
