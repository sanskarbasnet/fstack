# 0004 New-skill naming: /fstack-help (namespaced) and /idea (short)

**Status:** accepted
**Authored by:** sanskar
**Date:** 2026-05-04

**Decision:**

- The help skill is named **`/fstack-help`** — namespaced.
- The wishlist skills are named **`/idea`** (write) and **`/ideas`** (list/manage) — short.

**Why:**

`/fstack-help` is namespaced because 'help' is the most likely future
collision target. Many projects ship a project-specific `/help` (gstack
itself shipped one). Putting fstack-specific help under `/fstack-help`
means fstack's help is unambiguous even when running alongside other
skill packs.

`/idea` is short because it's a high-frequency capture command —
mid-coding, when an idea surfaces, friction matters. Two extra characters
(`fstack-`) per invocation, ~10x/week, adds up. The collision risk for
'idea' is much lower than 'help' (rare project-specific clash).

**Trade-off:**

Asymmetric naming (one prefixed, one not) is mildly inconsistent. We
accept the inconsistency because the underlying logic differs: help is
collision-prone, idea isn't. A blanket policy ('always prefix' or 'never
prefix') would optimize for consistency over usability, which is
backwards.

**When to revisit:**

If `/idea` ever collides with another skill pack, rename to
`/fstack-idea` then. Until then, short wins. If users get confused that
`/fstack-help` and `/idea` look different, document the rule in the
help skill itself: 'collision-prone names are prefixed, others aren't.'