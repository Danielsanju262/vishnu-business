# TRILLION-PATTERN GOAL NLP SYSTEM - Architecture Plan

## Overview
Build a comprehensive Natural Language Processing system that can handle ANY natural language input for Goal operations, regardless of length, complexity, or phrasing.

## Core Principles

### 1. Semantic Decomposition
- Break sentences into semantic tokens (Action, Object, Attributes)
- Ignore filler words and noise
- Extract meaning regardless of word order

### 2. Word Stem Matching
- Match on word stems, not exact words
- "recurring" matches "recur", "recurrence", "recurred", etc.
- "monthly" matches "month", "months", "monthly", etc.

### 3. Synonym Clusters
Each concept has a cluster of synonyms that all mean the same thing:
- Goal: goal, target, objective, milestone, aim, ambition, saving, fund, budget...
- Create: create, make, set, add, new, start, begin, establish, want, need...
- Update: update, change, modify, edit, adjust, fix, revise, alter...
- Complete: complete, finish, done, achieve, accomplish, close, wrap...

### 4. Order-Independent Parsing
- "Create goal 50k vacation" = "50k vacation goal create" = "vacation goal for 50k create"
- Parse by finding semantic components anywhere in the sentence

## Operations to Support

### CREATE Goal
Fields to extract:
- **Title**: What the goal is called/for
- **Amount**: Target amount (₹50k, 1 lakh, 50000, etc.)
- **Percentage**: Alternative to amount (20%, 15 percent, etc.)
- **Start Date**: When to start tracking
- **End Date/Deadline**: When goal should be achieved
- **Recurring**: Is it monthly/weekly/yearly/one-time?
- **Initial Progress**: Any starting amount already saved

### UPDATE Goal
Fields to modify:
- **Goal Selection**: Which goal to update (fuzzy matching)
- **New Title**: Rename the goal
- **New Amount/Target**: Change target amount/percentage
- **New Start Date**: Change tracking start
- **New End Date**: Change deadline
- **Recurring Toggle**: Make recurring or non-recurring
- **Add Progress**: Add amount to current progress
- **Subtract Progress**: Remove amount from current progress
- **Set Progress**: Set current progress to specific value

### COMPLETE Goal
- **Goal Selection**: Which goal to mark complete
- Successfully achieved indicator

## Implementation Strategy

### Phase 1: Word Clusters (Synonyms + Stems)
Create comprehensive arrays of all possible words for each concept

### Phase 2: Universal Detector
Function that checks if ANY word from a cluster appears in the input

### Phase 3: Intent Classification
Determine: CREATE vs UPDATE vs COMPLETE vs READ

### Phase 4: Field Extraction
Extract each field using flexible regex patterns

### Phase 5: Gap Filling
Ask for missing required information (title, amount)

## Pattern Coverage Calculation

If we have:
- 50 action words × 
- 30 goal words × 
- 100 amount formats × 
- 50 date formats × 
- 30 recurrence words × 
- Unlimited filler combinations

= Trillions of possible valid inputs covered

## Success Criteria
- User says "create goal" → Ask for details
- User says "50k vacation by March monthly" → Understand CREATE with all fields
- User says "make my savings recurring" → Understand UPDATE recurrence
- User says "add 5000 to vacation" → Understand UPDATE add progress
- User says "done with savings" → Understand COMPLETE
