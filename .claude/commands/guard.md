---
description: Run the architect-guard subagent against the current diff and report the P5–P10 verdict verbatim.
---

Invoke the `architect-guard` subagent (via the Task/Agent tool) and give it
this context: the user just ran `/guard`, asking for a P5–P10 verdict on the
current working tree vs `main`. The subagent already knows what to do — it
runs `npm run check`, reads the diff, and emits a localised verdict block.

When it returns, report its verdict block verbatim. Do not add commentary,
do not suggest fixes (the subagent already includes those when relevant), do
not summarise. The user wants to see the raw verdict.
