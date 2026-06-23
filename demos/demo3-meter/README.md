# Demo 3 — MEASURE your own Copilot cost

A local, **stdlib-only** FinOps meter over GitHub Copilot logs and session-state.
It derives **tokens → AI Units → credits → USD** for every session you've run, then
ranks **sessions by cost** and **skills/tools by usage** — proving the point of the
workshop: *the bill is already in your logs; you don't need a new SaaS to see it.*

> **Privacy:** this reads your **local** `~/.copilot` data and writes everything locally.
> Generated artifacts (`finops.db`, `dashboard_data.json`, `dashboard.html`, `EVIDENCE.md`)
> contain your real session costs and are **gitignored** — they never get committed or pushed.

## Run it (<2 min, no dependencies)

```bash
cd demos/demo3-meter
python3 -m unittest test_finops_core.py -v     # sanity-check the math (synthetic fixtures)
python3 build_db.py                            # build finops.db from ~/.copilot
python3 export_dashboard.py                    # emit dashboard_data.json + dashboard.html
open dashboard.html                            # or wrap it as a Copilot canvas
```

Override the data locations if needed:

```bash
COPILOT_LOG_DIR=~/.copilot/logs \
COPILOT_SESSION_STATE_DIR=~/.copilot/session-state \
python3 build_db.py
```

## Data sources

- **Primary:** `~/.copilot/session-state/<id>/events.jsonl` → `session.shutdown.data.modelMetrics`
  (most reliable; carries per-model token usage, `totalNanoAiu`, premium requests).
- **Fallback:** `~/.copilot/logs/*.log` → `copilot_usage.token_details[]` blocks (for live/no-shutdown sessions).

Real-world log filenames are mixed (`process-*`, `github-app.*`, `session-<uuid>.log`, bare `<uuid>.log`),
so the loader scans `*.log` rather than assuming a single pattern.

## What it computes

Rates (per Mtok, list): Opus 15/75 · Sonnet 3/15 · Haiku 1/5; cache-read ≈ 0.10× input, cache-write ≈ 1.25× input.
`1 AIU = 1e9 nano_aiu`; `1 credit = $0.01` (default, configurable).

## Schema (`finops.db`)

- `sessions(session_id, source, models, *_tokens, nano_aiu, aiu, usd, credits, premium_requests, tool_call_count, start_time, end_time)`
- `session_models(session_id, model, *_tokens, nano_aiu, aiu, usd, credits, premium_requests)`
- `session_tools(session_id, tool_name, invocation_count, attributed_*_tokens, attributed_usd, attributed_credits, attribution_method)`
- `etl_metadata(key, value)`

Skills are recorded distinctly from built-in tools (e.g. `skill:<name>` vs `bash`/`view`/`edit`),
so you can rank skill usage separately.

## Dashboard JSON shape (`dashboard_data.json`)

```json
{
  "generated_at": "...",
  "method_note": "Per-session $/credits/tokens are METERED; skills/tools ranked by MEASURED usage; 'session_usd_touched' is metered session cost where the skill/tool ran, NOT per-skill attribution.",
  "summary": {"session_count": 0, "usd": 0.0, "credits": 0.0, "total_tokens": 0, "tool_call_count": 0},
  "top_sessions": [{"session_id": "...", "models": "...", "total_tokens": 0, "aiu": null, "usd": 0.0, "credits": 0.0}],
  "top_tools":  [{"tool_name": "...",  "invocation_count": 0, "sessions": 0, "session_usd_touched": 0.0, "session_credits_touched": 0.0}],
  "top_skills": [{"skill_name": "...", "invocation_count": 0, "sessions": 0, "session_usd_touched": 0.0, "session_credits_touched": 0.0}],
  "metadata": {"tool_attribution_method": "..."}
}
```

`session_usd_touched` = `SUM(session.usd)` over the distinct sessions where that skill/tool appeared.
It is a **metered** number (real session cost), but it is **not** cost caused by the skill — see below.

## Canvas handoff

`dashboard.html` is self-contained (no network deps) and can be wrapped directly as a Copilot canvas,
or a live-refresh canvas can render `top_sessions`, `top_skills` and `top_tools` from `dashboard_data.json`.

## Honest limitation (read this before quoting any number)

- **Metered (trust as fact):** per-session and per-model `$`/credits/tokens, from `session.shutdown` model telemetry.
- **Measured (trust as fact):** skill/tool **invocation counts** and the **set of sessions** each ran in,
  from real `skill.invoked` / tool events.
- **NOT derivable:** truthful **per-skill / per-tool dollars**. Events expose no per-turn input/cache/cost and
  no skill completion span, so a skill invocation's true cost could be anywhere from `$0` to the whole session.
  The dashboard therefore **ranks skills/tools by usage**, and shows `session_usd_touched` (metered cost of the
  sessions they ran in) only as a "where does spend concentrate" signal — **never** as attributed per-skill cost.

The DB still carries legacy `attributed_*` columns (count-proportional estimate); the dashboard no longer
surfaces them as per-skill cost. See `VALIDATION.md` for the metered hand-check and the attribution audit.
