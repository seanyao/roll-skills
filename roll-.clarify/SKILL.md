---
hidden: true
name: roll-.clarify
license: MIT
description: "Load when roll-build Fly mode input is vague or underspecified and the agent must ask targeted scope questions before planning or coding."
---
# roll-.clarify

## Gotchas

- This is for scope questions before planning; use roll-.echo when the immediate need is only intent restatement.
- Stop after asking questions; do not silently proceed into design or code while uncertainty remains.

> Understand first, build second.

## Trigger

Auto-invoked by `roll-build` (Fly mode) when the user input is:
- A single vague sentence
- Missing clear boundaries (what/who/when/where)
- Contains ambiguous terms like "优化一下", "改一下", "加个东西"
- Could be interpreted in multiple ways

## When Not to Use

- Intent is already clear and actionable
- User gives a specific command with a skill trigger (e.g. `$roll-idea ...`)
- User is answering a clarification question you just asked
- The task is simple enough that misinterpretation risk is negligible
- User messy thoughts need restatement rather than questioning (use `$roll-.echo`)

## Behavior

1. **Summarize** the user's intent in 1–2 sentences.
2. **Assess complexity** (small / medium / large).
3. **Ask 3–5 targeted questions** to fill the biggest gaps. Focus on:
   - Scope: what exactly is in / out?
   - User: who is the actor?
   - Data: what changes or persists?
   - Edge cases: what could go wrong?
   - Verification: how will we know it's done?

## Output format

```
🎯 Clarified Intent: {1-2 sentences}

📏 Complexity: {small|medium|large}

❓ Open Questions:
1. {question 1}
2. {question 2}
3. {question 3}
...

➡️  Please answer the questions above and I'll proceed to planning / building.
```

## Rules

- Do **not** start coding or planning until the user replies.
- Questions must be concrete and answerable in one sentence each.
- If the input is already clear enough, silently return and let `roll-build` continue.
- Never announce "I'm using roll-.clarify."
