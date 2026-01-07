

import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertCircle } from "lucide-react";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "destructive",
}: ConfirmationModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            showCloseButton={false} // Cleaner look for confirmation
        >
            <div className="flex flex-col items-center text-center p-2">
                <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center mb-4
                    ${variant === 'destructive' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}
                `}>
                    <AlertCircle size={24} />
                </div>

                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                    {title}
                </h3>

                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-[280px]">
                    {description}
                </p>

                <div className="grid grid-cols-2 gap-3 w-full">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="w-full"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="w-full"
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
