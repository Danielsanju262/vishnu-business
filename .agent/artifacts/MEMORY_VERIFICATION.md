# Memory CRUD Pattern Verification

## 1. Create Memory (Save)
**Patterns Tested:**
- "Remember that I prefer coffee"
- "Save this note"
- "My name is Daniel"
- "I hate waiting"
- "Keep in mind that business hours are 9-5"
- "Don't forget this"
- "Here's a fact: I love coding"
- "Log this info"
- "Create a memory"

**Expected Behavior:**
- Should detect `save_memory` tool.
- Should format content: "User prefers coffee", "User's name is Daniel", etc.
- Should classify into buckets: Preference, Fact, Context.

## 2. Update Memory
**Patterns Tested:**
- "Change morning to evening"
- "Update my preference"
- "From coffee to tea"
- "I actually prefer tea now"
- "No longer like Mondays"
- "That's wrong, it's actually Tuesday"
- "Switch to weekly reports"
- "Instead of red, make it blue"

**Expected Behavior:**
- Should detect `update_memory` tool.
- Should find the relevant memory using keyword matching.
- SHOULD AUTO-SELECT if only 1 memory exists.
- Should format the *new* content to match the style of the *old* content.

## 3. Delete Memory
**Patterns Tested:**
- "Forget about that"
- "Delete memory"
- "Remove the fact about coffee"
- "Stop remembering my name"
- "Erase all memories"
- "Wipe memory"
- "Get rid of this info"
- "I don't want you to know that anymore"

**Expected Behavior:**
- Should detect `delete_memory` tool.
- Should find the correct memory via keywords.
- Should ask for confirmation before deleting.

## 4. List Memories
**Patterns Tested:**
- "What do you know about me?"
- "Show my memories"
- "List all facts"
- "What have you saved?"
- "See memories"
- "Check memory"

**Expected Behavior:**
- Should list all active memories with their buckets.
