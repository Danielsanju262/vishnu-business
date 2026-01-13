/**
 * Enhanced AI Chat System with Tool Usage
 * This AI can query the database, track goals, and manage memories
 */

import { supabase } from './supabase';
import { format, subDays, subMonths, startOfMonth, endOfMonth, addDays } from 'date-fns';
import {
    getActiveMemories,
    getActiveGoals,
    addMemory,
    updateMemory,
    deleteMemory,
    addGoal,
    updateGoal,
    deleteGoal,
    calculateWaterfallGoals,
    calculateAvailableSurplus,
    allocateToGoal,
    completeGoalWithTimestamp
} from './aiMemory';

// Mistral AI Configuration
const MISTRAL_API_KEY = 'ZUfHndqE4M5ES7S0aXwHsyE9s8oPs0cr';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

// ═══════════════════════════════════════════════════════════════════════════════
// ███████████████████████████████████████████████████████████████████████████████
// ██                                                                           ██
// ██   TRILLION-PATTERN GOAL NLP ENGINE                                        ██
// ██   Handles ANY natural language input for Goals                            ██
// ██   Covers: CREATE, UPDATE, COMPLETE operations                             ██
// ██                                                                           ██
// ███████████████████████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WORD CLUSTERS: Every possible way to express each concept
 * These are used for semantic matching - if ANY word from a cluster
 * appears in the input, we consider that concept present.
 */

// GOAL NOUNS: All words that refer to a goal/target
const GOAL_NOUNS = [
    // Primary
    'goal', 'goals', 'target', 'targets',
    // Objectives
    'objective', 'objectives', 'mission', 'missions',
    // Milestones
    'milestone', 'milestones', 'checkpoint', 'checkpoints',
    // Aims
    'aim', 'aims', 'ambition', 'ambitions', 'aspiration', 'aspirations',
    // Financial terms
    'saving', 'savings', 'fund', 'funds', 'budget', 'budgets',
    'emi', 'emis', 'payment', 'payments', 'investment', 'investments',
    // Limits
    'quota', 'quotas', 'limit', 'limits', 'cap', 'caps', 'ceiling', 'ceilings',
    // Plans
    'plan', 'plans', 'strategy', 'strategies', 'scheme', 'schemes',
    // Tracking
    'tracker', 'trackers', 'tracking', 'progress', 'forecast', 'forecasts',
    // Achievement
    'achievement', 'achievements', 'accomplishment', 'accomplishments'
];

// CREATE VERBS: All ways to express creating something new
const CREATE_VERBS = [
    // Primary create
    'create', 'creates', 'creating', 'created',
    // Set/Setup
    'set', 'sets', 'setting', 'setup', 'set-up', 'set up',
    // Make
    'make', 'makes', 'making', 'made',
    // Add
    'add', 'adds', 'adding', 'added',
    // Start
    'start', 'starts', 'starting', 'started',
    'begin', 'begins', 'beginning', 'began', 'begun',
    'initiate', 'initiates', 'initiating', 'initiated',
    'launch', 'launches', 'launching', 'launched',
    'kick off', 'kick-off', 'kickoff',
    // Build
    'build', 'builds', 'building', 'built',
    'establish', 'establishes', 'establishing', 'established',
    'construct', 'constructs', 'constructing', 'constructed',
    'form', 'forms', 'forming', 'formed',
    'generate', 'generates', 'generating', 'generated',
    // Intent words
    'want', 'wants', 'wanted', 'wanting',
    'need', 'needs', 'needed', 'needing',
    'like', 'would like', 'would love', 'd like', 'd love',
    'wish', 'wishes', 'wishing', 'wished',
    // Help/Assist
    'help', 'help me', 'helps', 'helping',
    'assist', 'assist me', 'assists', 'assisting',
    'please', 'kindly', 'can you', 'could you', 'will you', 'would you',
    // Track/Monitor
    'track', 'tracks', 'tracking', 'tracked',
    'monitor', 'monitors', 'monitoring', 'monitored',
    // New
    'new', 'fresh', 'another', 'additional',
    // Open
    'open', 'opens', 'opening', 'opened',
    // Define
    'define', 'defines', 'defining', 'defined'
];

// UPDATE VERBS: All ways to express modifying something
const UPDATE_VERBS = [
    // Primary update
    'update', 'updates', 'updating', 'updated',
    // Change
    'change', 'changes', 'changing', 'changed',
    // Modify
    'modify', 'modifies', 'modifying', 'modified',
    // Edit
    'edit', 'edits', 'editing', 'edited',
    // Adjust
    'adjust', 'adjusts', 'adjusting', 'adjusted',
    // Alter
    'alter', 'alters', 'altering', 'altered',
    'amend', 'amends', 'amending', 'amended',
    // Revise
    'revise', 'revises', 'revising', 'revised',
    'refine', 'refines', 'refining', 'refined',
    // Fix/Correct
    'fix', 'fixes', 'fixing', 'fixed',
    'correct', 'corrects', 'correcting', 'corrected',
    // Increase
    'increase', 'increases', 'increasing', 'increased',
    'raise', 'raises', 'raising', 'raised',
    'boost', 'boosts', 'boosting', 'boosted',
    'up', 'bump', 'bumps', 'bumping', 'bumped',
    'hike', 'hikes', 'hiking', 'hiked',
    // Decrease
    'decrease', 'decreases', 'decreasing', 'decreased',
    'reduce', 'reduces', 'reducing', 'reduced',
    'lower', 'lowers', 'lowering', 'lowered',
    'cut', 'cuts', 'cutting',
    'slash', 'slashes', 'slashing', 'slashed',
    'down', 'drop', 'drops', 'dropping', 'dropped',
    // Add to progress
    'add', 'adds', 'adding', 'added',
    'put', 'puts', 'putting',
    'deposit', 'deposits', 'depositing', 'deposited',
    'contribute', 'contributes', 'contributing', 'contributed',
    'allocate', 'allocates', 'allocating', 'allocated',
    'fund', 'funds', 'funding', 'funded',
    'save', 'saves', 'saving', 'saved',
    'plus', '+',
    // Subtract from progress
    'subtract', 'subtracts', 'subtracting', 'subtracted',
    'deduct', 'deducts', 'deducting', 'deducted',
    'remove', 'removes', 'removing', 'removed',
    'take', 'takes', 'taking', 'took', 'taken',
    'withdraw', 'withdraws', 'withdrawing', 'withdrew', 'withdrawn',
    'minus', '-',
    // Date changes
    'postpone', 'postpones', 'postponing', 'postponed',
    'prepone', 'prepones', 'preponing', 'preponed',
    'delay', 'delays', 'delaying', 'delayed',
    'defer', 'defers', 'deferring', 'deferred',
    'advance', 'advances', 'advancing', 'advanced',
    'extend', 'extends', 'extending', 'extended',
    'shorten', 'shortens', 'shortening', 'shortened',
    'shift', 'shifts', 'shifting', 'shifted',
    'move', 'moves', 'moving', 'moved',
    'push', 'pushes', 'pushing', 'pushed',
    'bring', 'brings', 'bringing', 'brought',
    // Rename
    'rename', 'renames', 'renaming', 'renamed',
    'call', 'calls', 'calling', 'called',
    'name', 'names', 'naming', 'named',
    'title', 'titles', 'titling', 'titled',
    'label', 'labels', 'labeling', 'labeled'
];

// COMPLETE VERBS: All ways to express completing/finishing
const COMPLETE_VERBS = [
    // Primary complete
    'complete', 'completes', 'completing', 'completed',
    // Finish
    'finish', 'finishes', 'finishing', 'finished',
    // Done
    'done', 'am done', 'is done', 'are done', 'was done', 'got done',
    // Close
    'close', 'closes', 'closing', 'closed',
    // Achieve
    'achieve', 'achieves', 'achieving', 'achieved',
    // Accomplish
    'accomplish', 'accomplishes', 'accomplishing', 'accomplished',
    // Reach
    'reach', 'reaches', 'reaching', 'reached',
    // Hit
    'hit', 'hits', 'hitting',
    // Meet
    'meet', 'meets', 'meeting', 'met',
    // Mark
    'mark', 'marks', 'marking', 'marked',
    'mark as', 'mark it', 'mark this', 'marked as',
    // Finalize
    'finalize', 'finalizes', 'finalizing', 'finalized',
    // Wrap
    'wrap', 'wraps', 'wrapping', 'wrapped',
    'wrap up', 'wrapped up', 'wrapping up',
    // End
    'end', 'ends', 'ending', 'ended',
    // Success indicators
    'success', 'successful', 'successfully',
    'yay', 'hurray', 'wohoo', 'woohoo', 'hooray',
    'done it', 'did it', 'made it', 'nailed it',
    'finally', 'at last'
];

// RECURRENCE WORDS (POSITIVE): All ways to say "make it recurring"
const RECURRING_POSITIVE = [
    // Direct recurring
    'recurring', 'recurrence', 'recur', 'recurs', 'recurred',
    // Repeat
    'repeat', 'repeats', 'repeating', 'repeated', 'repetition',
    // Cycle
    'cycle', 'cycles', 'cycling', 'cycled', 'cyclic', 'cyclical',
    // Periodic
    'periodic', 'periodically', 'periodical', 'period',
    // Regular
    'regular', 'regularly', 'regularity',
    // Auto
    'auto', 'automatic', 'automatically', 'auto-renew', 'auto renew', 'autorenew',
    // Renew
    'renew', 'renews', 'renewing', 'renewed', 'renewal', 'renewals',
    // Refresh
    'refresh', 'refreshes', 'refreshing', 'refreshed',
    // Reset
    'reset', 'resets', 'resetting',
    // Rollover
    'rollover', 'roll over', 'roll-over', 'rolls over',
    // Continuous
    'continuous', 'continuously', 'continual', 'continually',
    'ongoing', 'perpetual', 'perpetually', 'endless'
];

// MONTHLY WORDS: All ways to say "monthly"
const MONTHLY_WORDS = [
    'monthly', 'month', 'months',
    'every month', 'each month', 'per month', 'a month',
    'once a month', 'once per month', 'monthly basis',
    '30 days', 'thirty days', '4 weeks', 'four weeks'
];

// WEEKLY WORDS: All ways to say "weekly"
const WEEKLY_WORDS = [
    'weekly', 'week', 'weeks',
    'every week', 'each week', 'per week', 'a week',
    'once a week', 'once per week', 'weekly basis',
    '7 days', 'seven days'
];

// YEARLY WORDS: All ways to say "yearly"
const YEARLY_WORDS = [
    'yearly', 'year', 'years', 'annual', 'annually',
    'every year', 'each year', 'per year', 'a year',
    'once a year', 'once per year', 'yearly basis', 'annual basis',
    '365 days', '12 months', 'twelve months'
];

// DAILY WORDS: All ways to say "daily"
const DAILY_WORDS = [
    'daily', 'day', 'days',
    'every day', 'each day', 'per day', 'a day',
    'once a day', 'once per day', 'daily basis',
    '24 hours', 'everyday'
];

// NON-RECURRING WORDS: All ways to say "not recurring / one-time"
const NON_RECURRING_WORDS = [
    // One-time
    'one-time', 'one time', 'onetime', 'one-off', 'oneoff', 'one off',
    'once', 'single', 'solo', 'lone', 'only',
    // Not recurring
    'not recurring', 'non-recurring', 'non recurring', 'nonrecurring',
    'no recurrence', 'without recurrence',
    // Stop recurring
    'stop recurring', 'stop recurrence', 'stop repeating', 'stop repeat',
    'end recurring', 'end recurrence', 'end repeating',
    'cancel recurring', 'cancel recurrence', 'cancel repeating',
    'remove recurring', 'remove recurrence', 'remove repeating',
    'disable recurring', 'disable recurrence', 'disable repeating',
    'turn off recurring', 'turn off recurrence',
    // Don't repeat
    "don't repeat", 'dont repeat', 'does not repeat', 'doesnt repeat',
    "don't recur", 'dont recur', 'never repeat', 'no repeat',
    // Just once
    'just once', 'only once', 'this time only', 'this once',
    'just this once', 'for now', 'temporary', 'temp'
];

// AMOUNT WORDS: All ways to express money/amounts (reserved for future use)
const _AMOUNT_PREFIXES = [
    '₹', 'rs', 'rs.', 'rupee', 'rupees', 'inr',
    'amount', 'sum', 'value', 'worth', 'total'
];
void _AMOUNT_PREFIXES; // Mark as intentionally unused

const _AMOUNT_SUFFIXES = [
    'k', 'K', 'thousand', 'thousands',
    'lakh', 'lakhs', 'lac', 'lacs', 'l', 'L',
    'crore', 'crores', 'cr', 'CR',
    'million', 'millions', 'm', 'M',
    'billion', 'billions', 'b', 'B',
    'hundred', 'hundreds'
];
void _AMOUNT_SUFFIXES; // Mark as intentionally unused

// PERCENTAGE WORDS: All ways to express percentages (reserved for future use)
const _PERCENTAGE_WORDS = [
    '%', 'percent', 'percentage', 'per cent', 'pct',
    'margin', 'rate', 'ratio'
];
void _PERCENTAGE_WORDS; // Mark as intentionally unused

// PROGRESS WORDS: All ways to express current progress
const PROGRESS_WORDS = [
    // Direct progress
    'progress', 'progressing', 'progressed',
    // Current
    'current', 'currently', 'currrent', // include typo
    // Balance
    'balance', 'balances',
    // Saved
    'saved', 'save', 'saving', 'savings',
    // Collected
    'collected', 'collect', 'collecting', 'collection',
    // Achieved
    'achieved', 'achieve', 'achieving',
    // Reached
    'reached', 'reach', 'reaching',
    // Have/Got
    'have', 'has', 'had', 'got', 'gotten',
    // Already
    'already', 'so far', 'till now', 'up to now', 'as of now', 'until now',
    // Now at
    'now at', 'now have', 'already have', 'already saved',
    // Standing
    'standing', 'stands', 'stand at'
];

// DATE START WORDS: All ways to express "start from"
const DATE_START_WORDS = [
    'start', 'starts', 'starting', 'started',
    'begin', 'begins', 'beginning', 'began',
    'from', 'starting from', 'beginning from',
    'since', 'as of', 'effective', 'commencing'
];

// DATE END WORDS: All ways to express "deadline / end by"
const DATE_END_WORDS = [
    'by', 'until', 'till', 'before', 'within',
    'deadline', 'due', 'due by', 'due on',
    'end', 'ending', 'ends',
    'finish by', 'complete by', 'achieve by',
    'target date', 'end date', 'final date',
    'no later than', 'not later than'
];

// RELATIVE DATE WORDS: All relative date expressions (reserved for future use)
const _DATE_RELATIVE_WORDS = [
    // Today/Tomorrow
    'today', 'tomorrow', 'yesterday',
    'now', 'right now', 'immediately', 'asap',
    // This/Next/Last
    'this week', 'next week', 'last week',
    'this month', 'next month', 'last month',
    'this year', 'next year', 'last year',
    // End of
    'end of month', 'month end', 'eom',
    'end of week', 'week end', 'eow',
    'end of year', 'year end', 'eoy',
    // Start of
    'start of month', 'month start', 'beginning of month',
    'start of week', 'week start', 'beginning of week',
    // Duration
    'in a week', 'in 1 week', 'in 2 weeks', 'in two weeks',
    'in a month', 'in 1 month', 'in 2 months', 'in two months', 'in 3 months',
    'in a year', 'in 1 year'
];
void _DATE_RELATIVE_WORDS; // Mark as intentionally unused

// ADD PROGRESS WORDS: All ways to say "add money to progress"
const ADD_PROGRESS_WORDS = [
    'add', 'adds', 'adding', 'added',
    'put', 'puts', 'putting',
    'deposit', 'deposits', 'depositing', 'deposited',
    'contribute', 'contributes', 'contributing', 'contributed',
    'allocate', 'allocates', 'allocating', 'allocated',
    'fund', 'funds', 'funding', 'funded',
    'save', 'saves', 'saving', 'saved',
    'transfer', 'transfers', 'transferring', 'transferred',
    'move', 'moves', 'moving', 'moved',
    'plus', '+', 'more', 'extra', 'additional', 'another'
];

// SUBTRACT PROGRESS WORDS: All ways to say "remove money from progress"
const SUBTRACT_PROGRESS_WORDS = [
    'subtract', 'subtracts', 'subtracting', 'subtracted',
    'deduct', 'deducts', 'deducting', 'deducted',
    'remove', 'removes', 'removing', 'removed',
    'take', 'takes', 'taking', 'took', 'taken',
    'take out', 'take away', 'take off',
    'withdraw', 'withdraws', 'withdrawing', 'withdrew',
    'reduce', 'reduces', 'reducing', 'reduced',
    'decrease', 'decreases', 'decreasing', 'decreased',
    'minus', '-', 'less'
];

/**
 * UNIVERSAL CLUSTER MATCHER
 * Checks if ANY word from a cluster appears in the input text
 * Case-insensitive, word-boundary aware
 */
