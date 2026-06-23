# Facilitator guide

A 1-hour FinOps session on controlling GitHub Copilot agentic-coding cost, for **AI Champions,
platform leads, and admins** (complements developer-level enablement). Minimalist, visual,
speaker-driven; near-zero build.

## Thesis
> Your agentic bill is a variance you **engineer**, not a price you **negotiate**. The lever is the loop.

One task, watched three ways, then turned into an operating model.

## Arc (≈1h theory + demos, then 30-min exercise)
`Hook → Reframe → Why-not-the-dev (+ DEMO 1) → Lifecycle loop → Cost pools → Tooling (+ DEMO 2)
→ Meter (DEMO 3) → Leader's playbook → Exercise`

See `deck/deck-spec.md` (full synthesis) and `deck/deck-mockups.md` (per-slide ASCII mockups).

## The three demos
1. **DESIGN** — use `genesis` to design a cost-aware agentic workflow: explore once at frontier cost,
   then codify the cheap, reusable loop. Show the worked example statically.
2. **GOVERN** — `apm` + a workflow catalog: a reusable workflow pinned by manifest + lockfile, gated by
   policy (`catalog → manifest → policy → lockfile`). Show statically.
3. **MEASURE** — `demos/demo3-meter/`: read the Copilot logs you already produce and surface
   tokens · AI Units · credits · cost-per-outcome, with sessions-by-cost and skills-by-usage rankings.
   *"It's already in your logs. No new SaaS."*

## Number discipline (honesty)
Lead with the **metered** hierarchy on one real task:
- **7×** — same task, **same model**, loop-only (right-sized vs. a bad per-item loop).
- **8.5×** — premium-default trap: a premium model that costs more **and** fails the task.
- **10–50×** — naive fan-out (illustrative, not a single metered cell).

Treat "18×" only as the order-of-magnitude **envelope** — never present it as a single metered fact.

## Operating model (the spine visual)
A central team runs the loop as a product: **Explore → Codify → Distribute → Reuse & Monitor**, with
**cost pools** (frontier R&D · per-workflow run · everyday prompting · local models) deciding where
spend is allowed to flow. Baseline cheap; premium is an intentional, gated bet.

## Prep checklist (~30–40 min)
1. Refresh the hook-slide numbers; retitle the cover for your audience.
2. Pre-validate the meter (DEMO 3) on one session; keep a screen-recording as fallback.
3. Open static tabs: the base deck, the genesis worked example, the workflow catalog.
4. Share the prerequisites with attendees ahead of time.

## Prerequisites for attendees
Champion/platform/admin role + Copilot access; `apm`, `gh`, `gh aw`, Node ≥ 20.

## Exercise (30 min live + async lab)
Build one **Static Agentic Workflow** (a Review Panel): `build → panel → driver`. Async self-paced lab
extends it through packaging + CI. See `exercise/`.
