# THE AGENTIC SDLC BILL — Minimalist Deck Synthesis
### FinOps for agentic coding · for AI Champions, platform leads & admins · Daniel Meppiel

**Design rules:** one idea per slide · one number or one visual · no bullets where a picture works ·
every claim is replayable from real corpus · ~9 slides for the 1h theory+demo, then the 30-min exercise.
**Build:** near-zero — each slide reuses an existing base-deck slide; only the hook number is refreshed to the
metered S3 telemetry.

---

## THE SPINE (one sentence)
> **Your agentic bill is a variance you *engineer* — not a price you *negotiate*. The lever is the loop.**

The whole session is one task, watched three ways, then turned into an operating model.

---

## ACT 1 — THE BILL IS A VARIANCE, NOT A PRICE  (≈10 min)

**Slide 1 · THE NUMBER (hook).** One task: rename 19 files, tests must pass.
```
$4.81    right-sized loop      (Sonnet · one sed call · 20 turns)
$33.79   same model, bad loop  (Sonnet · per-file loop · 105 turns · 290:1 in:out)   = 7×
$41.01   premium default       (Opus)  — and it FAILED the task (2/10)               = 8.5×
```
*Real Copilot telemetry. Replayable session IDs.* → **"It's not the token price. It's the loop."**
Reuse: `base-deck/docs/slides/s03-bill.html` (refresh numbers). Grounding: genesis PR#12 cost-reports.

**Slide 2 · THE REFRAME.** *"A variance you engineer, not a price you negotiate."*
Three levers: **model · tokens · loop** — the loop is the big one. *"The bill is a property of the design,
not the task."* Reuse: `s06` + `s07`. Grounding: handbook ch07 `#fig-bill-variance`.

---

## ACT 2 — ENGINEER THE LOOP ONCE, REUSE IT  (≈20 min, incl. Demo 1)

**Slide 3 · WHY NOT THE DEVELOPER.** *"Developers don't optimize. They reuse an optimized loop."*
Optimization lives in **artifacts, not memory.** Reuse: `s08`. Grounding: handbook ch07
`#why-this-cant-be-a-developers-job`.

> **DEMO 1 — DESIGN (genesis).** "Explore once at frontier cost → codify the cheap loop."
> Show the worked example: naive single-thread panel → fan-out, with diagram + cost projection.
> Asset (static, zero build): `…/appendix-b-genesis-worked-example.html` or
> `genesis/skills/genesis/examples/02-review-panel-architecture.md`.

**Slide 4 · THE LIFECYCLE (your infographic — ONE visual).**
EXPLORE → CODIFY → PUBLISH → CONSUME → RUN & MONITOR → DISCOVER → ↺
*"Loop engineering: explore once at frontier cost, then reuse the workflow that pays back."*
Reuse: `hero-factory.html` + handbook `#fig-loop-factory` / `#fig-workflow-lifecycle`.

---

## ACT 3 — RUN IT AS AN OPERATING MODEL  (≈25 min, incl. Demos 2 & 3)

**Slide 5 · THE MONEY (cost pools — ONE visual).** Four pools:
**Frontier R&D · Per-workflow run · Everyday prompting · Local models.**
*"Pool the spend, gate the bets. The baseline is cheap; premium is an intentional bet."*
Reuse: `s09-pools.html`. Grounding: handbook ch07 `#pool-the-spend-gate-the-bets`.

**Slide 6 · THE TOOLING (apm — ONE visual).** **PACKAGE · GOVERN · DISTRIBUTE · CONSUME.**
catalog → manifest → policy → lockfile. *"Portable by manifest. Secure by default. Governed by policy."*
Reuse: `s10-catalog.html`.

> **DEMO 2 — GOVERN (apm + catalog).** One screen: a governed, reusable workflow pinned by
> `apm.yml` + `apm.lock.yaml`, gated by policy. Asset (static): `zava-agent-config/CATALOG.md`
> → `apm.yml` → `docs/src/data/policy-snapshot.yml`. (apm not on PATH → keep static.)

> **DEMO 3 — MEASURE (your own logs). ★ the proof.** A `sessionEnd` hook reads logs already produced →
> tokens · AI Units · credits · cost-per-outcome. Real run: **$2.65 · 265 credits · 1,440 tool calls ·
> cache-read = ~97% of the bill.** *"It's already in your logs. No new SaaS."* Also visible in
> `events.jsonl → session.shutdown.data` (`totalNanoAiu`, `totalPremiumRequests`).
> Asset: `base-deck/scripts/session_cost_telemetry.py` (+ `s15-demo-catalog.html` as canned fallback).

**Slide 7 · THE LEADER'S MONDAY PLAYBOOK.** Five moves:
tier models · pool the spend · codify your top loops · publish via the catalog · meter cost-per-outcome.
*"A Center of Enablement engineers loops once; everyone else consumes proven ones.
Success = loops reused, not requests approved."* Reuse: `s18-playbook.html`.

---

## THEN — MAKE IT REAL (30-min live exercise + async lab)
- **Live (30 min):** Compressed **Review Panel / Static Agentic Workflow** —
  `zava-skills-workshop-template/docs/tracks/agentic-sdlc.md` (Part 2) + `golden-examples/review-panel/`.
- **Async (~2h):** full agentic-SDLC track (builder → panel → driver → package/CI).
- **Prereqs (the prerequisites):** champion/platform/admin role + Copilot access; `apm`, `gh`,
  `gh aw`, Node ≥20; `apm install`; `/genesis`.

---

## SHAPE AT A GLANCE
`Hook(1) → Reframe(2) → Why-not-dev(3)+DEMO1 → Lifecycle(4) → Pools(5) → Tooling(6)+DEMO2 → Meter+DEMO3 →
Playbook(7) → Exercise`  = **7 idea-slides + 3 demos.**

## NUMBER DISCIPLINE (honesty)
Lead with the **metered** story: **7× (same task, same model, loop-only) → 8.5× (premium trap, and it
fails) → 10–50× (naive fan-out)**. Treat "18×" only as the *order-of-magnitude envelope*, never as a
single metered fact. Keeps the "we metered it, we didn't model it" credibility.

## PREP CHECKLIST (~30–40 min, build almost nothing)
1. Refresh hook-slide numbers to $4.81 / $33.79 / $41.01; retitle cover for your audience. (~10)
2. Pre-validate MEASURE demo on one session id with `copilot_usage`; screen-record fallback. (~10)
3. Open static tabs: base deck · genesis worked example · `zava-agent-config/CATALOG.md`. (~5)
4. Paste prereqs into the invite; bookmark the exercise track. (~5)
