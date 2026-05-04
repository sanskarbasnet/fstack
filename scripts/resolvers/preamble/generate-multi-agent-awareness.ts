import type { TemplateContext } from '../types';

/**
 * fstack multi-agent awareness — short reflexive nudge injected into every
 * tier ≥ 2 skill so the agent surfaces scope to the brain BEFORE structural
 * edits, not after.
 *
 * The brain hooks already log post-edit (PostToolUse → log-edit). This
 * preamble teaches the agent to ALSO declare scope pre-edit when it's
 * meaningful (multi-file refactor, edits in shared/sensitive areas).
 *
 * Skipped on tier-1 read-only skills (sync, presence, queue, etc.) where
 * there's no edit surface to declare.
 */
export function generateMultiAgentAwarenessSection(ctx: TemplateContext): string {
  return `## fstack multi-agent awareness

Before any **structural** edit (multi-file refactor, change in a shared/
sensitive area like auth/billing/db migrations, or a change that follows
a /coordinate finding), broadcast your scope so other agents see it BEFORE
the first edit fires:

\`\`\`bash
fstack-brain heartbeat --status planning --files "<comma-separated paths>"
\`\`\`

This is what the \`/touch\` skill wraps. You don't need the slash command —
just call the CLI directly when about to start such work. Cost: ~50ms.
Skip for trivial single-file edits (the existing PostToolUse hook covers
those automatically).`;
}
