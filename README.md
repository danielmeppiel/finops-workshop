# FinOps for Agentic Coding — Workshop

> **Your agentic bill is a variance you _engineer_, not a price you _negotiate_. The lever is the loop.**

Materials for the 1-hour FinOps session on controlling GitHub Copilot agentic-coding cost —
for AI Champions / platform leads / admins (remote, English).
Complements the developer-level enablement track; this session is about **cost control + the operating model**.

## What's here

| Path | What it is |
|---|---|
| `deck/deck-spec.md` | Authoritative deck synthesis — spine, 3 acts, 7 idea-slides + 3 demos, exact metered hook numbers, number discipline. |
| `deck/deck-mockups.md` | Minimalist ASCII-art mockup of every slide (one kernel idea each) — the design source for the built slides. |
| `deck/slides/` | Built slides (reuse + rebrand of a minimalist base deck). |
| `demos/demo3-meter/` | **Demo 3 — MEASURE.** Reads the Copilot session logs you already produce and derives tokens → AI Units → credits → USD, plus a sessions-by-cost / skills-by-usage dashboard. |
| `docs/research-brief.md` | Chief-researcher back-matter: grounding pointers, demo assets, exercise details. |
| `docs/workshop-plan.md` | Prep & orchestration plan with checkpoints. |
| `exercise/` | The 30-min live exercise (Review Panel / Static Agentic Workflow) + async lab pointers. |

## The session at a glance

`Hook(1) → Reframe(2) → Why-not-dev(3) + DEMO1 → Lifecycle loop(4) → Pools(5) → Tooling(6) + DEMO2 → Meter + DEMO3 → Playbook(7) → Exercise`

**The three demos**
1. **DESIGN** — `genesis` designs a cost-aware agentic workflow (explore once at frontier cost → codify the cheap loop).
2. **GOVERN** — `apm` + catalog: a governed, reusable workflow pinned by manifest + lockfile, gated by policy.
3. **MEASURE** — the meter in `demos/demo3-meter/` reads your own logs. _"It's already in your logs. No new SaaS."_

## Number discipline (honesty)
Lead with the **metered** story: **7×** (same task, same model, loop-only) → **8.5×** (premium default that also failed)
→ **10–50×** (naive fan-out). Treat "18×" only as the order-of-magnitude envelope, never as a single metered fact.

## Privacy
The meter reads your local `~/.copilot/logs` and `~/.copilot/session-state`. Generated artifacts
(`finops.db`, `dashboard_data.json`) contain **your real session costs/usage** and are **gitignored** —
they never get committed. Regenerate locally with the demo's build script.

## Credits
Built on the *Agentic SDLC Bill* corpus (handbook ch. 7), a minimalist base deck, `genesis`, `apm`,
and the `zava` agentic-SDLC workshop track.
