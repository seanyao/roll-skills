# Prime Explorer Annex — Read-Only Deep Diagnosis

Use when Prime needs evidence-heavy investigation without polluting the main
coordination session.

## When to spawn

- Repeated or structural cycle failure (3+ angles: events, worktree, agent log).
- Gate floor mismatches (attest produced but gate says missing structured content).
- `handoff_without_tcr`, leaked commits, rescue branches, outcome vs terminal drift.

## Explorer rules

- **Read-only.** No edits to product repo, Builder worktrees, or `.roll` meta.
- **No dispatch.** Do not `loop go`, `recover`, or `repair-evidence`.
- **Evidence only.** Output: conclusion + file:line + event refs + recommended
  Prime action (recover / salvage / FIX card / owner).

## Suggested commands

```bash
rg -n "<cycle-id>" .roll/loop/events.ndjson | tail -200
git -C .roll/loop/worktrees/cycle-<id> status --short
git -C .roll/loop/worktrees/cycle-<id> diff --stat
tail -n 80 .roll/loop/cycle-logs/<cycle-id>.agent.log
nl -ba packages/... | sed -n '...'   # only when classifying harness bugs
```

## Handback to Prime

Return a short brief:

1. **Verdict** (one line)
2. **Root cause class** (runner / agent / toolchain / card scope / gate contract)
3. **Artifacts** (paths + line refs)
4. **Recommended next move** (exact `roll` command or backlog card)

Prime synthesizes for the owner; explorer does not speak to the owner directly
unless Prime delegates.
