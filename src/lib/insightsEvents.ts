/**
 * Simple Event Emitter for cross-component communication
 * Used to notify the insights system when data changes
 */

type EventCallback = () => void;

class InsightsEventEmitter {
    private listeners: Map<string, Set<EventCallback>> = new Map();

    /**
     * Subscribe to an event
     */
    on(event: string, callback: EventCallback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    /**
     * Emit an event to all listeners
     */
    emit(event: string): void {
        console.log(`[InsightsEvent] Emitting: ${event}`);
        this.listeners.get(event)?.forEach(callback => {
            try {
                callback();
            } catch (e) {
                console.error('[InsightsEvent] Callback error:', e);
            }
        });
    }
}

// Singleton instance
export const insightsEvents = new InsightsEventEmitter();

// Event names for type safety
export const INSIGHTS_EVENTS = {
    SALE_ADDED: 'sale_added',
    EXPENSE_ADDED: 'expense_added',
    PAYMENT_COLLECTED: 'payment_collected',
    PAYMENT_REMINDER_UPDATED: 'payment_reminder_updated',
    PAYABLE_PAID: 'payable_paid',
    ACCOUNTS_PAYABLE_UPDATED: 'accounts_payable_updated',
    DATA_CHANGED: 'data_changed', // Generic event for any change
} as const;

/**
 * Helper function to emit data change event
 * Call this after any action that might affect tasks
 */
export function notifyDataChanged(): void {
    insightsEvents.emit(INSIGHTS_EVENTS.DATA_CHANGED);
}

/**
 * Helper function to notify when a sale is added
 */
export function notifySaleAdded(): void {
    insightsEvents.emit(INSIGHTS_EVENTS.SALE_ADDED);
    insightsEvents.emit(INSIGHTS_EVENTS.DATA_CHANGED);
}

/**
 * Helper function to notify when an expense is added
 */
export function notifyExpenseAdded(): void {
    insightsEvents.emit(INSIGHTS_EVENTS.EXPENSE_ADDED);
    insightsEvents.emit(INSIGHTS_EVENTS.DATA_CHANGED);
}

/**
 * Helper function to notify when a payment is collected
 */
export function notifyPaymentCollected(): void {
    insightsEvents.emit(INSIGHTS_EVENTS.PAYMENT_COLLECTED);
    insightsEvents.emit(INSIGHTS_EVENTS.DATA_CHANGED);
}

/**
 * Helper function to notify when a payable is paid
 */
export function notifyPayablePaid(): void {
    insightsEvents.emit(INSIGHTS_EVENTS.PAYABLE_PAID);
    insightsEvents.emit(INSIGHTS_EVENTS.DATA_CHANGED);
}
