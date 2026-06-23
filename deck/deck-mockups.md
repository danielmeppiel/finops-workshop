## 0 · COVER

```text
┌────────────────────────────────────────────────────────────┐
│  AI CHAMPIONS · PLATFORM LEADS · ADMINS                    │
│                                                            │
│                                                            │
│          The Agentic SDLC Bill                             │
│                                                            │
│          FinOps for agentic coding                         │
│                                                            │
│                                                            │
│          ─────────────────────────                         │
│          Daniel Meppiel · Microsoft                        │
│                                                            │
│                                                            │
│                                                            │
│  remote workshop · 1 hour                                  │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ Today we reframe agentic coding cost as something you engineer, not something you negotiate.
reuse ▸ base-deck `cover` authored slide (retitle for your audience) · manifest `cover`

## 1 · THE NUMBER

```text
┌────────────────────────────────────────────────────────────┐
│  THE BILL                                                  │
│                                                            │
│  One task — rename 19 files, tests stay green.             │
│                                                            │
│     $ 4.81   ▏ right-sized loop       Sonnet · 1 sed       │
│     $33.79   ▏▏▏▏▏▏▏ same model,      Sonnet · per-file  7× │
│                       worse loop                           │
│     $41.01   ▏▏▏▏▏▏▏▏ premium default  Opus — FAILED       │
│                                                       8.5× │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│  It's not the token price.  It's the loop.                 │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ Same task, same model — 7× apart; the premium default cost more and lost.
reuse ▸ base-deck `s03-bill.html` (refresh numbers) · grounding: genesis PR#12 cost-reports

## 2 · THE REFRAME

```text
┌────────────────────────────────────────────────────────────┐
│  THE REFRAME                                               │
│                                                            │
│                                                            │
│          A variance you engineer,                          │
│          not a price you negotiate.                        │
│                                                            │
│                                                            │
│              model      tokens      LOOP                   │
│                ○          ○          ●●●                   │
│                                      ▲                     │
│                                      the big lever         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ The bill is a property of the design, not of the task.
reuse ▸ base-deck `s04-variance` + `s05-variables` (DECK notes `s06` + `s07`) · handbook ch07 `#fig-bill-variance`

## 3 · WHY NOT THE DEVELOPER

```text
┌────────────────────────────────────────────────────────────┐
│  WHY NOT THE DEVELOPER                                     │
│                                                            │
│                                                            │
│       Developers don't optimize.                           │
│       They reuse an optimized loop.                        │
│                                                            │
│                                                            │
│           memory fades                 artifacts ship      │
│              (   )                         ███            │
│                ✕                           ███            │
│                                            ███            │
│                                                            │
│       optimization lives in artifacts, not memory          │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ We do not ask every developer to rediscover the cheap path in the moment.
reuse ▸ base-deck `s06-not-dev-job.html` · handbook ch07 `#why-this-cant-be-a-developers-job`

## 4 · DEMO 1 · DESIGN

```text
┌────────────────────────────────────────────────────────────┐
│  DEMO 1 · DESIGN                                           │
│                                                            │
│        Explore once at frontier cost                       │
│        → codify the cheap loop                             │
│                                                            │
│                                                            │
│  naive panel                         designed panel        │
│                                                            │
│     ┌──────────────┐                 ┌───┐ ┌───┐ ┌───┐    │
│     │ one thread   │                 │ A │ │ B │ │ C │    │
│     │ reads all    │      ───▶       └─┬─┘ └─┬─┘ └─┬─┘    │
│     │ decides all  │                   └──┬──┴──┬──┘      │
│     └──────────────┘                      ┌───────┐       │
│                                           │ panel │       │
│                                           └───────┘       │
│                                                            │
│        cost projection: frontier once · cheap forever      │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ Genesis spends where learning is expensive, then turns the answer into a reusable workflow.
reuse ▸ base-deck `s14-demo-genesis` / `appendix-b-genesis-worked-example.html` · `genesis/examples/02-review-panel-architecture.md`

## 5 · THE LIFECYCLE LOOP

```text
┌────────────────────────────────────────────────────────────┐
│  THE OPERATING MODEL                                       │
│                                                            │
│                 ┌──────────────┐                          │
│            ┌───▶│   Explore    │──────┐                   │
│            │    │ frontier R&D │      ▼                   │
│            │    └──────────────┘ ┌──────────────┐         │
│  ┌──────────────┐                │   Codify     │         │
│  │ Reuse &      │   ┌────────┐   │ artifacts    │         │
│  │ Monitor      │   │  AI    │   └──────┬───────┘         │
│  │ telemetry    │   │Frontier│          │                 │
│  └──────▲───────┘   │ Team   │          ▼                 │
│         │           └────────┘   ┌──────────────┐         │
│         └────────────────────────│  Distribute  │◀────────┘│
│                                  │ catalog/APM  │          │
│                                  └──────────────┘          │
│                                                            │
│       spend to learn once  →  reuse pays back forever      │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ This is the cost-effective-loop factory: one team explores, codifies, distributes, and monitors reuse.
reuse ▸ base-deck `hero-factory.html` · handbook `#fig-loop-factory` / `#fig-workflow-lifecycle`

## 6 · THE MONEY

