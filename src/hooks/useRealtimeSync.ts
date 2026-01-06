import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'customers' | 'products' | 'transactions' | 'expenses' | 'expense_presets' | 'payment_reminders';

interface UseRealtimeSyncOptions {
    tables: TableName[];
    onDataChange: (table: TableName, payload: any) => void;
}

/**
 * Custom hook for real-time synchronization across devices using Supabase Realtime
 * 
 * This hook subscribes to changes in specified database tables and triggers
 * callbacks when INSERT, UPDATE, or DELETE events occur, enabling live updates
 * across all connected devices without requiring page reload.
 */
export function useRealtimeSync({ tables, onDataChange }: UseRealtimeSyncOptions) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const setupSubscription = useCallback(() => {
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

    useEffect(() => {
        setupSubscription();

        // Cleanup on unmount
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                setIsConnected(false);
            }
        };
    }, [setupSubscription]);

    return { isConnected };
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

    const handleChange = useCallback(() => {
        // Skip refetch on initial mount since we already fetch data in useEffect
        if (isInitialMount.current) {
            return;
        }
        console.log(`[Realtime] Refetching ${tableName} due to change...`);
        fetchData();
    }, [tableName, fetchData]);

    useEffect(() => {
        isInitialMount.current = false;
    }, []);

    const { isConnected } = useRealtimeSync({
        tables: [tableName],
        onDataChange: handleChange,
    });

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, deps);

    return { isConnected };
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

    const handleChange = useCallback((table: TableName) => {
        if (isInitialMount.current) {
            return;
        }
        console.log(`[Realtime] Refetching data due to change in ${table}...`);
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        isInitialMount.current = false;
    }, []);

    const { isConnected } = useRealtimeSync({
        tables: tableNames,
        onDataChange: handleChange,
    });

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, deps);

    return { isConnected };
}