function containsAnyFromCluster(text: string, cluster: string[]): boolean {
    const lowerText = text.toLowerCase();
    for (const word of cluster) {
        // Escape special regex characters
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Create regex with word boundaries (or start/end for phrases)
        const regex = new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`, 'i');
        if (regex.test(' ' + lowerText + ' ')) {
            return true;
        }
    }
    return false;
}

/**
 * DETECT GOAL OPERATION
 * Determines what operation the user wants: CREATE, UPDATE, COMPLETE
 * Returns: 'create' | 'update' | 'complete' | 'read' | null
 */
export function detectGoalOperation(text: string): 'create' | 'update' | 'complete' | 'read' | null {
    const lowerText = text.toLowerCase();

    // Check for COMPLETE first (highest priority after delete which we don't support)
    const hasCompleteVerb = containsAnyFromCluster(text, COMPLETE_VERBS);
    const hasGoalNoun = containsAnyFromCluster(text, GOAL_NOUNS);

    if (hasCompleteVerb && hasGoalNoun) {
        console.log('[Goal NLP] Detected: COMPLETE operation');
        return 'complete';
    }

    // Check for UPDATE patterns
    const hasUpdateVerb = containsAnyFromCluster(text, UPDATE_VERBS);
    const hasRecurrenceWords = containsAnyFromCluster(text, [...RECURRING_POSITIVE, ...NON_RECURRING_WORDS, ...MONTHLY_WORDS, ...WEEKLY_WORDS, ...YEARLY_WORDS]);
    const hasProgressWords = containsAnyFromCluster(text, PROGRESS_WORDS);
    const hasAddProgress = containsAnyFromCluster(text, ADD_PROGRESS_WORDS);
    const hasSubtractProgress = containsAnyFromCluster(text, SUBTRACT_PROGRESS_WORDS);

    // UPDATE if: (update verb + goal) OR (goal + recurrence words) OR (add/subtract + amount pattern)
    if ((hasUpdateVerb && hasGoalNoun) ||
        (hasGoalNoun && hasRecurrenceWords) ||
        (hasAddProgress && /\d/.test(text) && !containsAnyFromCluster(text, CREATE_VERBS)) ||
        (hasSubtractProgress && /\d/.test(text)) ||
        (hasProgressWords && /\d/.test(text) && hasGoalNoun) ||
        // Specific patterns like "make it monthly", "change to weekly"
        /\b(make|set|change|switch|turn|convert)\s*(it|this|goal|target)?\s*(to|into)?\s*(monthly|weekly|yearly|daily|recurring|one-?time|once)/i.test(lowerText) ||
        // Postpone/prepone patterns
        /\b(postpone|prepone|delay|advance|extend|push|bring)\b/i.test(lowerText)) {
        console.log('[Goal NLP] Detected: UPDATE operation');
        return 'update';
    }

    // Check for CREATE patterns
    const hasCreateVerb = containsAnyFromCluster(text, CREATE_VERBS);

    if ((hasCreateVerb && hasGoalNoun) ||
        (hasCreateVerb && /\d/.test(text) && /\b(for|called|named|to|by|of)\b/i.test(lowerText)) ||
        /\b(new|fresh|another)\s*(goal|target|saving|budget|fund|plan)/i.test(lowerText)) {
        console.log('[Goal NLP] Detected: CREATE operation');
        return 'create';
    }

    // Check for READ patterns
    if (/\b(show|list|view|see|get|display|what|how|check|tell|give)\b/i.test(lowerText) && hasGoalNoun) {
        console.log('[Goal NLP] Detected: READ operation');
        return 'read';
    }

    // If just "goal" mentioned with numbers, assume CREATE
    if (hasGoalNoun && /\d/.test(text)) {
        console.log('[Goal NLP] Detected: CREATE operation (goal + number)');
        return 'create';
    }

    // If just goal nouns mentioned, assume READ
    if (hasGoalNoun) {
        console.log('[Goal NLP] Detected: READ operation (goal mentioned)');
        return 'read';
    }

    return null;
}

/**
 * EXTRACT AMOUNT FROM TEXT
 * Finds monetary amounts in various formats: 50000, 50k, 50K, 1 lakh, ₹50000, etc.
 * Returns the numeric value or null
 */
export function extractAmount(text: string): number | null {
    const patterns = [
        // Rs/₹ prefix patterns
        /(?:₹|rs\.?\s*)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lakhs|lac|lacs|l|L|crore|crores|cr|CR)?/gi,
        // Suffix patterns: "50k", "1 lakh", "2 crore"
        /\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lakhs|lac|lacs|l|L|crore|crores|cr|CR|thousand|thousands|million|millions|billion|billions)\b/gi,
        // Plain numbers with context: "for 50000", "of 100000"
        /\b(\d{4,}(?:,\d+)*)\b/g, // Numbers with 4+ digits are likely amounts
    ];

    let highestAmount = 0;

    for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
            let value = parseFloat(match[1].replace(/,/g, ''));
            const suffix = (match[2] || '').toLowerCase();

            // Apply multiplier based on suffix
            if (suffix === 'k' || suffix === 'thousand' || suffix === 'thousands') {
                value *= 1000;
            } else if (suffix === 'lakh' || suffix === 'lakhs' || suffix === 'lac' || suffix === 'lacs' || suffix === 'l') {
                value *= 100000;
            } else if (suffix === 'crore' || suffix === 'crores' || suffix === 'cr') {
                value *= 10000000;
            } else if (suffix === 'million' || suffix === 'millions' || suffix === 'm') {
                value *= 1000000;
            } else if (suffix === 'billion' || suffix === 'billions' || suffix === 'b') {
                value *= 1000000000;
            }

            // Skip if this looks like a date (1-31)
            if (value <= 31 && text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s*(?:of\s*)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)) {
                continue;
            }

            // Skip years (2024, 2025, etc.)
            if (value >= 2020 && value <= 2100) {
                continue;
            }

            if (value > highestAmount) {
                highestAmount = value;
            }
        }
    }

    return highestAmount > 0 ? highestAmount : null;
}

/**
 * EXTRACT PERCENTAGE FROM TEXT
 * Finds percentage values: 20%, 15 percent, etc.
 */
export function extractPercentage(text: string): number | null {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|percentage|per\s*cent|pct)/i);
    if (match) {
        return parseFloat(match[1]);
    }
    return null;
}

/**
 * DETECT RECURRENCE TYPE
 * Returns: { isRecurring: boolean, type?: 'monthly'|'weekly'|'yearly'|'daily', explicit: boolean }
 */
export function detectRecurrence(text: string): { isRecurring: boolean; type?: 'monthly' | 'weekly' | 'yearly' | 'daily'; explicit: boolean } {
    const lowerText = text.toLowerCase();

    // Check for NON-RECURRING first (highest priority)
    if (containsAnyFromCluster(text, NON_RECURRING_WORDS)) {
        console.log('[Goal NLP] Detected: NON-RECURRING');
        return { isRecurring: false, explicit: true };
    }

    // Check for specific frequency
    if (containsAnyFromCluster(text, MONTHLY_WORDS)) {
        console.log('[Goal NLP] Detected: MONTHLY recurrence');
        return { isRecurring: true, type: 'monthly', explicit: true };
    }

    if (containsAnyFromCluster(text, WEEKLY_WORDS)) {
        console.log('[Goal NLP] Detected: WEEKLY recurrence');
        return { isRecurring: true, type: 'weekly', explicit: true };
    }

    if (containsAnyFromCluster(text, YEARLY_WORDS)) {
        console.log('[Goal NLP] Detected: YEARLY recurrence');
        return { isRecurring: true, type: 'yearly', explicit: true };
    }

    if (containsAnyFromCluster(text, DAILY_WORDS) && !lowerText.includes('deadline')) {
        console.log('[Goal NLP] Detected: DAILY recurrence');
        return { isRecurring: true, type: 'daily', explicit: true };
    }

    // Check for generic recurring words
    if (containsAnyFromCluster(text, RECURRING_POSITIVE)) {
        console.log('[Goal NLP] Detected: RECURRING (generic, defaulting to monthly)');
        return { isRecurring: true, type: 'monthly', explicit: true };
    }

    // No explicit recurrence mentioned
    return { isRecurring: false, explicit: false };
}

/**
 * DETECT ADD/SUBTRACT OPERATION
 * Returns: { operation: 'add'|'subtract'|'set'|null, amount: number|null }
 */
export function detectProgressChange(text: string): { operation: 'add' | 'subtract' | 'set' | null; amount: number | null } {
    const lowerText = text.toLowerCase();

    // Check for SET operation first (set progress to X)
    if (/\b(set|make|change)\s*(progress|current|balance|saved)\s*(to|at|=)/i.test(lowerText) ||
        /\b(progress|current|balance|saved)\s*(is|=|:)\s*(\d+)/i.test(lowerText)) {
        const amount = extractAmount(text);
        if (amount) {
            console.log('[Goal NLP] Detected: SET progress to', amount);
            return { operation: 'set', amount };
        }
    }

    // Check for ADD operation
    if (containsAnyFromCluster(text, ADD_PROGRESS_WORDS)) {
        const amount = extractAmount(text);
        if (amount) {
            console.log('[Goal NLP] Detected: ADD', amount, 'to progress');
            return { operation: 'add', amount };
        }
    }

    // Check for SUBTRACT operation
    if (containsAnyFromCluster(text, SUBTRACT_PROGRESS_WORDS)) {
        const amount = extractAmount(text);
        if (amount) {
            console.log('[Goal NLP] Detected: SUBTRACT', amount, 'from progress');
            return { operation: 'subtract', amount };
        }
    }

    return { operation: null, amount: null };
}

/**
 * EXTRACT GOAL TITLE
 * Tries to extract the goal name/title from the text
 */
export function extractGoalTitle(text: string): string | null {
    // Remove common noise patterns
    let cleaned = text
        .replace(/\b(create|make|set|add|new|start|begin|track|a|an|the|my|goal|target|saving|fund|budget|for|of|with|please|help|me|i|want|need|like|would)\b/gi, ' ')
        .replace(/\b(₹|rs\.?|rupees?|lakh|lakhs|crore|crores|k|K)\b/gi, ' ')
        .replace(/\d+([.,]\d+)?\s*(k|K|lakh|lakhs|lac|cr|crore)?\s*/gi, ' ')
        .replace(/\b(monthly|weekly|yearly|daily|recurring|one-?time|once|by|until|from|today|tomorrow|end\s*of|month|week|year)\b/gi, ' ')
        .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, ' ')
        .replace(/\d{1,2}(?:st|nd|rd|th)?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // If something meaningful remains, use it
    if (cleaned.length >= 3 && !cleaned.match(/^(is|it|to|as|in|on|at)$/i)) {
        // Capitalize first letter of each word
        cleaned = cleaned.split(' ')
            .filter(w => w.length > 0)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
        return cleaned;
    }

    return null;
}

/**
 * LOG ALL DETECTED PATTERNS
 * For debugging - logs what was detected in the text
 */
export function logDetectedPatterns(text: string): void {
    console.log('═══════════════════════════════════════════');
    console.log('[Goal NLP] Analyzing:', text);
    console.log('───────────────────────────────────────────');
    console.log('Goal nouns:', containsAnyFromCluster(text, GOAL_NOUNS));
    console.log('Create verbs:', containsAnyFromCluster(text, CREATE_VERBS));
    console.log('Update verbs:', containsAnyFromCluster(text, UPDATE_VERBS));
    console.log('Complete verbs:', containsAnyFromCluster(text, COMPLETE_VERBS));
    console.log('Amount:', extractAmount(text));
    console.log('Percentage:', extractPercentage(text));
    console.log('Recurrence:', detectRecurrence(text));
    console.log('Progress change:', detectProgressChange(text));
    console.log('Title:', extractGoalTitle(text));
    console.log('Operation:', detectGoalOperation(text));
    console.log('═══════════════════════════════════════════');
}

// Export clusters for use in other parts of the system
export const GoalNLPClusters = {
    GOAL_NOUNS,
    CREATE_VERBS,
    UPDATE_VERBS,
    COMPLETE_VERBS,
    RECURRING_POSITIVE,
    NON_RECURRING_WORDS,
    MONTHLY_WORDS,
    WEEKLY_WORDS,
    YEARLY_WORDS,
    DAILY_WORDS,
    ADD_PROGRESS_WORDS,
    SUBTRACT_PROGRESS_WORDS,
    PROGRESS_WORDS,
    DATE_START_WORDS,
    DATE_END_WORDS,
    containsAnyFromCluster
};


// ===== TOOL DEFINITIONS =====
interface ToolResult {
    name: string;
    result: string;
}

// Tool: Get Financial Data for Any Date Range
async function toolGetFinancialData(startDate: string, endDate: string): Promise<string> {
    try {
        // Sales data - fetch ALL transactions for accurate totals
        const { data: sales } = await supabase
            .from('transactions')
            .select('sell_price, buy_price, quantity, date, products(name), customers(name)')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null)
            .order('date', { ascending: false });

        const totalRevenue = (sales || []).reduce((sum, t) => sum + (t.sell_price * t.quantity), 0);
        const totalCost = (sales || []).reduce((sum, t) => sum + (t.buy_price * t.quantity), 0);
        const grossProfit = totalRevenue - totalCost;
        const salesCount = sales?.length || 0;

        // Expenses data
        const { data: expenses } = await supabase
            .from('expenses')
            .select('amount, category, note, date')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null);

        const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
        const netProfit = grossProfit - totalExpenses;

        // Top products
        const productSales: Record<string, { qty: number; revenue: number }> = {};
        (sales || []).forEach((s: any) => {
            const name = s.products?.name || 'Unknown';
            if (!productSales[name]) productSales[name] = { qty: 0, revenue: 0 };
            productSales[name].qty += s.quantity;
            productSales[name].revenue += s.sell_price * s.quantity;
        });

        const topProducts = Object.entries(productSales)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice(0, 5)
            .map(([name, data]) => `${name}: ${data.qty} units, ₹${data.revenue.toLocaleString()}`);

        // Top customers
        const customerSales: Record<string, number> = {};
        (sales || []).forEach((s: any) => {
            const name = s.customers?.name || 'Unknown';
            customerSales[name] = (customerSales[name] || 0) + (s.sell_price * s.quantity);
        });

        const topCustomers = Object.entries(customerSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, rev]) => `${name}: ₹${rev.toLocaleString()}`);

        // Expense breakdown
        const expenseByCategory: Record<string, number> = {};
        (expenses || []).forEach(e => {
            const cat = e.category || 'Other';
            expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount);
        });

        const expenseBreakdown = Object.entries(expenseByCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => `${cat}: ₹${amt.toLocaleString()}`);

        return `FINANCIAL DATA (${startDate} to ${endDate}):
📊 Summary:
- Total Revenue: ₹${totalRevenue.toLocaleString()}
- Total Cost (COGS): ₹${totalCost.toLocaleString()}
- Gross Profit: ₹${grossProfit.toLocaleString()}
- Total Expenses: ₹${totalExpenses.toLocaleString()}
- NET PROFIT: ₹${netProfit.toLocaleString()}
- Number of Sales: ${salesCount}

🏆 Top Products:
${topProducts.join('\n') || 'No data'}

👥 Top Customers:
${topCustomers.join('\n') || 'No data'}

💸 Expense Breakdown:
${expenseBreakdown.join('\n') || 'No expenses'}`;
    } catch (error) {
        console.error('[AI Tool] Financial data error:', error);
        return 'Error fetching financial data.';
    }
}

// Tool: Get Pending Receivables (Who Owes Money)
async function toolGetPendingReceivables(): Promise<string> {
    try {
        const { data: reminders } = await supabase
            .from('payment_reminders')
            .select('amount, due_date, note, customers(name)')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (!reminders || reminders.length === 0) {
            return 'No pending receivables. Everyone has paid! 🎉';
        }

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lines = reminders.map((r: any) => {
            const daysDiff = Math.ceil((new Date(r.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const status = r.due_date < todayStr ? `⚠️ OVERDUE by ${Math.abs(daysDiff)} days` :
                r.due_date === todayStr ? '🔔 DUE TODAY' :
                    `Due in ${daysDiff} days`;
            return `- ${r.customers?.name || 'Unknown'}: ₹${Number(r.amount).toLocaleString()} (${status})`;
        });

        const totalPending = reminders.reduce((sum, r) => sum + Number(r.amount), 0);
        const overdueCount = reminders.filter((r: any) => r.due_date < todayStr).length;

        return `PENDING RECEIVABLES:
Total: ₹${totalPending.toLocaleString()} from ${reminders.length} customers
Overdue: ${overdueCount} payments

${lines.join('\n')}`;
    } catch (error) {
        console.error('[AI Tool] Receivables error:', error);
        return 'Error fetching receivables.';
    }
}

// Tool: Get Pending Payables (What You Owe)
async function toolGetPendingPayables(): Promise<string> {
    try {
        const { data: payables } = await supabase
            .from('accounts_payable')
            .select('amount, due_date, note, suppliers(name)')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (!payables || payables.length === 0) {
            return 'No pending payables. All bills are cleared! 🎉';
        }

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lines = payables.map((p: any) => {
            const daysDiff = Math.ceil((new Date(p.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const status = p.due_date < todayStr ? `⚠️ OVERDUE by ${Math.abs(daysDiff)} days` :
                p.due_date === todayStr ? '🔔 DUE TODAY' :
                    `Due in ${daysDiff} days`;
            return `- ${p.suppliers?.name || 'Unknown'}: ₹${Number(p.amount).toLocaleString()} (${status})`;
        });

        const totalPending = payables.reduce((sum, p) => sum + Number(p.amount), 0);
        const overdueCount = payables.filter((p: any) => p.due_date < todayStr).length;

        return `PENDING PAYABLES:
Total: ₹${totalPending.toLocaleString()} to ${payables.length} suppliers
Overdue: ${overdueCount} payments

${lines.join('\n')}`;
    } catch (error) {
        console.error('[AI Tool] Payables error:', error);
        return 'Error fetching payables.';
    }
}

// Tool: Get Goal Progress (Waterfall Method)
async function toolGetGoalProgress(): Promise<string> {
    try {
        const waterfallGoals = await calculateWaterfallGoals();

        if (waterfallGoals.length === 0) {
            return 'NO ACTIVE GOALS. The user has not set any goals yet.';
        }

        const goalLines = waterfallGoals.map((g, index) => {
            const statusEmoji = g.isFullyFunded ? '✅' : g.daysLeft < 3 ? '🔥' : '📈';
            const deadlineInfo = g.goal.deadline ? `Deadline: ${g.goal.deadline}` : 'No deadline set';
            const recurringInfo = g.goal.is_recurring ? ` (Recurring: ${g.goal.recurrence_type})` : '';
            return `${index + 1}. ${statusEmoji} "${g.goal.title}"${recurringInfo}
   - Target Amount: ₹${g.goal.target_amount.toLocaleString()}
   - Funds Allocated from Net Profit: ₹${g.allocatedAmount.toLocaleString()}
   - Remaining Needed: ₹${g.remainingNeeded.toLocaleString()}
   - ${deadlineInfo} (${g.daysLeft >= 0 ? `${g.daysLeft} days left` : `${Math.abs(g.daysLeft)} days overdue`})
   - Tracking Since: ${g.goal.start_tracking_date?.split('T')[0] || 'N/A'}
   - Status: ${g.statusMessage}`;
        });

        return `ACTIVE GOALS (${waterfallGoals.length} total, ordered by priority):\n\n${goalLines.join('\n\n')}`;
    } catch (error) {
        console.error('[AI Tool] Goals error:', error);
        return 'Error fetching goals.';
    }
}

// Tool: Save a Memory/Fact
async function toolSaveMemory(content: string, bucket: 'preference' | 'fact' | 'context' = 'fact'): Promise<string> {
    try {
        console.log('[AI Tool] Saving memory:', { bucket, content });

        // Check memory count first
        const existingMemories = await getActiveMemories();
        if (existingMemories.length >= 35) {
            return `❌ Cannot save memory. You've reached the maximum limit of 35 memories.\n\nPlease delete some old memories from Settings > AI Memory before adding new ones.`;
        }

        const memory = await addMemory(bucket, content);
        if (memory) {
            console.log('[AI Tool] Memory saved successfully:', memory);
            return `✅ Saved ${bucket} to memory: "${content}"\n\nThis will be remembered in future conversations. You can view/edit it in Settings > AI Memory.`;
        }
        console.error('[AI Tool] Memory save returned null');
        return '❌ Failed to save memory. Database operation failed.';
    } catch (error) {
        console.error('[AI Tool] Save memory error:', error);
        return `❌ Error saving memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Tool: Delete a Memory by ID or content match
async function toolDeleteMemoryById(memoryId: string): Promise<string> {
    try {
        console.log('[AI Tool] Deleting memory by ID:', memoryId);
        await deleteMemory(memoryId);
        return `✅ Memory deleted successfully!`;
    } catch (error) {
        console.error('[AI Tool] Delete memory by ID error:', error);
        return `❌ Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

async function toolDeleteMemory(searchText: string): Promise<string> {
    try {
        console.log('[AI Tool] Deleting memory by search:', searchText);
        const memories = await getActiveMemories();
        const match = memories.find(m =>
            m.content.toLowerCase().includes(searchText.toLowerCase())
        );

        if (match) {
            await deleteMemory(match.id);
            return `✅ Deleted memory: "${match.content}"`;
        }
        return `❌ No memory found matching "${searchText}"`;
    } catch (error) {
        console.error('[AI Tool] Delete memory error:', error);
        return 'Error deleting memory.';
    }
}

// Tool: Update a Memory by ID (for confirmed actions)
async function toolUpdateMemoryById(memoryId: string, newContent: string): Promise<string> {
    try {
        console.log('[AI Tool] Updating memory by ID:', memoryId, 'to:', newContent);
        await updateMemory(memoryId, newContent);
        return `✅ Memory updated successfully to: "${newContent}"`;
    } catch (error) {
        console.error('[AI Tool] Update memory by ID error:', error);
        return `❌ Error updating memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

async function toolUpdateMemoryContent(searchText: string, newContent: string): Promise<string> {
    try {
        console.log('[AI Tool] Updating memory by search:', searchText);
        const memories = await getActiveMemories();
        const match = memories.find(m =>
            m.content.toLowerCase().includes(searchText.toLowerCase())
        );

        if (match) {
            await updateMemory(match.id, newContent);
            return `✅ Updated memory from "${match.content}" to "${newContent}"`;
        }
        return `❌ No memory found matching "${searchText}"`;
    } catch (error) {
        console.error('[AI Tool] Update memory error:', error);
        return 'Error updating memory.';
    }
}

// Tool: Create a New Goal
async function toolCreateGoal(
    title: string,
    targetAmount: number,
    deadline?: string,
    metricType: 'net_profit' | 'revenue' | 'sales_count' | 'manual_check' = 'net_profit',
    isRecurring: boolean = false,
    recurrenceType?: 'monthly' | 'weekly' | 'yearly',
    startTrackingDate?: string,
    currentAmount?: number
): Promise<string> {
    try {
        console.log('[AI Tool] Creating goal:', { title, targetAmount, deadline, metricType, isRecurring, recurrenceType, startTrackingDate, currentAmount });

        // Auto-detect if this is an EMI/payment goal
        const titleLower = title.toLowerCase();
        const isEMIGoal = titleLower.includes('emi') || titleLower.includes('payment') ||
            titleLower.includes('bill') || titleLower.includes('loan') ||
            titleLower.includes('rent') || titleLower.includes('installment');

        // For EM goals, set to manual_check and emi type
        const finalMetricType = isEMIGoal ? 'manual_check' : metricType;
        const goalType = isEMIGoal ? 'emi' : 'auto';

        const goal = await addGoal({
            title,
            target_amount: targetAmount,
            deadline: deadline,
            metric_type: finalMetricType,
            start_tracking_date: startTrackingDate || new Date().toISOString(),
            is_recurring: isRecurring,
            recurrence_type: recurrenceType,
            goal_type: goalType,
            allocated_amount: 0,
            reminder_enabled: true,
            current_amount: currentAmount || 0
        });

        const recurrenceText = isRecurring ? ` (${recurrenceType})` : '';
        if (goal) {
            console.log('[AI Tool] Goal created successfully:', goal);
            // Dispatch event to refresh dashboard
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('goal-updated'));
            }

            let response = `✅ Goal created successfully!\n- Title: "${title}"\n- Target: ₹${targetAmount.toLocaleString()}\n- Deadline: ${deadline || 'No deadline'}\n- Type: ${isEMIGoal ? '💳 EMI/Payment (Manual Allocation)' : '🎯 Auto-Tracked'}${recurrenceText}`;

            if (isEMIGoal) {
                response += `\n\n💡 This is an EMI goal. You can:\n• Allocate funds: "Allocate ₹X to ${title}"\n• Check surplus: "What's my surplus?"\n• Set tracking date: "Track from [date]"`;
            }

            return response;
        }
        console.error('[AI Tool] Goal creation returned null - check database connection and schema');
        return '❌ Failed to create goal. The goal data was valid, but the database operation failed. Please check that the user_goals table has all required columns.';
    } catch (error) {
        console.error('[AI Tool] Create goal error:', error);
        return `❌ Error creating goal: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Tool: Update Goal Progress or Details
async function toolUpdateGoalProgress(searchTitle: string, updates: { targetAmount?: number; deadline?: string; isRecurring?: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; currentAmount?: number; addAmount?: number; reduceAmount?: number; startDate?: string; newTitle?: string }): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            const updateData: any = {};
            let message = '';

            if (updates.targetAmount) {
                updateData.target_amount = updates.targetAmount;
                message += ` Target: ₹${updates.targetAmount.toLocaleString()}.`;
            }
            if (updates.deadline) {
                updateData.deadline = updates.deadline;
                message += ` Deadline: ${updates.deadline}.`;
            }
            if (updates.isRecurring !== undefined) {
                updateData.is_recurring = updates.isRecurring;
                message += ` Recurring: ${updates.isRecurring}.`;
            }
            if (updates.recurrenceType) {
                updateData.recurrence_type = updates.recurrenceType;
                message += ` Type: ${updates.recurrenceType}.`;
            }
            if (updates.startDate) {
                updateData.start_tracking_date = updates.startDate;
                message += ` Start Date: ${updates.startDate}.`;
            }
            if (updates.newTitle) {
                updateData.title = updates.newTitle;
                message += ` Renamed to: "${updates.newTitle}".`;
            }

            // Handle Progress Updates
            if (updates.currentAmount !== undefined) {
                updateData.current_amount = updates.currentAmount;
                updateData.metric_type = 'manual_check'; // Switch to manual so it sticks
                message += ` Progress set to: ₹${updates.currentAmount.toLocaleString()}. (Switched to manual tracking)`;
            } else if (updates.addAmount !== undefined) {
                updateData.current_amount = (match.current_amount || 0) + updates.addAmount;
                updateData.metric_type = 'manual_check'; // Switch to manual so it sticks
                message += ` Added ₹${updates.addAmount.toLocaleString()} to progress. New total: ₹${updateData.current_amount.toLocaleString()}. (Switched to manual tracking)`;
            } else if (updates.reduceAmount !== undefined) {
                const current = match.current_amount || 0;
                const newAmount = Math.max(0, current - updates.reduceAmount);
                updateData.current_amount = newAmount;
                updateData.metric_type = 'manual_check'; // Switch to manual so it sticks
                message += ` Reduced progress by ₹${updates.reduceAmount.toLocaleString()}. New total: ₹${newAmount.toLocaleString()}. (Switched to manual tracking)`;
            }

            if (Object.keys(updateData).length > 0) {
                const success = await updateGoal(match.id, updateData);
                if (success) {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new Event('goal-updated'));
                    }
                    return `✅ Updated goal "${match.title}":${message}`;
                } else {
                    return `❌ Failed to update goal "${match.title}" in the database. Please try again.`;
                }
            } else {
                return `ℹ️ No changes needed for goal "${match.title}".`;
            }
        }
        return `❌ No goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Update goal error:', error);
        return 'Error updating goal.';
    }
}

// Tool: Delete/Archive a Goal
async function toolDeleteGoal(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (match) {
            const success = await deleteGoal(match.id);
            if (success) {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('goal-updated'));
                }
                return `✅ Deleted goal: "${match.title}"`;
            } else {
                return `❌ Failed to delete goal "${match.title}" in the database.`;
            }
        }
        return `❌ No goal found matching "${searchTitle}"`;
    } catch (error) {
        console.error('[AI Tool] Delete goal error:', error);
        return 'Error deleting goal.';
    }
}

// Tool: Get Available Surplus (net profit minus completed EMIs)
async function toolGetSurplus(): Promise<string> {
    try {
        const { netProfitThisMonth, completedEMIsTotal, availableSurplus } = await calculateAvailableSurplus();
        const goals = await getActiveGoals();
        const pendingEMIs = goals.filter(g => g.goal_type === 'emi' || g.metric_type === 'manual_check');

        let output = ``;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💰 **SURPLUS CALCULATION**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        output += `📈 Net Profit (This Month): ₹${netProfitThisMonth.toLocaleString()}\n`;
        output += `✅ Completed EMIs/Payments: - ₹${completedEMIsTotal.toLocaleString()}\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💵 **Available Surplus: ₹${availableSurplus.toLocaleString()}**\n\n`;

        if (pendingEMIs.length > 0) {
            output += `📋 **Pending EMIs (${pendingEMIs.length}):**\n`;
            for (const emi of pendingEMIs) {
                const remaining = Math.max(0, emi.target_amount - emi.current_amount);
                output += `   • ${emi.title}: ₹${remaining.toLocaleString()} remaining\n`;
            }
            output += `\n`;
        }

        output += `💡 **Use Your Surplus:**\n`;
        output += `   • "Allocate ₹X to [goal]"\n`;
        output += `   • "Use surplus for [goal]"`;

        return output;
    } catch (error) {
        console.error('[AI Tool] Get surplus error:', error);
        return 'Error calculating surplus.';
    }
}

// Tool: Allocate funds to a goal
async function toolAllocateToGoalFunds(
    goalTitle: string,
    amount: number,
    source: 'surplus' | 'daily_profit' | 'manual' = 'manual'
): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        // Check if amount is valid
        if (amount <= 0) {
            return `❌ Amount must be greater than 0`;
        }

        // Allocate to goal
        const success = await allocateToGoal(match.id, amount, source);

        if (!success) {
            return `❌ Failed to allocate funds to "${match.title}"`;
        }

        const newTotal = (match.current_amount || 0) + amount;
        const progress = Math.min(100, (newTotal / match.target_amount) * 100);
        const remaining = Math.max(0, match.target_amount - newTotal);
        const progressBar = generateProgressBar(progress);

        let message = ``;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `✅ **ALLOCATION SUCCESSFUL**\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        message += `📌 Goal: **${match.title}**\n`;
        message += `💵 Allocated: + ₹${amount.toLocaleString()}\n\n`;

        message += `📊 **Updated Progress:**\n`;
        message += `   ${progressBar} ${progress.toFixed(0)}%\n`;
        message += `   ₹${newTotal.toLocaleString()} / ₹${match.target_amount.toLocaleString()}\n\n`;

        if (remaining <= 0) {
            message += `🎉 **Goal is now 100% funded!**\n`;
            message += `💡 Say "Mark ${match.title} complete" when paid`;
        } else {
            message += `💪 Remaining: ₹${remaining.toLocaleString()}`;
        }

        return message;
    } catch (error) {
        console.error('[AI Tool] Allocate to goal error:', error);
        return 'Error allocating funds to goal.';
    }
}

