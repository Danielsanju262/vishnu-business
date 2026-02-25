import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/toast-provider';
import { processOverdueRecurringGoals } from '../lib/aiMemory';

export const useRecurringReminders = () => {
    const { toast } = useToast();
    const isProcessing = useRef(false);
    const lastProcessed = useRef<number>(0);
    const PROCESS_INTERVAL = 60 * 1000; // 1 minute throttle to prevent spam on quick tab switches

    useEffect(() => {
        const processAllBackgroundTasks = async () => {
            const now = Date.now();

            if (isProcessing.current || (now - lastProcessed.current) < PROCESS_INTERVAL) {
                return;
            }

            isProcessing.current = true;
            lastProcessed.current = now;

            try {
                // 1. Process Overdue Recurring Goals Globally
                const overdueResult = await processOverdueRecurringGoals();
                if (overdueResult.completed.length > 0) {
                    toast(`Auto-completed recurring goals: ${overdueResult.completed.join(', ')}`, 'info');
                }
                if (overdueResult.incompleted.length > 0) {
                    toast(`Missed deadline: ${overdueResult.incompleted.join(', ')}`, 'warning');
                }

                // 2. Process Recurring Payment Reminders
                const nowDate = new Date();
                const nowIso = nowDate.toISOString();

                const { data: configs, error } = await supabase
                    .from('recurring_reminder_configs')
                    .select('*')
                    .eq('is_active', true)
                    .lte('next_run_at', nowIso);

                if (error) {
                    console.error('Error fetching recurring configs:', error);
                    return;
                }

                if (!configs || configs.length === 0) return;

                let generatedCount = 0;

                for (const config of configs) {
                    const dateStr = nowDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const timeStr = nowDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const note = config.note
                        ? `${config.note}\n[Auto-Generated on ${dateStr} ${timeStr}]`
                        : `[Auto-Generated Recurring Reminder on ${dateStr} ${timeStr}]`;

                    const { error: insertError } = await supabase
                        .from('payment_reminders')
                        .insert({
                            customer_id: config.customer_id,
                            amount: config.amount,
                            due_date: nowIso.split('T')[0],
                            status: 'pending',
                            note: note
                        });

                    if (insertError) {
                        console.error('Failed to generate reminder for config', config.id, insertError);
                        continue;
                    }

                    const nextRun = new Date(config.next_run_at);
                    let newNextRun = new Date(nextRun);

                    while (newNextRun <= nowDate) {
                        if (config.frequency === 'daily') {
                            newNextRun.setDate(newNextRun.getDate() + 1);
                        } else if (config.frequency === 'weekly') {
                            newNextRun.setDate(newNextRun.getDate() + 7);
                        } else if (config.frequency === 'monthly') {
                            newNextRun.setMonth(newNextRun.getMonth() + 1);
                        }
                    }

                    await supabase
                        .from('recurring_reminder_configs')
                        .update({
                            last_generated_at: nowIso,
                            next_run_at: newNextRun.toISOString()
                        })
                        .eq('id', config.id);

                    generatedCount++;
                }

                if (generatedCount > 0) {
                    toast(`${generatedCount} recurring reminders generated`, "success");
                    window.dispatchEvent(new Event('payment-reminders-updated'));
                }

            } catch (err) {
                console.error('Error processing background tasks:', err);
            } finally {
                isProcessing.current = false;
            }
        };

        // Run immediately on mount
        processAllBackgroundTasks();

        // Run when window gains focus 
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                processAllBackgroundTasks();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', processAllBackgroundTasks);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', processAllBackgroundTasks);
        };
    }, [toast]);
};