```text
┌────────────────────────────────────────────────────────────┐
│  THE MONEY                                                 │
│                                                            │
│          Pool the spend, gate the bets.                    │
│                                                            │
│                                                            │
│        ┌──────────────────┐ ┌──────────────────┐           │
│        │ Frontier R&D     │ │ Per-workflow run │           │
│        │ spend to learn   │ │ cost per outcome │           │
│        └──────────────────┘ └──────────────────┘           │
│                                                            │
│        ┌──────────────────┐ ┌──────────────────┐           │
│        │ Everyday prompt  │ │ Local models     │           │
│        │ generous floor   │ │ owned capacity   │           │
│        └──────────────────┘ └──────────────────┘           │
│                                                            │
│            baseline cheap · premium intentional            │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ The control follows the intent of the spend, not the seniority of the person spending it.
reuse ▸ base-deck `s09-pools.html` · handbook ch07 `#pool-the-spend-gate-the-bets`

## 7 · THE TOOLING

```text
┌────────────────────────────────────────────────────────────┐
│  THE TOOLING                                               │
│                                                            │
│                    apm                                     │
│                                                            │
│      PACKAGE  ───▶ GOVERN ───▶ DISTRIBUTE ───▶ CONSUME     │
│                                                            │
│                                                            │
│      catalog        manifest        policy       lockfile  │
│        ▒              ▒              ▒             ▒       │
│        ▒──────────────▒──────────────▒─────────────▒       │
│                                                            │
│      portable by manifest · governed by policy             │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ APM turns the optimized loop into something teams can find, trust, pin, and run unchanged.
reuse ▸ base-deck `s10-catalog.html` · reference: `zava-agent-config` APM marketplace / IDP

## 8 · DEMO 2 · GOVERN

```text
┌────────────────────────────────────────────────────────────┐
│  DEMO 2 · GOVERN                                           │
│                                                            │
│          governed reusable workflow                        │
│                                                            │
│  ┌──────────────────────┐     ┌──────────────────────┐     │
│  │ apm.yml              │     │ apm.lock.yaml        │     │
│  │ name: review-panel   │ ──▶ │ version: pinned      │     │
│  │ model: sonnet-tier   │     │ digest: signed       │     │
│  └──────────────────────┘     └──────────────────────┘     │
│                 │                         │                │
│                 └──────────┬──────────────┘                │
│                            ▼                               │
│                    ┌────────────┐                          │
│                    │  POLICY    │                          │
│                    │ allow/run  │                          │
│                    └────────────┘                          │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ The workflow is not a prompt someone remembers; it is pinned, signed, and policy-gated.
reuse ▸ base-deck `s10-catalog.html` + demo asset `zava-agent-config/CATALOG.md` → `apm.yml` → `policy-snapshot.yml`

## 9 · DEMO 3 · MEASURE

```text
┌────────────────────────────────────────────────────────────┐
│  DEMO 3 · MEASURE                                          │
│                                                            │
│              It's already in your logs.                    │
│              No new SaaS.                                  │
│                                                            │
│  sessionEnd hook                                           │
│       │                                                    │
│       ▼                                                    │
│  logs you already produce ──▶ tokens · AIU · credits · $   │
│                                                            │
│        $2.65                                               │
│        265 credits · 1,440 tool calls                      │
│                                                            │
│        cache-read bill                                     │
│        ███████████████████████████████████████░  ≈97%      │
│                                                            │
│        cost-per-outcome, from raw telemetry                │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ The meter does not just price the run; it tells you which loop behavior is creating the bill.
reuse ▸ base-deck `s15-demo-catalog.html` as canned fallback · `scripts/session_cost_telemetry.py` · `events.jsonl → session.shutdown.data`

## 10 · THE LEADER'S MONDAY PLAYBOOK

```text
┌────────────────────────────────────────────────────────────┐
│  MONDAY PLAYBOOK                                           │
│                                                            │
│                                                            │
│              ① tier models                                │
│              ② pool the spend                             │
│              ③ codify top loops                           │
│              ④ publish via catalog                        │
│              ⑤ meter cost-per-outcome                     │
│                                                            │
│                                                            │
│        Success = loops reused, not requests approved.      │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ The operating metric is reuse of proven loops, not how many exceptions a governance board approves.
reuse ▸ base-deck `s18-playbook.html` · handbook ch07 `#the-leaders-playbook`

## 11 · EXERCISE

```text
┌────────────────────────────────────────────────────────────┐
│  EXERCISE                                                  │
│                                                            │
│              30 min live                                   │
│                                                            │
│        Review Panel                                        │
│        Static Agentic Workflow                             │
│                                                            │
│        ┌────────┐   ┌────────┐   ┌────────┐                │
│        │ build  │──▶│ panel  │──▶│ driver │                │
│        └────────┘   └────────┘   └────────┘                │
│                                                            │
│              async lab · ~2h                               │
│                                                            │
│        prereqs: champion/platform/admin + Copilot          │
│        apm · gh · gh aw · Node ≥20                         │
└────────────────────────────────────────────────────────────┘
```
speaker ▸ We close by turning the operating model into one reusable static workflow you can run after the workshop.
reuse ▸ base-deck exercise track `zava-skills-workshop-template/docs/tracks/agentic-sdlc.md` + `golden-examples/review-panel/`
