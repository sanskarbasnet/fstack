---
name: spec
preamble-tier: 4
version: 1.0.0
description: |
  Produce a structured spec document (docs/specs/<slug>.md) for the active
  intent — the contract /pursue will execute against. Goal, Inputs, Outputs,
  Behavior, Edge cases, Test matrix, Out of scope. Inspired by the
  Superpowers methodology (~150K stars). The missing rung between
  /office-hours and code. (fstack)
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
triggers:
  - spec
  - write a spec
  - spec it out
  - design doc
  - feature spec
---

## What this does

Reads the **active intent** for the current branch and expands it into a
structured spec document at `docs/specs/<slug>.md`. The spec becomes the
contract that `/pursue` (or you, manually) executes against.

Without a spec, the agent fills in the contract implicitly — and that's
where it builds the wrong thing perfectly. The spec is what prevents that.

## When to invoke

- After `/office-hours` produces a wedge agreement → before code starts
- Right before `/pursue` for any non-trivial feature (multi-file, branching
  logic, anything where "done" needs definition)
- When promoting a `/idea` to an active intent that's complex enough to
  warrant the structured form

Skip `/spec` for trivial features ("fix typo," "rename variable," "bump
dependency"). Use it when the spec is non-obvious.

## Procedure

### Step 1 — load context

```bash
fstack-brain intent get          # active intent for current branch
fstack-brain decide search --query "<keywords from intent title>"
```

If no active intent → propose the user run `/office-hours` or `/intent`
first. Do NOT spec a feature with no intent — the intent IS the seed.

### Step 2 — codebase scan (boil-the-lake)

Heuristic, capped at ~10 files. Same pattern as /office-hours:
- Keyword grep on the intent title
- Read top hits' structure
- Note existing abstractions you'd extend vs duplicate

### Step 3 — draft the spec sections

Produce a markdown doc with these 7 sections, in this order:

```markdown
# Spec: <feature title from intent>

**Intent:** <intent UUID short>
**Status:** draft
**Author:** <agent_id>
**Date:** YYYY-MM-DD

## Goal
One paragraph. What changes for the user when this ships? What's the metric
of success? Cite the related decision(s) by number if they constrained scope.

## Inputs
Bulleted list. For each input: name, type, source, validation rules.

## Outputs
For each output: HTTP status / return type / side effect, with body shape
when applicable. Be explicit about success AND failure outputs.

## Behavior
Numbered list of the steps the system performs end-to-end. Reference
existing code by file:function when extending.

## Edge cases
At least 5. Real ones from the codebase scan, not generic. For each: what
input triggers it, what's the expected behavior.

## Test matrix
Markdown table with columns: # | Scenario | Input | Expected. One row per
test the agent must produce. /pursue runs through this matrix as its
acceptance gate.

## Out of scope
Bulleted list. What this spec EXPLICITLY does not cover. Cite related
intents (other agent's work) or deferred decisions when relevant.
```

### Step 4 — confirm key edge cases via AskUserQuestion

After drafting, surface 2-4 questions where YOUR best guess at the spec
might diverge from the user's intent. Examples:
- "On invalid input — return 400 with field errors, or just 422 generic?"
- "Per-IP or per-user rate limit? (you said per-IP in /office-hours, confirm?)"
- "Behind a proxy — use X-Forwarded-For first hop or last hop?"

Three questions max. If you have more, you didn't /office-hours hard enough.

### Step 5 — write the file + update the intent

```bash
mkdir -p docs/specs
# write the spec
cat > docs/specs/<slug>.md <<'EOF'
...
EOF
```

Then update the active intent's body to reference the spec:
```bash
fstack-brain intent write \
  --title "<keep the existing title>" \
  --body  "<existing body>\n\n[spec: docs/specs/<slug>.md]" \
  --promises "<existing promises>" \
  --not-touching "<existing not-touching>"
```

(Re-writing replaces the active intent — preserve all original fields,
only append the spec link to body.)

### Step 6 — confirm + handoff to /pursue

Print:
```
Spec written: docs/specs/<slug>.md
Intent updated to reference it.

Next step:
  • /pursue — autonomous build against this spec
  • or: edit the spec manually if anything looks off
```

## What this skill must NOT do

- Must NOT produce a spec without an active intent. Hard-fail with "run
  /office-hours or /intent first."
- Must NOT skip the test matrix. /pursue treats the matrix as its gate.
  Empty matrix = /pursue has no completion signal.
- Must NOT duplicate /office-hours. /office-hours is brainstorming (should
  we?). /spec is execution contract (how exactly).
- Must NOT ask more than 3-4 confirmation questions. If you need more,
  the upstream brainstorm wasn't deep enough — say so and propose
  /office-hours instead of belaboring spec.
- Must NOT propose features beyond the active intent's scope. The spec
  expands the intent, doesn't redefine it.

## Output

Spec file written + intent updated + 2-line confirmation. ~5-10 min total.
