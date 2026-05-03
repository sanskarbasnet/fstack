---
name: resolve
preamble-tier: 4
version: 1.0.0
description: |
  Intent-aware merge. When git surfaces a conflict, /resolve pulls BOTH branches'
  intents from the brain, reads both sides of the conflict, and proposes a
  resolution with reasoning attached — not "Claude guesses," but a merge that
  knows what each side was trying to do. (fstack)
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - AskUserQuestion
triggers:
  - resolve conflict
  - merge conflict
  - help me merge
  - /resolve
---

## Why this skill exists

Stock LLM merge resolution reads two text blobs and guesses. fstack /resolve
reads two text blobs **plus** the *intents* both authors recorded when they
started their work. With intent context, the merge becomes surgical:

- "Sanskar's intent: rate limit guard, NOT touching session logic."
- "Owen's intent: extract session creation, NOT changing auth flow."
- → Conflict in `auth/login.ts` is layered, not competing. Keep Sanskar's
  guard up top, keep Owen's `createSession()` call in the middle.

This is the killer feature. It only works because both agents wrote intent
records via /intent before they started.

## When to invoke

- Auto-trigger: PreToolUse hook on `git push` already runs precheck. If the
  push fails with a conflict, immediately run /resolve.
- User says "merge conflict" / "help me merge" / "resolve this"
- You see `<<<<<<<` markers in a file you just read

## Procedure

1. **Identify the conflict.**
   ```bash
   git status                                  # what files conflict
   git diff --name-only --diff-filter=U         # list conflicting files
   ```

2. **Pull both intents from the brain.**
   ```bash
   # current branch's intent
   fstack-brain intent get
   # other agent's most-recent intent that touched the conflict files
   fstack-brain why --target <conflict-file>
   ```

3. **Read both sides of each conflict.** Use `Read` on the file. The conflict
   markers separate "ours" from "theirs."

4. **Reason aloud, in this exact shape:**
   - "YOUR BRANCH (intent: ...) — changes: ..."
   - "OTHER BRANCH (intent: ...) — changes: ..."
   - "ANALYSIS: are they layered, competing, or unrelated-but-textually-adjacent?"
   - "PROPOSED RESOLUTION:" — show a unified diff of the merge
   - Cite the intents' explicit "not touching" claims as evidence

5. **Confirm with user** via AskUserQuestion before applying. Do NOT silently
   resolve — the user owns this call.

6. **Apply with Edit/Write.** Then `git add <files>` and let the user finish
   the merge commit.

## What to never do

- Never auto-resolve without user confirmation.
- Never delete code from one side without explicit reasoning that ties to an
  intent's "not touching" or "promises" claim.
- If neither branch has an intent recorded, say so plainly and fall back to
  best-effort merge — but flag that fstack lost data quality here, and
  suggest both agents adopt /intent discipline going forward.

## Output

Reasoning + proposed diff + AskUserQuestion. Plain text, written to be read
by a human.