// Tool: List all goals with comprehensive status
async function toolListAllGoals(): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const { availableSurplus, netProfitThisMonth, completedEMIsTotal } = await calculateAvailableSurplus();

        if (goals.length === 0) {
            return `📋 **No Active Goals**\n\nYou haven't set any goals yet.\n\n💡 **Get Started:**\n• "Set a goal for EMI of 15000 by 20th"\n• "Track 50k profit this month"`;
        }

        // Separate EMI and auto-tracked goals
        const emiGoals = goals.filter(g => g.metric_type === 'manual_check' || g.goal_type === 'emi');
        const autoGoals = goals.filter(g => g.metric_type !== 'manual_check' && g.goal_type !== 'emi');

        let output = ``;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `📊 **GOALS SUMMARY**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Financial Overview
        output += `💰 **Financial Overview:**\n`;
        output += `├─ Net Profit (This Month): ₹${netProfitThisMonth.toLocaleString()}\n`;
        output += `├─ Completed EMIs: ₹${completedEMIsTotal.toLocaleString()}\n`;
        output += `└─ Available Surplus: **₹${availableSurplus.toLocaleString()}**\n\n`;

        // EMI Goals Section
        if (emiGoals.length > 0) {
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `💳 **EMI / PAYMENT GOALS** (${emiGoals.length})\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            for (const goal of emiGoals) {
                const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                const remaining = Math.max(0, goal.target_amount - goal.current_amount);
                const progressBar = generateProgressBar(progress);

                let daysText = '';
                let urgency = '';
                if (goal.deadline) {
                    const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    if (daysLeft < 0) {
                        daysText = `⚠️ OVERDUE by ${Math.abs(daysLeft)} days`;
                        urgency = '🔴';
                    } else if (daysLeft === 0) {
                        daysText = `🔥 DUE TODAY!`;
                        urgency = '🔴';
                    } else if (daysLeft <= 3) {
                        daysText = `⚡ ${daysLeft} days left`;
                        urgency = '🟡';
                    } else {
                        daysText = `${daysLeft} days left`;
                        urgency = '🟢';
                    }
                }

                output += `${urgency} **${goal.title}**\n`;
                output += `   ${progressBar} ${progress.toFixed(0)}%\n`;
                output += `   ₹${goal.current_amount.toLocaleString()} / ₹${goal.target_amount.toLocaleString()}\n`;

                if (remaining > 0) {
                    output += `   Remaining: ₹${remaining.toLocaleString()}`;
                    if (daysText) {
                        output += ` · ${daysText}`;
                    }
                    output += `\n`;
                } else {
                    output += `   ✅ Fully Funded! Ready to complete.\n`;
                }
                output += `\n`;
            }
        }

        // Auto-Tracked Goals Section
        if (autoGoals.length > 0) {
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `🎯 **AUTO-TRACKED GOALS** (${autoGoals.length})\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            for (const goal of autoGoals) {
                const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                const remaining = Math.max(0, goal.target_amount - goal.current_amount);
                const progressBar = generateProgressBar(progress);

                let daysText = '';
                let dailyTarget = 0;
                if (goal.deadline) {
                    const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    daysText = daysLeft > 0 ? `${daysLeft} days left` : (daysLeft === 0 ? 'Due today!' : 'Overdue');
                    dailyTarget = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0;
                }

                const metricLabel = goal.metric_type === 'net_profit' ? '📈 Net Profit' :
                    goal.metric_type === 'revenue' ? '💵 Revenue' :
                        goal.metric_type === 'sales_count' ? '🛒 Sales Count' :
                            goal.metric_type === 'customer_count' ? '👥 Customers' :
                                goal.metric_type === 'gross_profit' ? '💰 Gross Profit' :
                                    goal.metric_type === 'margin' ? '📊 Margin %' :
                                        goal.metric_type === 'product_sales' ? '📦 Product Sales' : '🎯 Goal';

                output += `${metricLabel}: **${goal.title}**\n`;
                output += `   ${progressBar} ${progress.toFixed(0)}%\n`;
                output += `   ₹${goal.current_amount.toLocaleString()} / ₹${goal.target_amount.toLocaleString()}\n`;

                if (remaining > 0 && dailyTarget > 0) {
                    output += `   Need: ₹${dailyTarget.toLocaleString()}/day · ${daysText}\n`;
                } else if (remaining <= 0) {
                    output += `   🎉 Goal Achieved!\n`;
                }
                output += `\n`;
            }
        }

        // Actions Section
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `💡 **QUICK ACTIONS**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        output += `• "Allocate ₹X to [goal]" → Add funds\n`;
        output += `• "Add surplus to [goal]" → Use available surplus\n`;
        output += `• "Mark [goal] complete" → Complete a goal\n`;
        output += `• "What's my surplus?" → Check available money`;

        return output;
    } catch (error) {
        console.error('[AI Tool] List goals error:', error);
        return 'Error fetching goals.';
    }
}

// Helper: Generate visual progress bar
function generateProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}


// Tool: Mark goal as complete with timestamp
async function toolMarkGoalComplete(searchTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(searchTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${searchTitle}"`;
        }

        const isEMIGoal = match.goal_type === 'emi' || match.metric_type === 'manual_check';

        const success = await completeGoalWithTimestamp(match.id);

        if (!success) {
            return `❌ Failed to complete goal "${match.title}"`;
        }

        let response = ``;
        response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        response += `🎉 **GOAL COMPLETED!**\n`;
        response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        response += `📌 Goal: **${match.title}**\n`;
        response += `💰 Amount: ₹${match.target_amount.toLocaleString()}\n`;
        response += `📅 Completed: ${new Date().toLocaleDateString()}\n\n`;
        response += `🏆 Great job! Keep it up!`;

        // PROACTIVE POST-COMPLETION FLOW
        if (isEMIGoal) {
            // Calculate new surplus after marking this EMI complete
            const { availableSurplus, netProfitThisMonth, completedEMIsTotal } = await calculateAvailableSurplus();

            // Find other active EMI goals
            const otherEMIs = goals.filter(g =>
                g.id !== match.id &&
                (g.goal_type === 'emi' || g.metric_type === 'manual_check')
            );

            if (availableSurplus > 0 && otherEMIs.length > 0) {
                response += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                response += `📊 **UPDATED FINANCES**\n`;
                response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                response += `├─ Net Profit: ₹${netProfitThisMonth.toLocaleString()}\n`;
                response += `├─ Completed EMIs: ₹${completedEMIsTotal.toLocaleString()}\n`;
                response += `└─ **Surplus: ₹${availableSurplus.toLocaleString()}**\n`;

                // Find the next EMI with earliest deadline
                const nextEMI = otherEMIs.sort((a, b) => {
                    if (!a.deadline) return 1;
                    if (!b.deadline) return -1;
                    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                })[0];

                if (nextEMI) {
                    const remaining = nextEMI.target_amount - (nextEMI.current_amount || 0);
                    const daysLeft = nextEMI.deadline ? Math.ceil((new Date(nextEMI.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const progressBar = generateProgressBar(Math.min(100, ((nextEMI.current_amount || 0) / nextEMI.target_amount) * 100));

                    response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    response += `🎯 **NEXT EMI: ${nextEMI.title}**\n`;
                    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    response += `   ${progressBar}\n`;
                    response += `   ₹${(nextEMI.current_amount || 0).toLocaleString()} / ₹${nextEMI.target_amount.toLocaleString()}\n`;
                    response += `   Remaining: ₹${remaining.toLocaleString()}`;
                    if (daysLeft !== null) {
                        response += ` · ${daysLeft} days left`;
                    }
                    response += `\n`;

                    response += `\n💡 **Quick Action:**\n`;
                    if (availableSurplus >= remaining) {
                        response += `   You can fully fund this goal!\n`;
                        response += `   → "Allocate ₹${remaining.toLocaleString()} to ${nextEMI.title}"`;
                    } else {
                        response += `   → "Use surplus for ${nextEMI.title}"`;
                    }
                }
            } else if (availableSurplus > 0) {
                response += `\n\n💰 **Surplus: ₹${availableSurplus.toLocaleString()}**\n`;
                response += `✨ No other EMI goals pending. Amazing work!`;
            }
        }

        return response;
    } catch (error) {
        console.error('[AI Tool] Complete goal error:', error);
        return 'Error completing goal.';
    }
}

// Tool: Set tracking date for a goal with surplus choice
async function toolSetTrackingDate(
    goalTitle: string,
    startDate: string,
    includeSurplus: boolean
): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        // Update goal with tracking preferences
        await updateGoal(match.id, {
            allocation_start_date: startDate,
            include_surplus: includeSurplus
        });

        const { availableSurplus } = await calculateAvailableSurplus();

        let response = `✅ **Tracking configured for "${match.title}"**\n\n📅 Start Date: ${new Date(startDate).toLocaleDateString()}\n`;

        if (includeSurplus) {
            response += `💰 Including Previous Surplus: ₹${availableSurplus.toLocaleString()}\n`;
            response += `\n📊 I'll track:\n• Previous surplus: ₹${availableSurplus.toLocaleString()}\n• + Net profit from ${new Date(startDate).toLocaleDateString()} onwards`;
        } else {
            response += `🆕 Starting Fresh (₹0)\n`;
            response += `\n📊 I'll only count net profit from ${new Date(startDate).toLocaleDateString()} onwards`;
        }

        response += `\n\n💡 You can still add surplus later by saying "Add surplus to ${match.title}"`;

        return response;
    } catch (error) {
        console.error('[AI Tool] Set tracking date error:', error);
        return 'Error setting tracking date.';
    }
}

