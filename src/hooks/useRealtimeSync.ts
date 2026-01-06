import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'customers' | 'products' | 'transactions' | 'expenses' | 'expense_presets' | 'payment_reminders';

// Configuration - set to true to use Supabase Realtime (requires paid plan or free tier limits)
// Set to false to use polling (works on any plan, completely free)
const USE_REALTIME = false;
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds when not using realtime

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
export function useRealtimeSync({ tables, onDataChange }: UseRealtimeSyncOptions) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    // Initialize connected state based on mode to enable "Always Online" feel
    const [isConnected, setIsConnected] = useState(!USE_REALTIME);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const setupRealtimeSubscription = useCallback(() => {
        // Create a unique channel name
        const channelName = `realtime-sync-${Date.now()}`;

        // Create channel with all table subscriptions
        let channel = supabase.channel(channelName);

        tables.forEach(table => {
            channel = channel
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: table,
                    },
                    (payload) => {
                        console.log(`[Realtime] INSERT on ${table}:`, payload);
                        onDataChange(table, { event: 'INSERT', ...payload });
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: table,
                    },
                    (payload) => {
                        console.log(`[Realtime] UPDATE on ${table}:`, payload);
                        onDataChange(table, { event: 'UPDATE', ...payload });
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'DELETE',
                        schema: 'public',
                        table: table,
                    },
                    (payload) => {
                        console.log(`[Realtime] DELETE on ${table}:`, payload);
                        onDataChange(table, { event: 'DELETE', ...payload });
                    }
                );
        });

        // Subscribe to the channel
        channel.subscribe((status) => {
            console.log(`[Realtime] Subscription status: ${status}`);
            setIsConnected(status === 'SUBSCRIBED');
        });

        channelRef.current = channel;
    }, [tables, onDataChange]);

    const setupPolling = useCallback(() => {
        // Initial state - we're "connected" via polling
        setIsConnected(true);

        // Set up polling interval
        pollingIntervalRef.current = setInterval(() => {
            console.log(`[Polling] Checking for updates...`);
            // Trigger a change event for each table to force refetch
            tables.forEach(table => {
                onDataChange(table, { event: 'POLL', polled: true });
            });
        }, POLLING_INTERVAL_MS);

        console.log(`[Polling] Started with ${POLLING_INTERVAL_MS}ms interval`);
    }, [tables, onDataChange]);

    useEffect(() => {
        if (USE_REALTIME) {
            setupRealtimeSubscription();
        } else {
            setupPolling();
        }

        // Cleanup on unmount
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            setIsConnected(false);
        };
    }, [setupRealtimeSubscription, setupPolling]);

    return { isConnected, isPolling: !USE_REALTIME };
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
