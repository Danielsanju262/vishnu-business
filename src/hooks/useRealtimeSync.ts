import { useEffect, useCallback, useRef } from 'react';
// import { supabase } from '../lib/supabase';
// import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'customers' | 'products' | 'transactions' | 'expenses' | 'expense_presets' | 'payment_reminders';

// Configuration - set to true to use Supabase Realtime (requires paid plan or free tier limits)
// Set to false to use polling (works on any plan, completely free)
// const USE_REALTIME = false;
// const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds when not using realtime

interface UseRealtimeSyncOptions {
    tables: TableName[];
    onDataChange: (table: TableName, payload: any) => void;
}

/**
 * Custom hook for real-time synchronization across devices
 * 
 * This hook supports two modes:
 * 1. Supabase Realtime (WebSocket) - instant updates, may require paid plan
 * 2. Polling (free) - checks for updates every few seconds, works on any plan
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useRealtimeSync({ tables: _tables, onDataChange: _onDataChange }: UseRealtimeSyncOptions) {
    // Real-time sync disabled as per user request
    return { isConnected: false, isPolling: false };
}

/**
 * Simple hook for single table subscription with auto-refresh
 */
export function useRealtimeTable(
    tableName: TableName,
    fetchData: () => Promise<void>,
    deps: React.DependencyList = []
) {
    const isInitialMount = useRef(true);
    const lastFetchTime = useRef(Date.now());

    const handleChange = useCallback(() => {
        // Skip refetch on initial mount since we already fetch data in useEffect
        if (isInitialMount.current) {
            return;
        }

        // Throttle polling refetches to avoid too many requests
        const now = Date.now();
        if (now - lastFetchTime.current < 2000) {
            return; // Skip if last fetch was less than 2 seconds ago
        }

        console.log(`[Sync] Refetching ${tableName} due to change...`);
        lastFetchTime.current = now;
        fetchData();
    }, [tableName, fetchData]);

    useEffect(() => {
        isInitialMount.current = false;
    }, []);

    const { isConnected, isPolling } = useRealtimeSync({
        tables: [tableName],
        onDataChange: handleChange,
    });

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, deps);

    return { isConnected, isPolling };
}

/**
 * Hook for subscribing to multiple tables with a single refetch callback
 */
export function useRealtimeTables(
    tableNames: TableName[],
    fetchData: () => Promise<void>,
    deps: React.DependencyList = []
) {
    const isInitialMount = useRef(true);
    const lastFetchTime = useRef(Date.now());

    const handleChange = useCallback((table: TableName) => {
        if (isInitialMount.current) {
            return;
        }

        // Throttle polling refetches to avoid too many requests
        const now = Date.now();
        if (now - lastFetchTime.current < 2000) {
            return; // Skip if last fetch was less than 2 seconds ago
        }

        console.log(`[Sync] Refetching data due to change in ${table}...`);
        lastFetchTime.current = now;
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        isInitialMount.current = false;
    }, []);

    const { isConnected, isPolling } = useRealtimeSync({
        tables: tableNames,
        onDataChange: handleChange,
    });

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, deps);

    return { isConnected, isPolling };
}