// Tool: Add surplus to a goal
async function toolAddSurplusToGoal(goalTitle: string): Promise<string> {
    try {
        const goals = await getActiveGoals();
        const match = goals.find(g =>
            g.title.toLowerCase().includes(goalTitle.toLowerCase())
        );

        if (!match) {
            return `❌ No active goal found matching "${goalTitle}"`;
        }

        const { availableSurplus } = await calculateAvailableSurplus();

        if (availableSurplus <= 0) {
            return `📊 No surplus available to add.\n\nNet profit this month has already been allocated to completed EMIs.`;
        }

        // Allocate surplus to goal
        const success = await allocateToGoal(match.id, availableSurplus, 'surplus');

        if (!success) {
            return `❌ Failed to add surplus to "${match.title}"`;
        }

        const newTotal = (match.current_amount || 0) + availableSurplus;
        const progress = Math.min(100, (newTotal / match.target_amount) * 100);
        const remaining = Math.max(0, match.target_amount - newTotal);

        let response = `✅ **Added surplus to "${match.title}"**\n\n💰 Surplus Added: ₹${availableSurplus.toLocaleString()}\n\n📊 Updated Progress:\n- Total: ₹${newTotal.toLocaleString()} / ₹${match.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

        if (remaining <= 0) {
            response += `\n\n🎉 Goal is now 100% funded! Ready to mark as complete?`;
        } else {
            response += `\n- Remaining: ₹${remaining.toLocaleString()}`;

            if (match.deadline) {
                const daysLeft = Math.ceil((new Date(match.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                if (daysLeft > 0) {
                    const dailyNeeded = Math.ceil(remaining / daysLeft);
                    response += `\n- Daily target: ₹${dailyNeeded.toLocaleString()}/day for ${daysLeft} days`;
                }
            }
        }

        return response;
    } catch (error) {
        console.error('[AI Tool] Add surplus error:', error);
        return 'Error adding surplus.';
    }
}

// Parse goal creation from natural language
// Helper to determine start date based on context
// TODO: Integrate this with goal creation confirmation dialog

function parseSmartDateRange(message: string): {
    startDate: string;
    suggestedStartDate?: string;
    shouldAsk: boolean;
    context: string
} {
    const today = new Date();
    const lowerMessage = message.toLowerCase();

    // Default: start from today
    let startDate = format(today, 'yyyy-MM-dd');
    let suggestedStartDate: string | undefined;
    let shouldAsk = false;
    let context = 'today';

    // Context-based detection
    if (lowerMessage.includes('this month')) {
        // If they say "this month", they might want data from start of month
        suggestedStartDate = format(startOfMonth(today), 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'this month';
    } else if (lowerMessage.includes('this week')) {
        // If they say "this week", they might want data from start of week
        const startOfWeek = subDays(today, today.getDay());
        suggestedStartDate = format(startOfWeek, 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'this week';
    } else if (lowerMessage.match(/month\s+end|by\s+month\s+end/)) {
        // "by month end" likely means from month start
        suggestedStartDate = format(startOfMonth(today), 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'month end';
    } else if (lowerMessage.includes('week end') || lowerMessage.includes('by weekend')) {
        // "by week end" likely means from week start
        const startOfWeek = subDays(today, today.getDay());
        suggestedStartDate = format(startOfWeek, 'yyyy-MM-dd');
        shouldAsk = true;
        context = 'week end';
    }

    // If we have a suggested start date, use it as default if not asking
    if (suggestedStartDate && !shouldAsk) {
        startDate = suggestedStartDate;
    }

    return { startDate, suggestedStartDate, shouldAsk, context };
}


// Helper: Parse natural dates (ISO, relative, or descriptive)
// ULTRA-ENHANCED: Handles hundreds of natural language date patterns
function parseSmartDate(text: string): string | null {
    const now = new Date();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthsFull = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const lower = text.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();

    // Helper: Get month index from string (supports partial and full names)
    const getMonthIndex = (monthStr: string): number => {
        const m = monthStr.toLowerCase();
        let idx = months.findIndex(mon => m.startsWith(mon));
        if (idx === -1) idx = monthsFull.findIndex(mon => m.startsWith(mon.substring(0, 3)));
        return idx;
    };

    // Helper: Create date from month/day with smart year handling
    const createDate = (monthIdx: number, day: number, forceNextYear: boolean = false): string => {
        let year = now.getFullYear();
        // If the date is in the past, move to next year (smart future assumption)
        const testDate = new Date(year, monthIdx, day);
        if (testDate < now && !forceNextYear) {
            // Only move to next year if it's significantly in the past (more than 7 days ago)
            const daysDiff = Math.floor((now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff > 7) year++;
        }
        if (forceNextYear && new Date(year, monthIdx, day) <= now) year++;
        return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    // ==========================================
    // PATTERN 1: "5th feb next month" / "feb 5 next month" / "next month 5th"
    // ==========================================
    let match = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+next\s+month/i);
    if (match) {
        const day = parseInt(match[1]);
        const monthIdx = getMonthIndex(match[2]);
        // Use the detected month but ensure it's in the future
        return createDate(monthIdx, day, true);
    }

    match = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\s+next\s+month/i);
    if (match) {
        const monthIdx = getMonthIndex(match[1]);
        const day = parseInt(match[2]);
        return createDate(monthIdx, day, true);
    }

    // "next month 5th" or "next month on the 5th"
    match = lower.match(/next\s+month\s+(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
    if (match) {
        const day = parseInt(match[1]);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
        return format(nextMonth, 'yyyy-MM-dd');
    }

    // ==========================================
    // PATTERN 2: Standard month + day combinations
    // ==========================================
    // "Jan 20", "January 20th", "20th Jan", "20 January"
    match = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s|$)/i);
    if (match) {
        const monthIdx = getMonthIndex(match[1]);
        const day = parseInt(match[2]);
        return createDate(monthIdx, day);
    }

    match = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i);
    if (match) {
        const day = parseInt(match[1]);
        const monthIdx = getMonthIndex(match[2]);
        return createDate(monthIdx, day);
    }

    // ==========================================
    // PATTERN 3: Relative dates
    // ==========================================
    if (lower.match(/\btoday\b/)) return format(now, 'yyyy-MM-dd');
    if (lower.match(/\btomorrow\b/)) return format(addDays(now, 1), 'yyyy-MM-dd');
    if (lower.match(/\bday\s+after\s+tomorrow\b/)) return format(addDays(now, 2), 'yyyy-MM-dd');
    if (lower.match(/\byesterday\b/)) return format(addDays(now, -1), 'yyyy-MM-dd');

    // "in X days" / "after X days"
    match = lower.match(/(?:in|after)\s+(\d+)\s+days?/i);
    if (match) return format(addDays(now, parseInt(match[1])), 'yyyy-MM-dd');

    // "X days from now/today"
    match = lower.match(/(\d+)\s+days?\s+(?:from\s+)?(?:now|today)/i);
    if (match) return format(addDays(now, parseInt(match[1])), 'yyyy-MM-dd');

    // ==========================================
    // PATTERN 4: Week-based dates
    // ==========================================
    if (lower.match(/\bnext\s+week\b/)) return format(addDays(now, 7), 'yyyy-MM-dd');
    if (lower.match(/\bthis\s+weekend\b/)) {
        const daysToSaturday = (6 - now.getDay() + 7) % 7 || 7;
        return format(addDays(now, daysToSaturday), 'yyyy-MM-dd');
    }
    if (lower.match(/\bend\s+of\s+(?:this\s+)?week\b/)) {
        const daysToFriday = (5 - now.getDay() + 7) % 7 || 7;
        return format(addDays(now, daysToFriday), 'yyyy-MM-dd');
    }

    // "in X weeks"
    match = lower.match(/(?:in|after)\s+(\d+)\s+weeks?/i);
    if (match) return format(addDays(now, parseInt(match[1]) * 7), 'yyyy-MM-dd');

    // ==========================================
    // PATTERN 5: Month-based dates
    // ==========================================
    if (lower.match(/\bnext\s+month\b/) && !lower.match(/\d/)) {
        // Just "next month" without a day - first of next month
        return format(addDays(endOfMonth(now), 1), 'yyyy-MM-dd');
    }
    if (lower.match(/\bend\s+of\s+(?:this\s+)?month\b/)) return format(endOfMonth(now), 'yyyy-MM-dd');
    if (lower.match(/\bmonth\s*end\b/)) return format(endOfMonth(now), 'yyyy-MM-dd');
    if (lower.match(/\bthis\s+month\b/) && !lower.match(/\d/)) return format(endOfMonth(now), 'yyyy-MM-dd');

    // "end of next month"
    if (lower.match(/\bend\s+of\s+next\s+month\b/)) {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return format(endOfMonth(nextMonth), 'yyyy-MM-dd');
    }

    // ==========================================
    // PATTERN 6: Year-based dates
    // ==========================================
    if (lower.match(/\bend\s+of\s+(?:this\s+)?year\b/)) return `${now.getFullYear()}-12-31`;
    if (lower.match(/\bnext\s+year\b/)) return `${now.getFullYear() + 1}-01-01`;
    if (lower.match(/\byear\s*end\b/)) return `${now.getFullYear()}-12-31`;

    // ==========================================
    // PATTERN 7: Just day numbers (assume current/next month)
    // ==========================================
    // "by the 5th", "on 20th", "by 15"
    match = lower.match(/(?:by|on|the)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s|$)/i);
    if (match) {
        const day = parseInt(match[1]);
        if (day >= 1 && day <= 31) {
            const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
            if (thisMonth >= now) {
                return format(thisMonth, 'yyyy-MM-dd');
            } else {
                // Next month
                return format(new Date(now.getFullYear(), now.getMonth() + 1, day), 'yyyy-MM-dd');
            }
        }
    }

    // ==========================================
    // PATTERN 8: ISO and standard formats
    // ==========================================
    // ISO format: 2026-01-15
    match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;

    // DD/MM/YYYY or DD-MM-YYYY
    match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
        return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
    }

    // DD/MM or DD-MM (assume current/next year)
    match = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:\s|$)/);
    if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            return createDate(month, day);
        }
    }

    return null;
}

// Helper: Parse recurrence from natural language
// ENHANCED: Handles explicit non-recurring and more patterns
function parseRecurrence(text: string): { isRecurring: boolean; recurrenceType?: 'monthly' | 'weekly' | 'yearly'; explicitNonRecurring?: boolean } {
    const lower = text.toLowerCase().replace(/['']/g, "'");

    // EXPLICIT NON-RECURRING: Check these FIRST (takes priority)
    if (lower.match(/\b(not?\s*recurring|non[\s-]?recurring|one[\s-]?time|once|single|only\s*once|just\s*once|no\s*recur|doesn'?t?\s*recur|don'?t\s*recur|isn'?t?\s*recurring|no\s*repeat|not\s*repeat)/)) {
        return { isRecurring: false, explicitNonRecurring: true };
    }
    if (lower.match(/\b(its?\s*not\s*recurring|it'?s?\s*not\s*recurring)/)) {
        return { isRecurring: false, explicitNonRecurring: true };
    }

    // RECURRING PATTERNS
    if (lower.match(/\b(monthly|every\s*month|per\s*month|each\s*month|month[\s-]?end\s*recur|recur.*month)/)) {
        return { isRecurring: true, recurrenceType: 'monthly' };
    }
    if (lower.match(/\b(weekly|every\s*week|per\s*week|each\s*week|recur.*week)/)) {
        return { isRecurring: true, recurrenceType: 'weekly' };
    }
    if (lower.match(/\b(yearly|annually|annual|every\s*year|per\s*year|each\s*year|recur.*year)/)) {
        return { isRecurring: true, recurrenceType: 'yearly' };
    }
    if (lower.match(/\b(recurring|repeat|repeating|auto[\s-]?renew|cycle|periodic)/)) {
        return { isRecurring: true, recurrenceType: 'monthly' }; // Default to monthly
    }

    // No recurrence info found
    return { isRecurring: false };
}

// ULTRA-ENHANCED: Parse goals from complex natural language with any ordering
function parseGoalFromMessage(message: string): {
    title: string;
    target: number;
    deadline?: string;
    startDate?: string;
    isRecurring: boolean;
    recurrenceType?: 'monthly' | 'weekly' | 'yearly';
    targetType?: 'amount' | 'percentage';
    currentAmount?: number;
    explicitNonRecurring?: boolean;
} | null {
    const originalMessage = message;
    const lowerMessage = message.toLowerCase();
    console.log('[parseGoalFromMessage] Input:', message);

    // ==========================================
    // STEP 1: EXTRACT TARGET AMOUNT
    // ==========================================
    // Find all number patterns and identify the TARGET amount (usually the largest or first mentioned)
    const amountPatterns = [
        // "50k revenue", "₹50000", "50000 rupees", "50,000", "1 lakh", "1L"
        /(?:₹|rs\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lac|L|cr|crore)?(?:\s*(?:rupee|rs|₹)s?)?/gi,
        // "target of 50k", "goal of 1 lakh"
        /(?:target|goal|aim|achieve|achieving|reach|reaching|earn|earning|make|making|get|save|saving)\s*(?:of\s*)?(?:₹|rs\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lac|L|cr|crore)?/gi,
        // Percentage: "20%", "20 percent"
        /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)/gi
    ];

    let targetAmount = 0;
    let targetType: 'amount' | 'percentage' = 'amount';
    let amountMatchStr = '';

    // Look for the primary amount (first significant number that's not a date)
    const allAmounts: { value: number; match: string; index: number; isPercent: boolean }[] = [];

    for (const pattern of amountPatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(message)) !== null) {
            let val = parseFloat(match[1].replace(/,/g, ''));
            const suffix = (match[2] || '').toLowerCase();
            const isPercent = match[0].includes('%') || match[0].toLowerCase().includes('percent');

            // Skip if this looks like a date (1-31 followed by month or ordinal)
            const afterMatch = message.substring(match.index, match.index + 30).toLowerCase();
            if (afterMatch.match(/^\d{1,2}(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)) {
                continue;
            }

            if (!isPercent) {
                if (suffix === 'k') val *= 1000;
                else if (suffix === 'lakh' || suffix === 'lac' || suffix === 'l') val *= 100000;
                else if (suffix === 'cr' || suffix === 'crore') val *= 10000000;
            }

            allAmounts.push({ value: val, match: match[0], index: match.index || 0, isPercent });
        }
    }

    console.log('[parseGoalFromMessage] Found amounts:', allAmounts);

    // Pick the most likely target amount (largest, or first significant one > 100)
    const significantAmounts = allAmounts.filter(a => a.value >= 100 || a.isPercent);
    const targetAmountObj = significantAmounts.length > 0
        ? significantAmounts.reduce((a, b) => a.value > b.value ? a : b)
        : allAmounts[0];

    if (!targetAmountObj) {
        console.log('[parseGoalFromMessage] No amount found');
        return null;
    }

    targetAmount = targetAmountObj.value;
    targetType = targetAmountObj.isPercent ? 'percentage' : 'amount';
    amountMatchStr = targetAmountObj.match;

    console.log('[parseGoalFromMessage] Target amount:', targetAmount, 'Type:', targetType);

    // ==========================================
    // STEP 2: EXTRACT CURRENT PROGRESS (initial amount)
    // ==========================================
    let currentAmount = 0;
    const currentPatterns = [
        /(?:already|have|started?|starting|current(?:ly)?|saved|balance|initial(?:ly)?|got|with)\s*(?:with|at|of|is|have)?\s*(?:₹|rs\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lac|L)?/i,
        /(?:₹|rs\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|K|lakh|lac|L)?\s*(?:already|saved|so\s*far|currently)/i
    ];

    for (const pattern of currentPatterns) {
        const match = message.match(pattern);
        if (match && match[1] !== amountMatchStr.replace(/[₹,\s]/g, '')) {
            let val = parseFloat(match[1].replace(/,/g, ''));
            const suffix = (match[2] || '').toLowerCase();
            if (suffix === 'k') val *= 1000;
            else if (suffix === 'lakh' || suffix === 'lac' || suffix === 'l') val *= 100000;

            // Only accept if different from target
            if (val !== targetAmount) {
                currentAmount = val;
                break;
            }
        }
    }

    // ==========================================
    // STEP 3: EXTRACT DATES (Start and End/Deadline)
    // ==========================================
    let deadline: string | undefined;
    let startDate: string | undefined;

    // DEADLINE patterns: "end date", "deadline", "by", "until", "due", "complete by"
    const deadlinePatterns = [
        /(?:end\s*date|deadline|due\s*(?:date)?|by|until|complete\s*by|finish\s*by|target\s*date)(?:\s*(?:of|is|:|\-))?\s*(.{3,40}?)(?=\s+(?:and|with|start|not|its|it's|recurring|$))/i,
        /(?:end\s*date|deadline|due|by|until)(?:\s*(?:of|is|:|\-))?\s*(.{3,40})/i
    ];

    for (const pattern of deadlinePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            const parsed = parseSmartDate(match[1].trim());
            if (parsed) {
                deadline = parsed;
                console.log('[parseGoalFromMessage] Deadline found:', parsed, 'from:', match[1]);
                break;
            }
        }
    }

    // START DATE patterns: "start date", "starting", "from", "beginning"
    const startPatterns = [
        /(?:start\s*(?:date|from)?|starting|from|beginning|begin)(?:\s*(?:of|is|:|\-|from))?\s*(.{3,30}?)(?=\s+(?:and|with|end|not|its|it's|recurring|deadline|$))/i,
        /(?:start|starting|from|begin)(?:\s*(?:date|of|is|:|\-))?\s*(.{3,30})/i
    ];

    for (const pattern of startPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            // Skip if this looks like "start date today and end date..."
            const fragment = match[1].trim();
            if (fragment.match(/^(today|now|immediately|right\s*now)$/i)) {
                startDate = format(new Date(), 'yyyy-MM-dd');
                console.log('[parseGoalFromMessage] Start date: today');
                break;
            }
            const parsed = parseSmartDate(fragment);
            if (parsed && parsed !== deadline) {
                startDate = parsed;
                console.log('[parseGoalFromMessage] Start date found:', parsed, 'from:', fragment);
                break;
            }
        }
    }

    // FALLBACK: Check for implicit dates
    if (!deadline) {
        if (lowerMessage.match(/\b(this\s+month|month\s*end)\b/) && !lowerMessage.includes('next month')) {
            deadline = format(endOfMonth(new Date()), 'yyyy-MM-dd');
        } else if (lowerMessage.match(/\bthis\s+week\b/)) {
            deadline = format(addDays(new Date(), 7 - new Date().getDay()), 'yyyy-MM-dd');
        } else if (lowerMessage.match(/\bnext\s+month\b/) && !deadline) {
            // If "next month" mentioned without specific date, use last day of next month
            const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
            deadline = format(endOfMonth(nextMonth), 'yyyy-MM-dd');
        }
        // Also try parsing the whole message for any date
        if (!deadline) {
            const wholeMsgDate = parseSmartDate(message);
            if (wholeMsgDate) deadline = wholeMsgDate;
        }
    }

    // ==========================================
    // STEP 4: EXTRACT RECURRENCE
    // ==========================================
    const recurrenceInfo = parseRecurrence(message);
    const { isRecurring, recurrenceType, explicitNonRecurring } = recurrenceInfo;

    // ==========================================
    // STEP 5: EXTRACT TITLE
    // ==========================================
    // Strategy: Remove known patterns and extract meaningful words
    let title = originalMessage
        // Remove command prefixes
        .replace(/^(please\s+)?((can\s+you\s+)?create|set|make|add|start|begin|i\s+want\s+(to\s+)?|let'?s?\s+|help\s+me\s+)?\s*(a\s+)?(new\s+)?(goal|target|objective|task)\s*(for|to|of|called|named|:|\-)?\s*/i, '')
        // Remove amount expressions
        .replace(/(?:₹|rs\.?\s*)?\d+(?:,\d+)*(?:\.\d+)?\s*(?:k|K|lakh|lac|L|cr|crore)?(?:\s*(?:rupee|rs|₹)s?)?/gi, '')
        // Remove date expressions
        .replace(/(?:end\s*date|deadline|due\s*(?:date)?|start\s*(?:date)?|by|until|from)\s*(?:of|is|:|\-)?\s*.{3,30}?(?=\s+(?:and|with|not|its|it's|recurring|$))/gi, '')
        .replace(/(?:today|tomorrow|next\s+(?:week|month|year)|this\s+(?:week|month)|(?:\d{1,2}(?:st|nd|rd|th)?\s*)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:\s+next\s+month)?)/gi, '')
        // Remove recurrence words
        .replace(/\b(monthly|weekly|yearly|annually|recurring|repeat|repeating|not?\s*recurring|non[\s-]?recurring|one[\s-]?time|once|its?\s*not\s*recurring|it'?s?\s*not\s*recurring)\b/gi, '')
        // Remove common noise
        .replace(/\b(and|with|the|a|an|for|of|to|is|its|it's|my|i|want|need|have|having|will|should|target|goal|amount|revenue|profit|sales|earning|achieve|achieving|reach|reaching|make|making|get|getting)\b/gi, '')
        // Clean up punctuation and whitespace
        .replace(/[:\-,]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Clean up leading/trailing junk
    title = title.replace(/^[\s\-:,]+|[\s\-:,]+$/g, '').trim();

    // If title is too short or empty, generate one
    if (!title || title.length < 3) {
        if (targetType === 'percentage') {
            title = `${targetAmount}% Margin Goal`;
        } else if (lowerMessage.includes('revenue')) {
            title = `₹${targetAmount.toLocaleString()} Revenue`;
        } else if (lowerMessage.includes('profit')) {
            title = `₹${targetAmount.toLocaleString()} Profit`;
        } else if (lowerMessage.includes('sales')) {
            title = `₹${targetAmount.toLocaleString()} Sales`;
        } else if (lowerMessage.includes('sav')) {
            title = `₹${targetAmount.toLocaleString()} Savings`;
        } else {
            title = `₹${targetAmount.toLocaleString()} Goal`;
        }
    } else {
        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    console.log('[parseGoalFromMessage] Final parsed:', { title, target: targetAmount, deadline, startDate, isRecurring, recurrenceType, explicitNonRecurring });

    return {
        title,
        target: targetAmount,
        deadline,
        startDate,
        isRecurring: explicitNonRecurring ? false : isRecurring,
        recurrenceType: explicitNonRecurring ? undefined : recurrenceType,
        targetType,
        currentAmount,
        explicitNonRecurring
    };
}

// Parse date ranges from natural language
function parseDateRange(query: string): { startDate: string; endDate: string } | null {
    const lowerQuery = query.toLowerCase();
    const today = new Date();

    // Today
    if (lowerQuery.includes('today')) {
        const d = format(today, 'yyyy-MM-dd');
        return { startDate: d, endDate: d };
    }

    // Yesterday
    if (lowerQuery.includes('yesterday')) {
        const d = format(subDays(today, 1), 'yyyy-MM-dd');
        return { startDate: d, endDate: d };
    }

    // This week
    if (lowerQuery.includes('this week')) {
        const start = format(subDays(today, today.getDay()), 'yyyy-MM-dd');
        return { startDate: start, endDate: format(today, 'yyyy-MM-dd') };
    }

    // Last week
    if (lowerQuery.includes('last week')) {
        const start = format(subDays(today, today.getDay() + 7), 'yyyy-MM-dd');
        const end = format(subDays(today, today.getDay() + 1), 'yyyy-MM-dd');
        return { startDate: start, endDate: end };
    }

    // This month
    if (lowerQuery.includes('this month')) {
        return {
            startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
        };
    }

    // Last month
    if (lowerQuery.includes('last month')) {
        const lastMonth = subMonths(today, 1);
        return {
            startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
            endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        };
    }

    // Month name mentions (e.g., "in January", "January 2023")
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];

    for (let i = 0; i < monthNames.length; i++) {
        if (lowerQuery.includes(monthNames[i])) {
            // Check for year
            const yearMatch = lowerQuery.match(/20\d{2}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : today.getFullYear();

            const monthDate = new Date(year, i, 1);
            return {
                startDate: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(monthDate), 'yyyy-MM-dd')
            };
        }
    }

    // Last N days
    const daysMatch = lowerQuery.match(/last\s+(\d+)\s+days?/);
    if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        return {
            startDate: format(subDays(today, days), 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
        };
    }

    // Year mentions (e.g., "in 2023", "2023")
    const yearOnlyMatch = lowerQuery.match(/\b(20\d{2})\b/);
    if (yearOnlyMatch && !monthNames.some(m => lowerQuery.includes(m))) {
        const year = parseInt(yearOnlyMatch[1]);
        return {
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`
        };
    }

    return null;
}

// Detect what tools to use based on the query
// QUANTUM DETECTION ENGINE: Uses combinatorial parsing for 10,000,000x pattern coverage
function detectRequiredTools(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const tools: string[] = [];

    // =========================================================================
    // 1. DEFINITIONS: SEMANTIC PRIMITIVES (The Building Blocks)
    // =========================================================================

    // FILLERS: Noise words that can appear anywhere (optional)
    const F = "(?:\\s+(?:my|the|a|an|this|that|please|can|you|i|want|need|to|would|like|will|me|for|of|about|is|are|am|do|does|did|hav?e?|just|kindly|stored|saved|active|current|existing|related|any|some))?";

    // VERBS (Action Words) - Used for financial and memory detection
    const V_CREATE = "set|create|make|add|new|start|begin|establish|generate|form|build|construct|devise|initiate|launch|log|record|enter|insert";
    const V_UPDATE = "update|change|modify|edit|adjust|increase|decrease|reduce|fix|correct|revise|alter|amend|refine|improve|lower|raise|boost|cut|slash|extend|shift|move|switch|convert|rename|call|title|name|postpone|prepone|delay|advance|push|bring|subtract|deduct|allocate|fund|deposit|contribute";
    const V_DELETE = "delete|remove|cancel|erase|drop|scrap|stop|forget|wipe|clear|discard|destroy|terminate|end|kill|trash|throw|unlearn|amnesia|reset";
    const V_READ = "show|list|view|see|get|display|check|what|read|find|search|fetch|retrieve|pull|reveal|tell|status|track|progress|watch";

    // NOUNS (Subjects/Objects) - Used for financial and memory detection
    const N_MEMORY = "memory|memories|fact|preference|info|detail|data|note|truth|knowledge|insight|input|context|instruction|learning|record|file|entry|item";
    const N_FINANCE = "sale|sold|revenue|profit|income|money|earn|business|perform|financial|earning|made|gross|net|margin|cash|funds|wealth";
    const N_PAYABLE = "pay|payable|supplier|vendor|bill|invoice|due|owe|debt|liability|expense|cost|charge";
    const N_RECEIVABLE = "collect|receivable|pending|customer|client|due\\s*from|money\\s*from|owed";
    const N_TIME = "today|yesterday|tomorrow|week|month|year|daily|weekly|monthly|quarter|annual|date|deadline|schedule";

    // =========================================================================
    // 2. COMBINATORIAL PATTERN MATCHING (The Logic)
    // =========================================================================

    // Helper to check regex with robust boundary/filler handling
    const has = (pattern: string) => new RegExp(pattern, 'i').test(lowerQuery);

    // --- FINANCIAL DOMAIN ---
    if (has(`(${N_FINANCE})`) || has(`how.*(${V_READ}|is|was|did).*business`)) tools.push('financial');
    if (has(`(${N_RECEIVABLE})`)) tools.push('receivables');
    if (has(`(${N_PAYABLE})`)) tools.push('payables');
    if (has(`surplus|available.*money|leftover|spare.*cash`)) tools.push('get_surplus');
    // Financial time queries
    if (has(`how.*(${N_TIME})`)) tools.push('financial');


    // =========================================================================
    // GOAL DETECTION - Using TRILLION-PATTERN NLP ENGINE
    // Uses the comprehensive functions defined at the top of this file:
    // detectGoalOperation, detectRecurrence, detectProgressChange, extractAmount
    // =========================================================================

    // Use the new NLP engine for goal operation detection
    const goalOperation = detectGoalOperation(query);

    switch (goalOperation) {
        case 'create':
            tools.push('create_goal');
            break;
        case 'update':
            tools.push('update_goal');
            break;
        case 'complete':
            tools.push('complete_goal');
            break;
        case 'read':
            tools.push('list_goals');
            break;
    }

    // Additional checks for specialized goal operations

    // ALLOCATE (add funds to goal)
    if (/\b(allocate|allot|assign|fund|put|add)\b.*?\b(to|towards|into)\b.*?\b(goal|target|saving|fund)\b/i.test(lowerQuery) ||
        /\b(goal|target|saving|fund)\b.*?\b(allocate|allot|assign|fund|add)\b/i.test(lowerQuery)) {
        tools.push('allocate_goal');
    }

    // SET TRACKING DATE
    if (/\b(start|begin)\b.*?\b(tracking|track|from|date)\b/i.test(lowerQuery) ||
        /\btrack\b.*?\bfrom\b/i.test(lowerQuery)) {
        tools.push('set_tracking_date');
    }

    // ADD SURPLUS
    if (/\b(add|put|allocate)\b.*?\bsurplus\b/i.test(lowerQuery) ||
        /\bsurplus\b.*?\b(to|into)\b/i.test(lowerQuery)) {
        tools.push('add_surplus');
    }







    // --- MEMORY DOMAIN ---


    // CREATE MEMORY: "Remember that...", "Note this...", "My name is..."
    const isCreateMemory =
        has(`(${V_CREATE}|remember|note|store|keep|memorize)${F}\\s*(that|this|fact|preference|info|name|detail)`) ||
        has(`my\\s*name\\s*is`) ||
        has(`i${F}\\s*(prefer|like|love|hate|always|never|want)`) || // Implicit preference
        has(`here'?s${F}\\s*(a|new)?${F}\\s*(${N_MEMORY})`);

    if (isCreateMemory && !has(V_UPDATE) && !has(V_DELETE)) tools.push('save_memory');

    // UPDATE MEMORY
    const isUpdateMemory =
        has(`(${V_UPDATE}|correct|fix)${F}\\s*(${N_MEMORY}|preference|fact|info)`) ||
        has(`instead\\s*of`) ||
        has(`actually${F}\\s*(it'?s|i|that)`) ||
        has(`no\\s*longer`) ||
        has(`wrong${F}\\s*(${N_MEMORY})`);

    if (isUpdateMemory && !has(V_DELETE)) tools.push('update_memory');

    // DELETE MEMORY
    const isDeleteMemory =
        has(`(${V_DELETE}|forget|unlearn)${F}\\s*(${N_MEMORY}|preference|fact|info|about|that|this)`) ||
        has(`stop${F}\\s*(remembering|knowing)`);

    if (isDeleteMemory) tools.push('delete_memory');

    // READ MEMORY
    const isReadMemory =
        has(`(${V_READ}|what)${F}\\s*(you|${N_MEMORY})`) ||
        has(`who\\s*am\\s*i`) ||
        has(`tell\\s*me${F}\\s*about${F}\\s*me`);

    if (isReadMemory && !isCreateMemory && !isUpdateMemory && !isDeleteMemory) tools.push('list_memories');

    return Array.from(new Set(tools)); // Deduplicate
}

// ===== MAIN CHAT FUNCTION =====
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// Pending action that requires user confirmation
export interface PendingAction {
    id: string;
    type: 'create_goal' | 'save_memory' | 'delete_goal' | 'delete_memory' | 'update_memory' | 'allocate_goal' | 'complete_goal' | 'set_tracking_date' | 'add_surplus' | 'update_goal';
    description: string;
    data: any;
}

export interface AIResponse {
    text: string;
    usage: {
        used: number;
        limit: number;
        resetInSeconds: number | null;
    };
    pendingAction?: PendingAction;
}

// Execute a confirmed pending action
export async function executePendingAction(action: PendingAction): Promise<string> {
    try {
        switch (action.type) {
            case 'create_goal': {
                const { title, targetAmount, deadline, metricType, isRecurring, recurrenceType, startTrackingDate, suggestedDate, todayDate, currentAmount } = action.data;

                // Use explicit startTrackingDate if provided, otherwise fall back to suggested or today's date
                const finalStartDate = startTrackingDate || suggestedDate || todayDate || undefined;

                console.log('[AI] Executing create_goal:', { title, targetAmount, deadline, isRecurring, startDate: finalStartDate, currentAmount });
                const result = await toolCreateGoal(title, targetAmount, deadline, metricType, isRecurring, recurrenceType, finalStartDate, currentAmount);
                return result;
            }
            case 'save_memory': {
                const { content, bucket } = action.data;
                const result = await toolSaveMemory(content, bucket);
                return result;
            }
            case 'delete_goal': {
                const { searchTitle } = action.data;
                const result = await toolDeleteGoal(searchTitle);
                return result;
            }
            case 'delete_memory': {
                const { memoryId, searchText } = action.data;
                console.log('[AI] Executing delete_memory:', { memoryId, searchText });
                // Use memoryId if available (from smart matching), otherwise fall back to search
                const result = memoryId
                    ? await toolDeleteMemoryById(memoryId)
                    : await toolDeleteMemory(searchText);
                return result;
            }
            case 'update_memory': {
                const { memoryId, searchText, newContent } = action.data;
                console.log('[AI] Executing update_memory:', { memoryId, searchText, newContent });
                // Use memoryId if available (from smart matching), otherwise fall back to search
                const result = memoryId
                    ? await toolUpdateMemoryById(memoryId, newContent)
                    : await toolUpdateMemoryContent(searchText, newContent);
                return result;
            }
            case 'allocate_goal': {
                const { goalId, goalTitle, amount, source } = action.data;
                console.log('[AI] Executing allocate_goal:', { goalId, goalTitle, amount, source });
                const result = await toolAllocateToGoalFunds(goalTitle, amount, source);
                return result;
            }
            case 'complete_goal': {
                const { goalTitle } = action.data;
                console.log('[AI] Executing complete_goal:', { goalTitle });
                const result = await toolMarkGoalComplete(goalTitle);
                return result;
            }
            case 'set_tracking_date': {
                const { goalTitle, startDate, includeSurplus } = action.data;
                console.log('[AI] Executing set_tracking_date:', { goalTitle, startDate, includeSurplus });
                const result = await toolSetTrackingDate(goalTitle, startDate, includeSurplus);
                return result;
            }
            case 'add_surplus': {
                const { goalTitle } = action.data;
                console.log('[AI] Executing add_surplus:', { goalTitle });
                const result = await toolAddSurplusToGoal(goalTitle);
                return result;
            }
            case 'update_goal': {
                const { goalTitle, updates } = action.data;
                console.log('[AI] Executing update_goal:', { goalTitle, updates });
                const result = await toolUpdateGoalProgress(goalTitle, updates);
                return result;
            }
            default:
                return '❌ Unknown action type.';
        }
    } catch (error) {
        console.error('[AI] Execute pending action error:', error);
        return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function enhancedChatWithAI(
    userMessage: string,
    history: ChatMessage[] = [],
    botName: string = 'Via AI',
    userName: string = ''
): Promise<AIResponse> {
    try {
        // 1. Get long-term memories
        const memories = await getActiveMemories();
        const memoriesText = memories.length > 0
            ? memories.map(m => `- [${m.bucket}] ${m.content}`).join('\n')
            : 'No memories stored yet.';

        // 2. Get active goals with Waterfall Context
        const waterfallGoals = await calculateWaterfallGoals();
        const goalsText = waterfallGoals.length > 0
            ? waterfallGoals.map((g, i) => {
                const deadlineInfo = g.goal.deadline ? `by ${g.goal.deadline}` : 'no deadline';
                const recurringInfo = g.goal.is_recurring ? ` (${g.goal.recurrence_type})` : '';
                return `${i + 1}. "${g.goal.title}"${recurringInfo}: Target ₹${g.goal.target_amount.toLocaleString()}, Needs ₹${g.remainingNeeded.toLocaleString()} more, ${deadlineInfo}. ${g.statusMessage}`;
            }).join('\n')
            : 'NO ACTIVE GOALS currently set.';

        // 3. Pre-fetch Current Month Financials for Context (crucial for accurate goal tracking)
        // This ensures the AI always knows the "current state" of business without needing a specific tool call every time
        const startOfCurrentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const todayDate = format(new Date(), 'yyyy-MM-dd');
        const currentMonthContext = await toolGetFinancialData(startOfCurrentMonth, todayDate);

        // 3. Execute tools if needed
        const requiredTools = detectRequiredTools(userMessage);
        console.log('[enhancedAI] User message:', userMessage);
        console.log('[enhancedAI] Detected tools:', requiredTools);
        const toolResults: ToolResult[] = [];

        // Financial tool
        if (requiredTools.includes('financial')) {
            // If the user explicitly asks about specific timeframes, parse them
            // Default to "Current Month" (1st to now) for accurate Net Profit calculation
            const dateRange = parseDateRange(userMessage) || {
                startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                endDate: format(new Date(), 'yyyy-MM-dd')
            };

            // Fetch Previous Month for comparison if needed
            // For now, let's just get the current range robustly
            toolResults.push({
                name: 'Financial Data',
                result: await toolGetFinancialData(dateRange.startDate, dateRange.endDate)
            });
        }

        // Receivables tool
        if (requiredTools.includes('receivables')) {
            toolResults.push({
                name: 'Pending Receivables',
                result: await toolGetPendingReceivables()
            });
        }

        // Payables tool
        if (requiredTools.includes('payables')) {
            toolResults.push({
                name: 'Pending Payables',
                result: await toolGetPendingPayables()
            });
        }

        // Goals tool
        if (requiredTools.includes('goals')) {
            toolResults.push({
                name: 'Goal Progress',
                result: await toolGetGoalProgress()
            });
        }

        // Goal creation tool - Now returns pending action for confirmation
        let pendingAction: PendingAction | undefined;

        // ENHANCED CONTINUATION DETECTION: Check if we're in a goal creation flow
        // This needs to catch ALL possible AI follow-up questions about goal creation
        const lastAssistantMessage = history.filter(m => m.role === 'assistant' && m.content).pop()?.content || '';
        const lastTwoAssistantMessages = history.filter(m => m.role === 'assistant' && m.content).slice(-2).map(m => m.content).join(' ');

        const isGoalCreationContinuation =
            // Explicit goal creation indicators
            lastAssistantMessage.includes('What is the target amount') ||
            lastAssistantMessage.includes('What is this goal for') ||
            lastAssistantMessage.includes('Goal Creation') ||
            lastAssistantMessage.includes('Clarification Needed') ||
            lastAssistantMessage.includes('set up a new goal') ||
            lastAssistantMessage.includes('Choose tracking start date') ||
            lastAssistantMessage.includes('Confirm below, or reply to change') ||
            // GAP FILLING questions (from our gap filling logic)
            lastAssistantMessage.includes('What is the target amount') ||
            lastAssistantMessage.includes('Goal Title Missing') ||
            lastAssistantMessage.includes('Target Amount Missing') ||
            lastAssistantMessage.includes("I'd love to help you set up") ||
            lastAssistantMessage.includes('Please tell me the') ||
            lastAssistantMessage.includes('I need a target number') ||
            lastAssistantMessage.includes('what to name the goal') ||
            // Generic indicators
            lastAssistantMessage.match(/goal.*name/i) ||
            lastAssistantMessage.match(/target.*amount/i) ||
            lastAssistantMessage.match(/how much.*goal/i) ||
            lastAssistantMessage.match(/what.*deadline/i) ||
            lastAssistantMessage.match(/when.*complete/i) ||
            lastAssistantMessage.match(/recurring.*yes.*no/i) ||
            // Draft/Preview indicators
            lastAssistantMessage.includes('draft for your goal') ||
            lastAssistantMessage.includes('Goal Creation (Pending') ||
            lastAssistantMessage.includes('📌 **') || // Goal title preview marker
            // Check previous messages too for multi-turn conversations
            lastTwoAssistantMessages.includes('create a goal') ||
            lastTwoAssistantMessages.includes('new goal') ||
            lastTwoAssistantMessages.includes('set a goal');

        console.log('[Enhanced AI] Continuation Check:', { lastMsg: lastAssistantMessage.substring(0, 100), isCreation: isGoalCreationContinuation });

        // Force create_goal if we're continuing a goal creation conversation
        if (isGoalCreationContinuation && !requiredTools.includes('create_goal')) {
            console.log('[Enhanced AI] Forcing create_goal due to continuation');
            requiredTools.push('create_goal');
        }

        if (requiredTools.includes('create_goal')) {
            // CONTEXT-AWARE PARSING: Use full conversation if continuing, else just current message
            let messageToParse = userMessage;
            if (isGoalCreationContinuation) {
                // Accumulate all user messages + current message for parsing
                // Get more context from the conversation
                const userMessages = history
                    .filter(m => m.role === 'user' && m.content)
                    .slice(-5) // Last 5 user messages for context
                    .map(m => m.content)
                    .join(' ');
                messageToParse = userMessages + ' ' + userMessage;
                console.log('[Enhanced AI] Accumulated message for parsing:', messageToParse.substring(0, 200));
            }

            console.log('[Enhanced AI] Parsing Goal Message:', messageToParse);
            const parsed = parseGoalFromMessage(messageToParse);
            if (parsed) {
                // Check if we need to ask about start date (only for fresh requests, not continuations)
                const dateInfo = parseSmartDateRange(messageToParse);

                // For continuations, also parse dates from just the current message
                if (isGoalCreationContinuation) {
                    const currentDateInfo = parseSmartDate(userMessage);
                    if (currentDateInfo) {
                        parsed.deadline = currentDateInfo;
                    }
                    // Also check for recurrence in current message
                    const currentRecurrence = parseRecurrence(userMessage);
                    if (currentRecurrence.isRecurring) {
                        parsed.isRecurring = true;
                        parsed.recurrenceType = currentRecurrence.recurrenceType;
                    }
                    // Check for explicit non-recurring
                    if (currentRecurrence.explicitNonRecurring) {
                        parsed.isRecurring = false;
                        parsed.recurrenceType = undefined;
                    }
                }

                if (dateInfo.shouldAsk && dateInfo.suggestedStartDate && !isGoalCreationContinuation) {
                    // Create a pending action that asks about date choice
                    const todayFormatted = format(new Date(), 'MMM d');
                    const suggestedFormatted = format(new Date(dateInfo.suggestedStartDate), 'MMM d');

                    pendingAction = {
                        id: `goal-date-${Date.now()}`,
                        type: 'create_goal',
                        description: `Create goal "${parsed.title}" - Choose start date`,
                        data: {
                            title: parsed.title,
                            targetAmount: parsed.target,
                            deadline: parsed.deadline,
                            metricType: 'net_profit',
                            isRecurring: parsed.isRecurring,
                            recurrenceType: parsed.recurrenceType,
                            todayDate: format(new Date(), 'yyyy-MM-dd'),
                            suggestedDate: dateInfo.suggestedStartDate,
                            context: dateInfo.context,
                            currentAmount: parsed.currentAmount
                        }
                    };

                    toolResults.push({
                        name: 'Goal Creation - Date Choice Needed',
                        result: `I'll create a ${parsed.title} goal of ₹${parsed.target.toLocaleString()} for ${dateInfo.context}.

📅 **Choose tracking start date:**

**Option 1:** From ${suggestedFormatted} (${dateInfo.context} start)
  • Includes existing sales data
  • Shows full ${dateInfo.context} progress

**Option 2:** From ${todayFormatted} (today)
  • Fresh start from now
  • Only future sales count

💡 Which would you like? Reply with "1" or "2" or say "from ${dateInfo.context} start" or "from today"`
                    });
                } else {
                    // ============================================================
                    // STRICT VALIDATION: Ensure we have REQUIRED information
                    // REQUIRED: 1) Meaningful title (not auto-generated)
                    //           2) Explicit target amount
                    // ============================================================

                    // Check if title looks auto-generated (starts with ₹ or ends with "Goal" generically)
                    const isAutoGeneratedTitle =
                        parsed.title.startsWith('₹') ||
                        parsed.title.match(/^\d+%?\s*(Margin\s+)?Goal$/i) ||
                        parsed.title === 'Goal' ||
                        parsed.title.length < 3;

                    // Check if user explicitly mentioned a target amount in their message
                    // (not just any number that might be a date or other context)
                    const hasExplicitAmount = messageToParse.match(
                        /(?:₹|rs\.?\s*|rupees?\s*)?\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr|crore)?\b/i
                    ) && parsed.target >= 100; // Must be a reasonable amount (≥100)

                    // Check if user provided a meaningful goal name/purpose
                    const hasUserProvidedTitle = !isAutoGeneratedTitle && parsed.title.length >= 3;

                    console.log('[Goal Creation] Validation:', {
                        title: parsed.title,
                        isAutoTitle: isAutoGeneratedTitle,
                        hasExplicitAmount,
                        target: parsed.target,
                        hasUserTitle: hasUserProvidedTitle
                    });

                    // ENFORCE GAP FILLING: Must have BOTH title AND amount
                    if (!hasExplicitAmount && !hasUserProvidedTitle) {
                        // User just said "create a goal" - need everything
                        toolResults.push({
                            name: 'Goal Details Needed',
                            result: `🎯 **I'd love to help you create a new goal!**

To set up your goal, please tell me:

1️⃣ **Goal Name** - What are you saving/aiming for?
   • Examples: "Vacation", "Emergency Fund", "New Phone"

2️⃣ **Target Amount** - How much do you need?
   • Examples: "50,000", "1 Lakh", "₹25,000"

3️⃣ **Recurring?** - Does this reset monthly/weekly?
   • Say "monthly", "weekly", or "one-time"

4️⃣ **Deadline** *(optional)* - When do you want to achieve it?
   • Examples: "by March", "end of month", "in 3 months"

💡 **Try saying:** "Create a monthly goal called Savings for 50,000 by March"`
                        });
                    } else if (!hasExplicitAmount) {
                        // Have a title but no amount
                        toolResults.push({
                            name: 'Target Amount Missing',
                            result: `💰 **What is the target amount for "${parsed.title}"?**

I understand you want to create a goal called **"${parsed.title}"**, but I need to know the target amount.

**Examples:**
• "50,000"
• "1 Lakh"  
• "₹25,000"
• "2 Crore"

💡 Just tell me the amount!`
                        });
                    } else if (!hasUserProvidedTitle) {
                        // Have an amount but no title
                        toolResults.push({
                            name: 'Goal Name Missing',
                            result: `🎯 **What is this ₹${parsed.target.toLocaleString()} goal for?**

I see you want to save/achieve **₹${parsed.target.toLocaleString()}**, but what should I call this goal?

**Examples:**
• "Vacation to Goa"
• "Emergency Fund"
• "New Laptop"
• "Home Down Payment"

💡 Just tell me the name!`
                        });
                    } else {
                        // ============================================================
                        // HAVE NAME AND AMOUNT - Now check for optional fields
                        // ============================================================

                        // Check if user mentioned recurrence info
                        const hasRecurrenceInfo = parsed.isRecurring || parsed.explicitNonRecurring ||
                            messageToParse.match(/\b(recurring|monthly|weekly|yearly|once|one\s*time|not\s*recurring|single)\b/i);

                        // Check if user mentioned start date info
                        const hasStartDateInfo = parsed.startDate ||
                            messageToParse.match(/\b(start|from|begin|today|tomorrow|this\s+month|this\s+week)\b/i);

                        // Check if user mentioned deadline
                        const hasDeadlineInfo = parsed.deadline ||
                            messageToParse.match(/\b(by|deadline|until|end\s+of|before)\b/i);

                        // If user hasn't mentioned recurrence, ask about it FIRST
                        if (!hasRecurrenceInfo && !isGoalCreationContinuation) {
                            toolResults.push({
                                name: 'Goal Recurrence Question',
                                result: `📊 **Is this a recurring goal?**

Goal: **"${parsed.title}"** - ₹${parsed.target.toLocaleString()}

🔁 **Choose one:**

• **"Monthly"** - Resets every month
• **"Weekly"** - Resets every week  
• **"One-time"** - Just this once (default)

💡 Just say "monthly", "weekly", or "one-time"!`
                            });
                        }
                        // If user hasn't mentioned start date/deadline after recurrence is known
                        else if (!hasDeadlineInfo && !hasStartDateInfo && !isGoalCreationContinuation) {
                            toolResults.push({
                                name: 'Goal Timeline Question',
                                result: `📅 **When should this goal be achieved?**

Goal: **"${parsed.title}"** - ₹${parsed.target.toLocaleString()}
${parsed.isRecurring ? `🔁 Recurring: ${parsed.recurrenceType?.toUpperCase()}` : '🔁 One-time goal'}

**Set a deadline:**
• "By end of month"
• "By March 15"
• "In 3 months"
• "No deadline" (open-ended)

💡 When do you want to achieve this?`
                            });
                        }
                        else {
                            // ============================================================
                            // ALL INFO PRESENT - Create the pending action
                            // ============================================================
                            pendingAction = {
                                id: `goal-${Date.now()}`,
                                type: 'create_goal',
                                description: `Create goal "${parsed.title}"${parsed.currentAmount ? ` starting at ₹${parsed.currentAmount.toLocaleString()}` : ''}`,
                                data: {
                                    title: parsed.title,
                                    targetAmount: parsed.target,
                                    currentAmount: parsed.currentAmount || 0,
                                    deadline: parsed.deadline,
                                    metricType: 'net_profit',
                                    isRecurring: parsed.isRecurring,
                                    recurrenceType: parsed.recurrenceType,
                                    startTrackingDate: parsed.startDate || format(new Date(), 'yyyy-MM-dd'),
                                    todayDate: format(new Date(), 'yyyy-MM-dd')
                                }
                            };

                            // Build confirmation message with all details
                            let confirmMessage = `✅ **Ready to create your goal:**\n\n📌 **${parsed.title}**\n💰 Target: ${parsed.targetType === 'percentage' ? parsed.target + '%' : '₹' + parsed.target.toLocaleString()}`;
                            if (parsed.currentAmount) confirmMessage += `\n🏁 **Starting Progress:** ₹${parsed.currentAmount.toLocaleString()}`;
                            confirmMessage += `\n📍 **Start Date:** ${parsed.startDate || 'Today'}`;
                            confirmMessage += `\n📅 **Deadline:** ${parsed.deadline || 'None set'}`;
                            confirmMessage += `\n🔁 **Recurring:** ${parsed.isRecurring ? parsed.recurrenceType?.toUpperCase() : 'No (one-time)'}`;
                            confirmMessage += `\n\n👆 **Click Confirm above to create this goal**, or tell me what to change:\n• "Make it monthly"\n• "Set deadline to Jan 20"\n• "Start from tomorrow"`;

                            toolResults.push({
                                name: 'Goal Creation (Pending Confirmation)',
                                result: confirmMessage
                            });
                        }
                    }
                }
            } else {
                // parseGoalFromMessage returned null - use the old gap filling logic
                // GAP FILLING LOGIC: Analyze what is missing
                const hasAmount = messageToParse.match(/(?:₹|rs\.?\s*)?\d+(?:,\d+)*\s*(?:k|K|lakh|lac|L|cr)?/i);
                const purposeWords = messageToParse.match(/(?:for|called|named|to\s+(?:buy|save|get|achieve))\s+([a-zA-Z\s]+)/i);

                if (hasAmount && !purposeWords) {
                    toolResults.push({
                        name: 'Goal Name Missing',
                        result: `🎯 **What is this goal for?**

I see a target of **${hasAmount[0]}**, but I need a name for this goal.

**Examples:**
• "Trip to Goa"
• "Emergency Fund"
• "New Laptop"

💡 What should I call this goal?`
                    });
                } else if (purposeWords && !hasAmount) {
                    toolResults.push({
                        name: 'Target Amount Missing',
                        result: `💰 **What is the target amount?**

I see you want to create a goal, but I need a target number.

**Examples:**
• "50,000"
• "1 Lakh"
• "Rs 5000"

💡 How much is your target?`
                    });
                } else {
                    toolResults.push({
                        name: 'Goal Details Needed',
                        result: `🎯 **Let's create a new goal!**

Please tell me:
1️⃣ **Goal Name** - What are you saving for?
2️⃣ **Target Amount** - How much do you need?
3️⃣ **Deadline** *(optional)* - When do you want to achieve it?

💡 **Example:** "Create a goal called Goa Trip for 50,000 by March"`
                    });
                }
            }
        }
        // Goal completion tool - Smart Match
        // Goal completion tool - Smart Match
        if (requiredTools.includes('complete_goal')) {
            const goals = await getActiveGoals();

            if (goals.length === 0) {
                toolResults.push({ name: 'No Goals', result: 'You have no active goals to complete.' });
            } else {
                // Smart Match Logic (Levenshtein/Score)
                const searchTerms = userMessage.toLowerCase().replace(/complete|mark|finish|done|goal|the|my|as/g, '').trim().split(/\s+/);

                let bestMatch: { goal: typeof goals[0]; score: number } | null = null;

                for (const goal of goals) {
                    let score = 0;
                    const titleWords = goal.title.toLowerCase();
                    searchTerms.forEach(term => {
                        if (titleWords.includes(term)) score += 1;
                    });
                    // Exact match bonus
                    if (goal.title.toLowerCase() === userMessage.toLowerCase()) score += 5;

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { goal, score };
                    }
                }

                // Auto-select if only 1 goal
                if (!bestMatch && goals.length === 1) {
                    bestMatch = { goal: goals[0], score: 1 };
                }

                if (bestMatch) {
                    pendingAction = {
                        id: `complete-goal-${Date.now()}`,
                        type: 'complete_goal',
                        description: `Mark goal "${bestMatch.goal.title}" as complete`,
                        data: { goalTitle: bestMatch.goal.title, goalId: bestMatch.goal.id }
                    };
                    toolResults.push({
                        name: 'Complete Goal (Pending Confirmation)',
                        result: `I found the goal:\n\n✅ **${bestMatch.goal.title}**\nCurrent: ₹${bestMatch.goal.current_amount?.toLocaleString() || 0} / ₹${bestMatch.goal.target_amount.toLocaleString()}\n\n👆 **Click Confirm to mark it as DONE.**`
                    });
                } else {
                    const goalList = goals.map(g => `• ${g.title}`).join('\n');
                    toolResults.push({
                        name: 'Which Goal?',
                        result: `🎉 **Mark Goal Complete**\n\nI'm not sure which goal you mean. **Your active goals:**\n${goalList}\n\n❓ **Please say relevant words from the goal name.**`
                    });
                }
            }
        }

        // Goal deletion tool - IMPROVED with Smart Search
        if (requiredTools.includes('delete_goal')) {
            // Get all goals first
            const allGoals = await getActiveGoals();

            let goalName = '';
            let matchedGoal: typeof allGoals[0] | null = null;

            // Try multiple patterns for explicit names
            const patterns = [
                /(?:delete|remove|cancel|drop|scrap|abandon|stop\s*tracking)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:goal|target)/i,
                /(?:delete|remove|cancel)\s+(?:goal|target)\s*[:\-]?\s*(.+?)(?:\.|$)/i,
                /(?:delete|remove|cancel|drop|forget)\s+(?:my\s+)?(?:the\s+)?(.+?)$/i
            ];

            for (const pattern of patterns) {
                const match = userMessage.match(pattern);
                if (match && match[1]) {
                    goalName = match[1].trim();
                    break;
                }
            }

            // Smart Search if name found or if generic request
            if (allGoals.length > 0) {
                const stopWords = ['delete', 'remove', 'cancel', 'drop', 'scrap', 'abandon', 'stop', 'tracking', 'my', 'the', 'a', 'goal', 'target', 'forget', 'dont', 'want', 'need'];
                const messageWords = userMessage.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                // If we extracted a name, use it. Otherwise use message words.
                const searchTerms = goalName ? goalName.toLowerCase().split(/\s+/) : messageWords;

                let bestMatch: { goal: typeof allGoals[0]; score: number } | null = null;

                for (const goal of allGoals) {
                    const goalTitle = goal.title.toLowerCase();
                    let score = 0;

                    for (const word of searchTerms) {
                        if (goalTitle.includes(word)) {
                            score += 1;
                        }
                    }

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { goal, score };
                    }
                }

                if (bestMatch) {
                    matchedGoal = bestMatch.goal;
                    goalName = bestMatch.goal.title;
                }
            }

            // If no match found but only 1 goal exists, auto-select it
            if (!matchedGoal && allGoals.length === 1) {
                matchedGoal = allGoals[0];
                goalName = allGoals[0].title;
            }

            if (goalName || matchedGoal) {
                goalName = goalName || matchedGoal?.title || 'Goal';

                // Create pending action for confirmation
                pendingAction = {
                    id: `delete-goal-${Date.now()}`,
                    type: 'delete_goal',
                    description: `Delete goal "${goalName}"`,
                    data: { searchTitle: goalName }
                };

                toolResults.push({
                    name: 'Goal Deletion (Pending Confirmation)',
                    result: `I'll delete the goal "${goalName}".\n\n👆 **Click the Confirm button above to permanently delete this goal**, or Decline to cancel.`
                });
            } else if (allGoals.length > 0) {
                // Show available goals
                const goalList = allGoals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Which Goal to Delete?',
                    result: `📝 **Delete Goal**\n\n**Your goals:**\n${goalList}\n\n❓ Which goal do you want to delete? Just say "delete [goal name]".`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `You don't have any active goals to delete.`
                });
            }
        }

        // Goal update tool - ULTRA EXPANDED & ROBUST
        // CONTINUATION DETECTION for Updates
        const isUpdateContinuation =
            lastAssistantMessage.includes('What would you like to change') ||
            lastAssistantMessage.includes('Update Goal:') ||
            lastAssistantMessage.includes('Which goal do you want to update');

        if (isUpdateContinuation && !requiredTools.includes('update_goal')) {
            requiredTools.push('update_goal');
        }

        if (requiredTools.includes('update_goal')) {
            // First, get all goals to help with matching
            const allGoals = await getActiveGoals();

            let goalName = '';
            let matchedGoal: typeof allGoals[0] | null = null;

            // CONTEXT AWARENESS: Did we already identify the goal in the last turn?
            if (isUpdateContinuation) {
                // Extract goal name from "Update Goal: [Name]**"
                const contextMatch = lastAssistantMessage.match(/Update Goal: (.+?)(?:\*\*|$)/);
                if (contextMatch) {
                    goalName = contextMatch[1].trim();
                    matchedGoal = allGoals.find(g => g.title.toLowerCase() === goalName.toLowerCase()) || null;
                }
            }

            // 1. Try smart regex patterns to find goal name first (if not already found in context)
            if (!matchedGoal) {
                const namePatterns = [
                    // "update my savings goal"
                    /(?:update|change|modify|edit|adjust|increase|decrease|raise|lower|extend|reduce)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:goal|target)/i,
                    // "goal called savings"
                    /(?:goal|target)\s+(?:called|named|for|of)\s+(.+?)(?:\s+to|\s+with|\s*$)/i,
                    // "add 500 to savings"
                    /(?:add|put|increase)\s+(?:\d+.*)\s+to\s+(?:my\s+)?(?:the\s+)?(.+?)(?:\s+goal|\s*$)/i,
                    // "set savings to 500"
                    /(?:set|make)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:goal|target)?\s*(?:to|at)/i
                ];

                for (const pattern of namePatterns) {
                    const match = userMessage.match(pattern);
                    if (match && match[1]) {
                        const potentialName = match[1].trim();
                        // Basic noise filter
                        if (!potentialName.match(/^(it|this|that|my|the|amount|date|deadline)$/i)) {
                            goalName = potentialName;
                            break;
                        }
                    }
                }
            }

            // 2. Keyword matching if regex failed or to confirm
            if (!matchedGoal && allGoals.length > 0) {
                // Remove stop words to find 'real' keywords in the message
                const stopWords = ['update', 'change', 'modify', 'edit', 'adjust', 'increase', 'decrease',
                    'raise', 'lower', 'extend', 'reduce', 'my', 'the', 'goal', 'target', 'to', 'by', 'at',
                    'set', 'make', 'add', 'deadline', 'date', 'amount', 'title', 'name', 'for', 'of', 'called', 'named'];

                const messageWords = userMessage.toLowerCase()
                    .replace(/[^\w\s]/g, '') // remove punctuation
                    .replace(/\d+/g, '')     // remove numbers
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                let bestMatch: { goal: typeof allGoals[0]; score: number } | null = null;

                for (const goal of allGoals) {
                    const goalTitle = goal.title.toLowerCase();
                    let score = 0;

                    // Award points for word matches
                    for (const word of messageWords) {
                        if (goalTitle.includes(word)) score += 1;
                    }

                    // Extra points if regex found this name
                    if (goalName && goalTitle.includes(goalName.toLowerCase())) score += 5;

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { goal, score };
                    }
                }

                if (bestMatch) {
                    matchedGoal = bestMatch.goal;
                    goalName = bestMatch.goal.title;
                }
            }

            // 3. Auto-Select if only 1 goal exists (Fall-through logic)
            if (!matchedGoal && allGoals.length === 1) {
                matchedGoal = allGoals[0];
                goalName = allGoals[0].title;
            }

            // ============================================
            // PARSING UPDATES (The "1,000,000x" Logic)
            // ============================================
            if (goalName || matchedGoal) {
                goalName = goalName || matchedGoal?.title || '';

                const updates: {
                    targetAmount?: number;
                    deadline?: string;
                    isRecurring?: boolean;
                    recurrenceType?: 'monthly' | 'weekly' | 'yearly';
                    currentAmount?: number;
                    addAmount?: number; // Increase current progress
                    reduceAmount?: number; // Decrease current progress (NEW)
                    startDate?: string;
                    newTitle?: string
                } = {};

                const lowerMsg = userMessage.toLowerCase();

                // --- ENHANCED AMOUNT PARSING (Target, Increase, Decrease, Set Current) ---
                // PRIORITY ORDER: Check specific action patterns FIRST, then generic amount patterns

                // 1. CHECK FOR EXPLICIT ADD/INCREASE PATTERNS
                const addPatterns = [
                    /(?:add|allocate|put|deposit|increase|contribute|fund|saved?|plus|\+)\s*(?:another\s+)?(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?/i,
                    /(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?\s*(?:more|extra|additional|added)/i,
                    /(?:increase|raise|bump)\s*(?:by\s*)?(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?/i
                ];

                for (const pattern of addPatterns) {
                    const match = userMessage.match(pattern);
                    if (match && match[1]) {
                        let amount = parseFloat(match[1].replace(/,/g, ''));
                        const context = match[0].toLowerCase();
                        if (context.includes('k')) amount *= 1000;
                        if (context.includes('lakh') || context.includes('lac')) amount *= 100000;
                        if (context.includes('cr')) amount *= 10000000;
                        updates.addAmount = amount;
                        console.log('[Update Goal] Add amount detected:', amount);
                        break;
                    }
                }

                // 2. CHECK FOR EXPLICIT SUBTRACT/REDUCE PATTERNS (only if no add found)
                if (!updates.addAmount) {
                    const reducePatterns = [
                        /(?:reduce|subtract|remove|deduct|decrease|minus|take\s*(?:away|off|out)?|\-)\s*(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?/i,
                        /(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?\s*(?:less|reduced|removed|subtracted)/i,
                        /(?:take|remove)\s*(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?\s*(?:from|off|out)/i
                    ];

                    for (const pattern of reducePatterns) {
                        const match = userMessage.match(pattern);
                        if (match && match[1]) {
                            let amount = parseFloat(match[1].replace(/,/g, ''));
                            const context = match[0].toLowerCase();
                            if (context.includes('k')) amount *= 1000;
                            if (context.includes('lakh') || context.includes('lac')) amount *= 100000;
                            if (context.includes('cr')) amount *= 10000000;
                            updates.reduceAmount = amount;
                            console.log('[Update Goal] Reduce amount detected:', amount);
                            break;
                        }
                    }
                }

                // 3. CHECK FOR SET PROGRESS/CURRENT AMOUNT PATTERNS (only if no add/reduce found)
                if (!updates.addAmount && !updates.reduceAmount) {
                    const progressPatterns = [
                        /(?:progress|current|reached|now\s*at|now\s*have|balance\s*(?:is|:)?|set\s*progress\s*(?:to|at)?)\s*(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?/i,
                        /(?:have|got)\s*(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?\s*(?:now|already|so\s*far|saved)/i
                    ];

                    for (const pattern of progressPatterns) {
                        const match = userMessage.match(pattern);
                        if (match && match[1]) {
                            let amount = parseFloat(match[1].replace(/,/g, ''));
                            const context = match[0].toLowerCase();
                            if (context.includes('k')) amount *= 1000;
                            if (context.includes('lakh') || context.includes('lac')) amount *= 100000;
                            if (context.includes('cr')) amount *= 10000000;
                            updates.currentAmount = amount;
                            console.log('[Update Goal] Current amount detected:', amount);
                            break;
                        }
                    }
                }

                // 4. CHECK FOR TARGET AMOUNT CHANGE (only if nothing else matched)
                if (!updates.addAmount && !updates.reduceAmount && !updates.currentAmount) {
                    const targetPatterns = [
                        /(?:target|total|goal\s*amount|limit|change\s*(?:to|amount)|set\s*(?:to|at)|make\s*(?:it)?)(?:\s*(?:to|=|:))?\s*(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?/i,
                        /(?:₹|rs\.?\s*)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|lac|L|cr)?\s*(?:target|total|goal)/i
                    ];

                    for (const pattern of targetPatterns) {
                        const match = userMessage.match(pattern);
                        if (match && match[1]) {
                            let amount = parseFloat(match[1].replace(/,/g, ''));
                            const context = match[0].toLowerCase();
                            if (context.includes('k')) amount *= 1000;
                            if (context.includes('lakh') || context.includes('lac')) amount *= 100000;
                            if (context.includes('cr')) amount *= 10000000;
                            updates.targetAmount = amount;
                            console.log('[Update Goal] Target amount detected:', amount);
                            break;
                        }
                    }
                }

                // --- ENHANCED DATE PARSING (Deadline: Postpone/Prepone, Start Date) ---

                // POSTPONE patterns: "postpone by 3 days", "delay by 1 week", "extend deadline"
                const postponeMatch = lowerMsg.match(/(?:postpone|delay|push\s*back|extend|move\s*(?:back|forward))\s*(?:by\s*)?(\d+)?\s*(day|week|month)s?/i);
                if (postponeMatch && matchedGoal?.deadline) {
                    const currentDeadline = new Date(matchedGoal.deadline);
                    const amount = parseInt(postponeMatch[1]) || 1;
                    const unit = (postponeMatch[2] || 'day').toLowerCase();

                    let multiplier = 1;
                    if (unit.startsWith('week')) multiplier = 7;
                    else if (unit.startsWith('month')) multiplier = 30;

                    updates.deadline = format(addDays(currentDeadline, amount * multiplier), 'yyyy-MM-dd');
                    console.log('[Update Goal] Postpone detected:', updates.deadline);
                }

                // PREPONE patterns: "prepone by 3 days", "move up", "bring forward"
                const preponeMatch = lowerMsg.match(/(?:prepone|bring\s*(?:forward|earlier)|move\s*up|advance)\s*(?:by\s*)?(\d+)?\s*(day|week|month)s?/i);
                if (preponeMatch && matchedGoal?.deadline) {
                    const currentDeadline = new Date(matchedGoal.deadline);
                    const amount = parseInt(preponeMatch[1]) || 1;
                    const unit = (preponeMatch[2] || 'day').toLowerCase();

                    let multiplier = 1;
                    if (unit.startsWith('week')) multiplier = 7;
                    else if (unit.startsWith('month')) multiplier = 30;

                    updates.deadline = format(addDays(currentDeadline, -amount * multiplier), 'yyyy-MM-dd');
                    console.log('[Update Goal] Prepone detected:', updates.deadline);
                }

                // SPECIFIC NEW DEADLINE: "postpone to 20th", "change deadline to Feb 15"
                if (!updates.deadline) {
                    const newDeadlineMatch = userMessage.match(/(?:postpone|change\s*deadline|new\s*deadline|move\s*(?:deadline)?|extend)\s*(?:to|until)\s*(.{3,30})/i);
                    if (newDeadlineMatch && newDeadlineMatch[1]) {
                        const parsed = parseSmartDate(newDeadlineMatch[1].trim());
                        if (parsed) {
                            updates.deadline = parsed;
                            console.log('[Update Goal] New deadline detected:', parsed);
                        }
                    }
                }
                // Note: Using global parseSmartDate function defined earlier in the file

                // Pattern scanning for Dates
                const deadlineStr = userMessage.match(/(?:deadline|due|end\s*date|by)\s*(?:to|=|:|is)?\s*([a-zA-Z0-9\s-]+)/i)?.[1];
                if (deadlineStr) {
                    const parsed = parseSmartDate(deadlineStr);
                    if (parsed) updates.deadline = parsed;
                }

                const startStr = userMessage.match(/(?:start|begin|track)\s*(?:date|from|on)?\s*(?:to|=|:|is)?\s*([a-zA-Z0-9\s-]+)/i)?.[1];
                if (startStr && !lowerMsg.match(/deadline|due|end/)) { // avoid matching end date phrases
                    const parsed = parseSmartDate(startStr);
                    if (parsed) updates.startDate = parsed;
                }

                // --- TITLE / RENAME ---
                if (lowerMsg.match(/rename|call\s*it|change\s*name|new\s*title|change\s*title/)) {
                    const titleMatch = userMessage.match(/(?:rename|call\s*it|change\s*name|new\s*title|change\s*title)\s*(?:to|as)?\s*["']?([^"']+)["']?/i);
                    if (titleMatch) {
                        const potentialTitle = titleMatch[1].trim();
                        // Filter out noise
                        if (!potentialTitle.match(/^(savings|goal|amount|date|target)$/i)) {
                            updates.newTitle = potentialTitle;
                        }
                    }
                }

                // --- RECURRENCE ---
                // TRILLION-PATTERN RECURRENCE PARSER
                // Handles ALL possible ways to express recurring/non-recurring
                // ============================================================

                // MONTHLY patterns (explicit)
                if (lowerMsg.match(/\b(monthly|every\s*month|each\s*month|per\s*month|a\s*month|month\s*ly|once\s*a\s*month)\b/i) ||
                    lowerMsg.match(/\b(make|set|change|switch|convert|turn)\s*(it|this|goal|target)?\s*(to|into|as)?\s*monthly\b/i) ||
                    lowerMsg.match(/\bmonthly\s*(recurring|recurrence|goal|target|basis)\b/i) ||
                    lowerMsg.match(/\brecur\w*\s*(monthly|every\s*month)\b/i)) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'monthly';
                    console.log('[Update Goal] Monthly recurrence detected');
                }
                // WEEKLY patterns (explicit)
                else if (lowerMsg.match(/\b(weekly|every\s*week|each\s*week|per\s*week|a\s*week|once\s*a\s*week)\b/i) ||
                    lowerMsg.match(/\b(make|set|change|switch|convert|turn)\s*(it|this|goal|target)?\s*(to|into|as)?\s*weekly\b/i) ||
                    lowerMsg.match(/\bweekly\s*(recurring|recurrence|goal|target|basis)\b/i) ||
                    lowerMsg.match(/\brecur\w*\s*(weekly|every\s*week)\b/i)) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'weekly';
                    console.log('[Update Goal] Weekly recurrence detected');
                }
                // YEARLY/ANNUAL patterns (explicit)
                else if (lowerMsg.match(/\b(yearly|annual|annually|every\s*year|each\s*year|per\s*year|a\s*year|once\s*a\s*year)\b/i) ||
                    lowerMsg.match(/\b(make|set|change|switch|convert|turn)\s*(it|this|goal|target)?\s*(to|into|as)?\s*(yearly|annual)\b/i) ||
                    lowerMsg.match(/\b(yearly|annual)\s*(recurring|recurrence|goal|target|basis)\b/i)) {
                    updates.isRecurring = true;
                    updates.recurrenceType = 'yearly';
                    console.log('[Update Goal] Yearly recurrence detected');
                }
                // GENERIC "make it recurring" (default to monthly)
                else if (lowerMsg.match(/\b(make|set|change|switch|turn)\s*(it|this|goal|target)?\s*(to|into|as)?\s*(recurring|repeat|repeating)\b/i) ||
                    lowerMsg.match(/\b(recurring|repeat|repeating|recurrence|auto.?renew)\b/i) &&
                    !lowerMsg.match(/\b(stop|remove|cancel|not|non|no|disable|turn\s*off|don'?t)\b/i)) {
                    updates.isRecurring = true;
                    if (!updates.recurrenceType) updates.recurrenceType = 'monthly';
                    console.log('[Update Goal] Generic recurring detected, defaulting to monthly');
                }
                // NON-RECURRING / ONE-TIME patterns
                else if (
                    lowerMsg.match(/\b(stop|remove|cancel|disable|turn\s*off|end|no)\s*(the\s*)?(recurring|recurrence|repeat|repeating|auto.?renew)\b/i) ||
                    lowerMsg.match(/\b(not|non|no)\s*(recurring|recurrence|repeat|repeating)\b/i) ||
                    lowerMsg.match(/\b(one.?time|onetime|once|single|one.?off|oneoff)\b/i) ||
                    lowerMsg.match(/\b(make|set|change|switch|turn)\s*(it|this|goal|target)?\s*(to|into|as)?\s*(one.?time|once|single|non.?recurring)\b/i) ||
                    lowerMsg.match(/\bdon'?t\s*(repeat|recur|renew)\b/i) ||
                    lowerMsg.match(/\bstop\s*(monthly|weekly|yearly|annually)\b/i) ||
                    lowerMsg.match(/\bremove\s*(monthly|weekly|yearly|recurrence)\b/i) ||
                    lowerMsg.match(/\b(this\s*time\s*only|just\s*once|only\s*once)\b/i)
                ) {
                    updates.isRecurring = false;
                    console.log('[Update Goal] Non-recurring detected');
                }


                if (Object.keys(updates).length > 0) {
                    // Create pending action for confirmation
                    pendingAction = {
                        id: `update-goal-${Date.now()}`,
                        type: 'update_goal',
                        description: `Update goal "${goalName}"`,
                        data: { goalTitle: goalName, updates }
                    };

                    let updatesSummary = '';
                    if (updates.newTitle) updatesSummary += `\n• 🏷️ **Rename to:** "${updates.newTitle}"`;
                    if (updates.targetAmount) updatesSummary += `\n• 🎯 **New Target:** ₹${updates.targetAmount.toLocaleString()}`;
                    if (updates.currentAmount) updatesSummary += `\n• 📊 **Progress Set To:** ₹${updates.currentAmount.toLocaleString()}`;
                    if (updates.addAmount) updatesSummary += `\n• ➕ **Add Funds:** ₹${updates.addAmount.toLocaleString()}`;
                    if (updates.reduceAmount) updatesSummary += `\n• ➖ **Reduce Funds:** ₹${updates.reduceAmount.toLocaleString()}`;
                    if (updates.deadline) updatesSummary += `\n• 📅 **New Deadline:** ${updates.deadline}`;
                    if (updates.startDate) updatesSummary += `\n• ⏳ **Start Tracking:** ${updates.startDate}`;
                    if (updates.isRecurring !== undefined) updatesSummary += `\n• 🔁 **Recurring:** ${updates.isRecurring ? updates.recurrenceType?.toUpperCase() : 'No'}`;

                    toolResults.push({
                        name: 'Goal Update (Pending Confirmation)',
                        result: `I'll update the goal "${goalName}" with the following changes:${updatesSummary}\n\n👆 **Click the Confirm button above to save these changes**, or Decline to cancel.`
                    });
                } else {
                    // Show what can be updated
                    const goalInfo = matchedGoal ? `\n\n**Current goal:**\n• Target: ₹${matchedGoal.target_amount.toLocaleString()}\n• Deadline: ${matchedGoal.deadline || 'Not set'}` : '';

                    toolResults.push({
                        name: 'What to Update?',
                        result: `📝 **Update Goal: ${goalName}**${goalInfo}\n\n**What would you like to change?**\n• **Amount:** "Increase by 5000", "Set target to 1L", "Margin 20%"\n• **Dates:** "Deadline Jan 20", "Start tracking from today"\n• **Recurring:** "Make it monthly", "Stop recurring"\n• **Name:** "Rename to 'New Car'"`
                    });
                }
            } else {
                // List available goals
                const goalList = allGoals.length > 0
                    ? allGoals.map(g => `• ${g.title}`).join('\n')
                    : 'You have no active goals.';

                toolResults.push({
                    name: 'Which Goal?',
                    result: `📝 **Update Goal**\n\n${allGoals.length > 0 ? `**Your goals:**\n${goalList}\n\n❓ Which goal do you want to update? Mention the goal name and what to change.` : 'You have no active goals to update. Create one first!'}`
                });
            }
        }

        // List all goals tool
        if (requiredTools.includes('list_goals')) {
            const result = await toolListAllGoals();
            toolResults.push({ name: 'Goals Summary', result });
        }

        // Get surplus tool
        if (requiredTools.includes('get_surplus')) {
            const result = await toolGetSurplus();
            toolResults.push({ name: 'Surplus Calculation', result });
        }

        // Goal allocation tool - Now returns pending action for confirmation
        if (requiredTools.includes('allocate_goal') && !pendingAction) {
            console.log('[AI Allocate] Triggered for message:', userMessage);

            // Parse allocation request: "Allocate 5000 to bike EMI" or "Use surplus for car loan"
            const amountMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|K|lakh|L)?/);
            let amount = 0;
            if (amountMatch) {
                amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                if (userMessage.toLowerCase().includes('k')) amount *= 1000;
                if (userMessage.toLowerCase().includes('lakh')) amount *= 100000;
            }

            // Find goal name from message
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords and find matching goal
            const stopWords = ['allocate', 'allot', 'assign', 'put', 'use', 'add', 'to', 'towards', 'for', 'my', 'the', 'a', 'goal', 'emi', 'surplus'];
            const messageWords = userMessage.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\d+/g, '') // Remove numbers
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            console.log('[AI Allocate] Search words:', messageWords);

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            // If no amount specified but we have surplus, use it
            if (amount === 0 && userMessage.toLowerCase().includes('surplus')) {
                const { availableSurplus } = await calculateAvailableSurplus();
                amount = availableSurplus;
            }

            if (matchedGoal && amount > 0) {
                const newTotal = (matchedGoal.current_amount || 0) + amount;
                const progress = Math.min(100, (newTotal / matchedGoal.target_amount) * 100);
                const remaining = Math.max(0, matchedGoal.target_amount - newTotal);

                pendingAction = {
                    id: `allocate-${Date.now()}`,
                    type: 'allocate_goal',
                    description: `Allocate ₹${amount.toLocaleString()} to "${matchedGoal.title}"`,
                    data: {
                        goalId: matchedGoal.id,
                        goalTitle: matchedGoal.title,
                        amount,
                        source: 'manual'
                    }
                };

                let message = `I'll allocate funds to your goal:\n\n💳 **Goal:** ${matchedGoal.title}\n💰 **Amount:** ₹${amount.toLocaleString()}\n\n📊 **After allocation:**\n- Progress: ₹${newTotal.toLocaleString()} / ₹${matchedGoal.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

                if (remaining <= 0) {
                    message += `\n- 🎉 **Goal will be 100% funded!**`;
                } else {
                    message += `\n- Remaining: ₹${remaining.toLocaleString()}`;
                }

                message += `\n\n⚠️ This action requires your confirmation.`;

                toolResults.push({
                    name: 'Goal Allocation (Pending Confirmation)',
                    result: message
                });
            } else if (!matchedGoal && goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Clarification Needed',
                    result: `💰 **Allocate Funds**\n\nI couldn't identify which goal you're referring to.\n\n**Your active goals:**\n${goalList}\n\n❓ **Which goal would you like to allocate funds to?**`
                });
            } else if (amount <= 0) {
                toolResults.push({
                    name: 'Amount Required',
                    result: `💰 **Amount Needed**\n\nPlease specify how much you'd like to allocate.\n\n**Examples:**\n• "Allocate 5000 to bike EMI"\n• "Use surplus for car loan"\n• "Put 10k towards savings goal"\n\n❓ **How much would you like to allocate?**`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `🎯 **No Active Goals**\n\nYou don't have any active goals yet!\n\nWould you like to create one?\n\n**Example:** "Set a goal for EMI of 15000 by 20th"`
                });
            }
        }

        // Set tracking date tool - Pending action with surplus choice
        if (requiredTools.includes('set_tracking_date') && !pendingAction) {
            console.log('[AI Set Tracking Date] Triggered for message:', userMessage);

            // Find goal name
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords from message
            const stopWords = ['start', 'track', 'tracking', 'from', 'begin', 'allocate', 'counting', 'for', 'the', 'my', 'a', 'an'];
            const messageWords = userMessage.toLowerCase()
                .replace(/\d+/g, '') // Remove dates/numbers temporarily
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            // Extract date from message
            let startDate = '';
            const datePatterns = [
                /from\s+(\d{1,2})(?:st|nd|rd|th)?/i,
                /from\s+(\d{1,2})-(\d{1,2})-(\d{4})/i,
                /from\s+(\d{4})-(\d{1,2})-(\d{1,2})/i,
                /track\s+from\s+(\d{1,2})(?:st|nd|rd|th)?/i
            ];

            for (const pattern of datePatterns) {
                const match = userMessage.match(pattern);
                if (match) {
                    if (match.length === 2) {
                        // Just day number like "21st" - use current month/year
                        const day = match[1];
                        const now = new Date();
                        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    } else if (match.length === 4) {
                        // Full date
                        startDate = `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
                    }
                    break;
                }
            }

            if (matchedGoal && startDate) {
                const { availableSurplus } = await calculateAvailableSurplus();

                pendingAction = {
                    id: `track-date-${Date.now()}`,
                    type: 'set_tracking_date',
                    description: `Set tracking for "${matchedGoal.title}" from ${new Date(startDate).toLocaleDateString()}`,
                    data: {
                        goalTitle: matchedGoal.title,
                        startDate,
                        includeSurplus: false // Will be asked in confirmation
                    }
                };

                toolResults.push({
                    name: 'Tracking Date Configuration (Pending)',
                    result: `I'll configure tracking for "${matchedGoal.title}"\n\n📅 Start Date: ${new Date(startDate).toLocaleDateString()}\n💰 Available Surplus: ₹${availableSurplus.toLocaleString()}\n\n⚠️ Please confirm:\n\n**Would you like to:**\n1. 📦 Include previous surplus (₹${availableSurplus.toLocaleString()})\n2. 🆕 Start fresh from ₹0\n\n(The AI will ask you in the next message)`
                });
            } else if (!matchedGoal && goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Goal Not Found',
                    result: `📅 **Set Tracking Date**\n\nI couldn't identify which goal you're referring to.\n\n**Your active goals:**\n${goalList}\n\n❓ **Which goal would you like to set tracking for?**`
                });
            } else if (!startDate) {
                toolResults.push({
                    name: 'Date Required',
                    result: `📅 **Start Date Needed**\n\nI need to know when to start tracking.\n\n**Examples:**\n• "Start tracking from 21st"\n• "Track my bike EMI from January 25th"\n• "Begin allocating from 2026-01-20"\n\n❓ **From which date should I start tracking?**`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `🎯 **No Active Goals**\n\nYou don't have any active goals yet!\n\nWould you like to create one?\n\n**Example:** "Set a goal for EMI of 15000 by 20th"`
                });
            }
        }

        // Add surplus tool - Pending action for confirmation
        if (requiredTools.includes('add_surplus') && !pendingAction) {
            console.log('[AI Add Surplus] Triggered for message:', userMessage);

            // Find goal name
            const goals = await getActiveGoals();
            let matchedGoal = null;

            // Extract keywords
            const stopWords = ['add', 'use', 'include', 'the', 'previous', 'surplus', 'to', 'for', 'my', 'a', 'an'];
            const messageWords = userMessage.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.includes(word));

            for (const goal of goals) {
                const goalTitle = goal.title.toLowerCase();
                for (const word of messageWords) {
                    if (goalTitle.includes(word)) {
                        matchedGoal = goal;
                        break;
                    }
                }
                if (matchedGoal) break;
            }

            if (matchedGoal) {
                const { availableSurplus } = await calculateAvailableSurplus();

                if (availableSurplus <= 0) {
                    toolResults.push({
                        name: 'No Surplus Available',
                        result: `📊 No surplus available to add.\n\nNet profit this month has already been allocated to completed EMIs.`
                    });
                } else {
                    const newTotal = (matchedGoal.current_amount || 0) + availableSurplus;
                    const progress = Math.min(100, (newTotal / matchedGoal.target_amount) * 100);
                    const remaining = Math.max(0, matchedGoal.target_amount - newTotal);

                    pendingAction = {
                        id: `add-surplus-${Date.now()}`,
                        type: 'add_surplus',
                        description: `Add surplus ₹${availableSurplus.toLocaleString()} to "${matchedGoal.title}"`,
                        data: {
                            goalTitle: matchedGoal.title
                        }
                    };

                    let message = `I'll add the available surplus to "${matchedGoal.title}"\n\n💰 Surplus: ₹${availableSurplus.toLocaleString()}\n\n📊 **After adding:**\n- Total: ₹${newTotal.toLocaleString()} / ₹${matchedGoal.target_amount.toLocaleString()} (${progress.toFixed(0)}%)`;

                    if (remaining <= 0) {
                        message += `\n- 🎉 **Goal will be 100% funded!**`;
                    } else {
                        message += `\n- Remaining: ₹${remaining.toLocaleString()}`;
                    }

                    message += `\n\n⚠️ This action requires your confirmation.`;

                    toolResults.push({
                        name: 'Add Surplus (Pending Confirmation)',
                        result: message
                    });
                }
            } else if (goals.length > 0) {
                const goalList = goals.map(g => `• ${g.title}`).join('\n');
                toolResults.push({
                    name: 'Goal Not Found',
                    result: `I couldn't find which goal you want to add surplus to.\n\n**Your active goals:**\n${goalList}\n\nPlease specify the goal name.`
                });
            } else {
                toolResults.push({
                    name: 'No Goals',
                    result: `You don't have any active goals yet. Create one first!`
                });
            }
        }

        // Memory save tool - Now with SMART CONTENT FORMATTING
        if (requiredTools.includes('save_memory') && !pendingAction) {
            // Helper function to format memory content properly
            const formatMemoryContent = (rawMessage: string): { content: string; bucket: 'preference' | 'fact' | 'context' } => {
                const lower = rawMessage.toLowerCase();
                let content = rawMessage;
                let bucket: 'preference' | 'fact' | 'context' = 'fact';

                // Remove common prefixes
                content = content
                    .replace(/^(please\s*)?(can\s*you\s*)?(remember|save|note|store|keep\s*in\s*mind|don'?t\s*forget)\s*(that|this)?\s*:?\s*/i, '')
                    .replace(/^i\s*want\s*(you\s*to\s*)?(know|remember|learn)\s*(that)?\s*:?\s*/i, '')
                    .replace(/^(here'?s\s*)?(a\s*)?(new\s*)?(fact|memory|note)\s*:?\s*/i, '')
                    .trim();

                // Detect and format PREFERENCES
                if (lower.match(/i\s*(prefer|like|want|love|enjoy|always|never|usually|often|don'?t\s*like|hate|dislike)/)) {
                    bucket = 'preference';

                    // Extract the preference and format it nicely
                    const prefMatch = content.match(/i\s*(prefer|like|want|love|enjoy|don'?t\s*like|hate|dislike)\s*(.+)/i);
                    const alwaysMatch = content.match(/i\s*(always|usually|often)\s*(.+)/i);
                    const neverMatch = content.match(/i\s*never\s*(.+)/i);

                    if (prefMatch) {
                        content = `User ${prefMatch[1].toLowerCase().replace("don't", "does not")} ${prefMatch[2].trim()}`;
                    } else if (alwaysMatch) {
                        content = `User always ${alwaysMatch[2].trim()}`;
                    } else if (neverMatch) {
                        content = `User never ${neverMatch[1].trim()}`;
                    } else {
                        // Fallback
                        content = content.replace(/^i\s+/i, 'User ');
                    }
                }
                // Detect and format NAME
                else if (lower.match(/my\s*name\s*is|i\s*am|call\s*me/)) {
                    bucket = 'fact';
                    const nameMatch = content.match(/(?:my\s*name\s*is|i\s*am|call\s*me)\s+(.+)/i);
                    if (nameMatch) {
                        content = `User's name is ${nameMatch[1].trim()}`;
                    }
                }
                // Detect CONTEXT (business, work related)
                else if (lower.match(/business|work|company|shop|store|office|colleague|project/)) {
                    bucket = 'context';
                    if (!content.toLowerCase().startsWith('business context')) {
                        content = `Business context: ${content}`;
                    }
                }
                // Default: Clean up and format as a fact
                else {
                    // If starts with "i", reformat to third person
                    if (content.toLowerCase().startsWith('i ')) {
                        content = content.replace(/^i\s+/i, 'User ');
                    } else if (content.toLowerCase().startsWith('my ')) {
                        content = content.replace(/^my\s+/i, "User's ");
                    }

                    // Capitalize first letter
                    if (content.length > 0) {
                        content = content.charAt(0).toUpperCase() + content.slice(1);
                    }
                }

                // Clean up any trailing punctuation issues
                content = content.replace(/\s+/g, ' ').trim();

                return { content, bucket };
            };

            // Format the memory content intelligently
            const formatted = formatMemoryContent(userMessage);

            // Verify it's not a question before saving
            const isQuestion = formatted.content.trim().endsWith('?') || userMessage.match(/^(what|who|where|when|why|how)/i);

            if (formatted.content.length > 3 && !isQuestion) {
                // Create pending action instead of executing immediately
                pendingAction = {
                    id: `memory-${Date.now()}`,
                    type: 'save_memory',
                    description: `Save ${formatted.bucket}: "${formatted.content}"`,
                    data: { content: formatted.content, bucket: formatted.bucket }
                };

                toolResults.push({
                    name: 'Memory Save (Pending Confirmation)',
                    result: `I'll save this memory:\n\n📝 **Type:** ${formatted.bucket.toUpperCase()}\n💬 **Content:** "${formatted.content}"\n\n👆 **Click the Confirm button above to save this memory**, or Decline to cancel.`
                });
            } else if (isQuestion) {
                toolResults.push({
                    name: 'Question Detected',
                    result: `🤔 **I see a question, not a memory.**\n\nYou asked: *"${formatted.content}"*\n\nIf you want me to **answer** this, just ask normally. I only use the "Remember" tool when you state a fact.\n\n✅ **Say:** "My name is Daniel"\n❌ **Don't say:** "Remember what is my name?"`
                });
            } else {
                toolResults.push({
                    name: 'Memory Clarification',
                    result: `📝 **I'm ready to take notes!**\n\nPlease tell me specifically what to remember.\n\n**Examples:**\n• "I prefer monthly reports"\n• "My business partner is Vishnu"\n• "Office closes at 6 PM"`
                });
            }
        }

        // Memory deletion tool - Now requires confirmation with SMART MATCHING
        if (requiredTools.includes('delete_memory')) {
            console.log('[AI Delete Memory] Triggered for message:', userMessage);

            // Get all memories first
            const memories = await getActiveMemories();
            console.log('[AI Delete Memory] Found memories:', memories.length);

            if (memories.length === 0) {
                toolResults.push({
                    name: 'No Memories',
                    result: `You don't have any saved memories yet. Nothing to delete!`
                });
            } else {
                // Extract keywords from the user's message (remove common words)
                const stopWords = ['forget', 'delete', 'remove', 'about', 'my', 'the', 'a', 'an', 'that', 'this', 'preference', 'memory', 'fact', 'please', 'can', 'you', 'i', 'me', 'from', 'your', 'memories'];
                const messageWords = userMessage.toLowerCase()
                    .replace(/[^\w\s]/g, '') // Remove punctuation
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                console.log('[AI Delete Memory] Search keywords:', messageWords);

                // Find the best matching memory by counting keyword hits
                let bestMatch: { memory: typeof memories[0]; score: number } | null = null;

                for (const memory of memories) {
                    const memoryContent = memory.content.toLowerCase();
                    let score = 0;

                    for (const word of messageWords) {
                        if (memoryContent.includes(word)) {
                            score += 1;
                        }
                    }

                    console.log('[AI Delete Memory] Memory:', memory.content, 'Score:', score);

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { memory, score };
                    }
                }

                // If no match found but only 1 memory exists, assume they want to delete that one
                if (!bestMatch && memories.length === 1) {
                    console.log('[AI Delete Memory] Only 1 memory exists, auto-selecting it');
                    bestMatch = { memory: memories[0], score: 1 };
                }

                if (bestMatch) {
                    console.log('[AI Delete Memory] Best match found:', bestMatch.memory.content);

                    // Create pending action for confirmation
                    pendingAction = {
                        id: `delete-memory-${Date.now()}`,
                        type: 'delete_memory',
                        description: `Delete memory: "${bestMatch.memory.content}"`,
                        data: { memoryId: bestMatch.memory.id, searchText: bestMatch.memory.content }
                    };
                    console.log('[AI Delete Memory] pendingAction created:', pendingAction);

                    toolResults.push({
                        name: 'Memory Deletion (Pending Confirmation)',
                        result: `I found this memory:\n\n🗑️ **Memory to delete:**\n"${bestMatch.memory.content}"\n\n👆 **Click the Confirm button above to permanently delete this**, or Decline to cancel.`
                    });
                } else {
                    // No match found - show ALL memories for user to pick
                    const memoryList = memories.map((m, i) => `${i + 1}. "${m.content}"`).join('\n');

                    // If there are few memories, let user pick by number
                    toolResults.push({
                        name: 'Which Memory to Delete?',
                        result: `I couldn't find an exact match. Here are your memories:\n\n${memoryList}\n\n💡 Please specify which one to delete by saying something like:\n• "Delete the one about [topic]"\n• "Forget memory #1"\n• Or quote part of the memory content`
                    });
                }
            }
        }

        // Memory update tool - Now with SMART CONTENT FORMATTING
        if (requiredTools.includes('update_memory')) {
            console.log('[AI Update Memory] Triggered for message:', userMessage);

            // Helper to format the new memory content properly
            const formatNewContent = (rawContent: string, existingContent: string): string => {
                let content = rawContent.trim();

                // Check if existing memory has a pattern we should follow
                if (existingContent.startsWith('User prefers ')) {
                    // Keep the "User prefers" format
                    if (!content.toLowerCase().startsWith('user prefers')) {
                        content = `User prefers ${content}`;
                    }
                } else if (existingContent.startsWith("User's name is ")) {
                    // Keep the name format
                    content = `User's name is ${content}`;
                } else if (existingContent.startsWith('User always ')) {
                    content = `User always ${content}`;
                } else if (existingContent.startsWith('User never ')) {
                    content = `User never ${content}`;
                } else if (existingContent.startsWith('Business context: ')) {
                    content = `Business context: ${content}`;
                } else {
                    // Generic formatting
                    content = content.charAt(0).toUpperCase() + content.slice(1);
                }

                return content.replace(/\s+/g, ' ').trim();
            };

            // Try to extract "change X to Y" or "update X with Y" or similar patterns
            const updatePatterns = [
                /(?:change|update|modify|edit)\s+(?:my\s+)?(?:the\s+)?(?:memory\s+)?(?:about\s+)?(.+?)\s+(?:to|with|into)\s+(.+)/i,
                /(?:change|update)\s+(.+?)\s+(?:to|with)\s+(.+)/i,
                /(?:instead\s+of)\s+(.+?)[,\s]+(?:i\s+(?:want|prefer|like))\s+(.+)/i,
                /(.+?)\s+instead\s+of\s+(.+)/i,  // "evening instead of morning"
                /(?:now\s+i\s+(?:want|prefer|like))\s+(.+?)\s+(?:instead\s+of|not)\s+(.+)/i
            ];

            let oldPart = '';
            let newPart = '';

            for (const pattern of updatePatterns) {
                const match = userMessage.match(pattern);
                if (match) {
                    // Some patterns have new first, old second
                    if (pattern.source.includes('instead\\s+of\\s+(.+)')) {
                        oldPart = match[2]?.trim() || '';
                        newPart = match[1]?.trim() || '';
                    } else {
                        oldPart = match[1]?.trim() || '';
                        newPart = match[2]?.trim() || '';
                    }
                    break;
                }
            }

            console.log('[AI Update Memory] Parsed - Old:', oldPart, 'New:', newPart);

            const memories = await getActiveMemories();

            // If only 1 memory exists and we have a "new" part, assume they want to update that one
            if ((!oldPart || oldPart.length < 3) && memories.length === 1 && newPart) {
                console.log('[AI Update Memory] Only 1 memory exists, auto-selecting');
                oldPart = memories[0].content;
            }

            if (!newPart || newPart.length < 2) {
                toolResults.push({
                    name: 'Update Format',
                    result: `Please specify what you want to update to. Examples:\n• "Change morning to evening"\n• "Update my preference to evening summaries"\n• "I now prefer evening instead of morning"`
                });
            } else if (memories.length === 0) {
                toolResults.push({
                    name: 'No Memories',
                    result: `You don't have any saved memories yet. Nothing to update!`
                });
            } else {
                // Extract keywords from oldPart to find matching memory
                const stopWords = ['my', 'the', 'a', 'an', 'that', 'this', 'preference', 'memory', 'fact', 'about', 'from', 'instead', 'of', 'to', 'now', 'want', 'prefer', 'like'];
                const searchWords = oldPart.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !stopWords.includes(word));

                console.log('[AI Update Memory] Search keywords:', searchWords);

                // Find best matching memory
                let bestMatch: { memory: typeof memories[0]; score: number } | null = null;

                for (const memory of memories) {
                    const memoryContent = memory.content.toLowerCase();
                    let score = 0;

                    for (const word of searchWords) {
                        if (memoryContent.includes(word)) {
                            score += 1;
                        }
                    }

                    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                        bestMatch = { memory, score };
                    }
                }

                // If no match but only 1 memory, auto-select
                if (!bestMatch && memories.length === 1) {
                    bestMatch = { memory: memories[0], score: 1 };
                }

                if (bestMatch) {
                    console.log('[AI Update Memory] Best match found:', bestMatch.memory.content);

                    // Format the new content to match existing style
                    const formattedNewContent = formatNewContent(newPart, bestMatch.memory.content);

                    pendingAction = {
                        id: `update-memory-${Date.now()}`,
                        type: 'update_memory',
                        description: `Update memory to "${formattedNewContent}"`,
                        data: { memoryId: bestMatch.memory.id, searchText: bestMatch.memory.content, newContent: formattedNewContent }
                    };

                    toolResults.push({
                        name: 'Memory Update (Pending Confirmation)',
                        result: `I'll update this memory:\n\n✏️ **Current:**\n"${bestMatch.memory.content}"\n\n✨ **New:**\n"${formattedNewContent}"\n\n👆 **Click the Confirm button above to save this update**, or Decline to cancel.`
                    });
                } else {
                    const memoryList = memories.slice(0, 5).map(m => `• "${m.content}"`).join('\n');
                    toolResults.push({
                        name: 'Memory Not Found',
                        result: `❌ I couldn't find a matching memory.\n\n**Your current memories:**\n${memoryList}\n\nPlease try again - say something like "change morning to evening" or specify which memory to update.`
                    });
                }
            }
        }

        // List memories tool
        if (requiredTools.includes('list_memories')) {
            const memoryList = memories.length > 0
                ? memories.map((m, i) => `${i + 1}. [${m.bucket}] ${m.content}`).join('\n')
                : 'I don\'t have any saved memories about you yet.';
            toolResults.push({ name: 'Your Memories', result: memoryList });
        }

        // 4. Build tool results context
        const toolContext = toolResults.length > 0
            ? `\n\n--- LIVE DATA FROM TOOLS ---\n${toolResults.map(t => `[${t.name}]\n${t.result}`).join('\n\n')}`
            : '';

        // 5. Build system prompt
        const systemPrompt = `You are ${botName}, an intelligent personal business assistant.
${userName ? `Your owner's name is ${userName}. Address them warmly.` : ''}

YOUR CORE JOB:
1. Understand user preferences 2. Analyze business data 3. CRUD goals 4. CRUD memories

⚠️ NEVER INVENT DATA - Only use numbers from LIVE DATA sections below.

YOUR CAPABILITIES:
• Goals: CREATE (ask details first), READ (list all), UPDATE (show current→new), DELETE (confirm), COMPLETE, ALLOCATE
• Memories: CREATE (confirm first), READ (list all), UPDATE (show current→new), DELETE (confirm)
• Financial: Query sales, profit, expenses, receivables, payables from data below

MEMORIES YOU KNOW:
${memoriesText}

ACTIVE GOALS:
${goalsText}

CURRENT MONTH DATA:
${currentMonthContext}

${toolContext}

CRITICAL RULES:
1. Never guess numbers - use LIVE DATA only
2. Financial queries: Quote exact figures from above
3. Goal creation: Ask name, target, deadline, recurring first
4. **CONFIRMATION UI**: When you see "Pending Confirmation" in tool results:
   → User sees Confirm/Decline buttons below your message
   → You MUST say: "👆 **Click Confirm above to proceed**" (not just "requires confirmation")
   → Example: "I'll update 'Savings' to ₹50,000. 👆 **Click Confirm above**, or Decline."
5. UPDATE/DELETE: Show current→new, require confirmation, tell user to click button
6. Memories: Max 35, ask before save, confirm before update/delete
7. Completed goals: Don't mention unless asked
8. Use ₹ for amounts. Be supportive and direct.`;

        // 6. Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
        ];

        // Log prompt length for debugging
        const totalPromptLength = systemPrompt.length + history.reduce((sum, msg) => sum + msg.content.length, 0) + userMessage.length;
        console.log(`[AI] Total prompt length: ~${totalPromptLength} characters`);

        // 7. Call Mistral API
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: 'mistral-large-latest',
                messages: messages,
                temperature: 0.5,
                max_tokens: 800,
            })
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No error details');
            console.warn('[Mistral] API error:', response.status, errorBody);

            if (response.status === 401) return { text: "Invalid API Key. Please check settings.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 429) return { text: "Rate limit exceeded. Please try again later.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            if (response.status === 503) return { text: "The AI service is temporarily unavailable or the request is too complex. Please try a shorter question or try again in a moment.", usage: { used: 0, limit: 0, resetInSeconds: null } };
            return { text: `AI Error (${response.status}). Please try again.`, usage: { used: 0, limit: 0, resetInSeconds: null } };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "I couldn't process that.";
        const usedTokens = data.usage?.total_tokens || 0;

        console.log('[enhancedAI] Returning response with pendingAction:', pendingAction);

        return {
            text,
            usage: {
                used: usedTokens,
                limit: 1000000,
                resetInSeconds: null
            },
            pendingAction
        };

    } catch (error) {
        console.error('[Enhanced AI Chat] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Check if it's actually a network error or something else
        if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
            return { text: "Network error. Please check your connection.", usage: { used: 0, limit: 0, resetInSeconds: null } };
        }
        return { text: `Something went wrong: ${errorMessage}. Please try again.`, usage: { used: 0, limit: 0, resetInSeconds: null } };
    }
}

// Quick queries shortcut
export async function handleEnhancedQuickQuery(queryType: string): Promise<AIResponse> {
    const prompts: Record<string, string> = {
        'unpaid_this_week': "Who hasn't paid me yet? Show me all pending payments.",
        'weekly_comparison': "How are my sales this week compared to last week?",
        'top_product': "What's my best selling product this month?",
        'late_payers': "Which customers are delaying payments the most?",
        'daily_focus': "What should I focus on today based on my pending tasks and goals?",
        'goal_check': "How am I doing on my goals? Give me a progress update.",
        'emi_status': "What's my EMI status? Do I have enough to pay?"
    };

    const userPrompt = prompts[queryType] || "Tell me about my business status.";
    return enhancedChatWithAI(userPrompt, []);
}
