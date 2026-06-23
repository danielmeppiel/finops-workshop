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
- `session_models(session_id, model, *_tokens, nano_aiu, aiu, usd, credits, premium_requests)` — **measured/metered** per-model totals.
- `session_tools(session_id, tool_name, invocation_count, attributed_*_tokens, attributed_usd, attributed_credits, attribution_method)` — invocation counts for tools and skills; legacy proportional attribution is retained only for reference.
- `session_skill_windows(session_id, window_index, skill_name, model, window_start_time, window_end_time, window_output_tokens, denominator_output_tokens, model_session_usd, window_usd_est, window_credits_est, invocation_count)` — skill windows and modeled dollar estimates.
- `etl_metadata(key, value)`

Skills are recorded distinctly from built-in tools (e.g. `skill:<name>` vs `bash`/`view`/`edit`),
so you can rank skill usage separately.

## Dashboard JSON shape (`dashboard_data.json`)

```json
{
  "generated_at": "...",
  "method_note": "Session/model dollars are METERED; skill window_output_tokens are MEASURED; window_usd_est is MODELED by output-token apportionment of metered session cost when the measured window output fits the metered model pool; tools are ranked by usage.",
  "summary": {"session_count": 0, "usd": 0.0, "credits": 0.0, "total_tokens": 0, "tool_call_count": 0},
  "per_model": [{"model": "...", "requests": 0, "input_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "output_tokens": 0, "total_tokens": 0, "usd": 0.0, "credits": 0.0}],
  "top_sessions": [{"session_id": "...", "start_date": "YYYY-MM-DD", "models": "...", "total_tokens": 0, "aiu": null, "usd": 0.0, "credits": 0.0}],
  "top_skills": [{"skill_name": "...", "invocation_count": 0, "sessions": 0, "window_output_tokens": 0, "window_usd_est": 0.0, "window_credits_est": 0.0}],
  "top_tools":  [{"tool_name": "...",  "invocation_count": 0, "sessions": 0, "session_usd_touched": 0.0, "session_credits_touched": 0.0}],
}
```

For tools, `session_usd_touched` = `SUM(session.usd)` over the distinct sessions where that tool appeared.
It is a **metered** number (real session cost), but it is **not** cost caused by the tool.

For skills, `window_output_tokens` is measured exactly by walking the event timeline:
each `skill.invoked` window starts at the invocation timestamp and ends at the earlier
of the next `user.message` or next `skill.invoked`. Ending at the next skill keeps
skill windows non-overlapping and avoids double-counting assistant output when several
skills fire before the user can interact again.

## Canvas handoff

`dashboard.html` is self-contained (no network deps) and can be wrapped directly as a Copilot canvas,
or a live-refresh canvas can render `top_sessions`, `top_skills` and `top_tools` from `dashboard_data.json`.

## Honest limitation (read this before quoting any number)

- **Metered (trust as fact):** per-session and per-model `$`/credits/tokens, from `session.shutdown` model telemetry.
- **Measured (trust as fact):** skill/tool **invocation counts**, distinct **sessions**, per-model totals, and skill
  `window_output_tokens` from real `skill.invoked`, tool, and `assistant.message.outputTokens` events.
- **Modeled (do not call measured):** skill `window_usd_est` / `window_credits_est`. Events do **not** expose
  per-message input tokens, cache tokens, or cost. The estimate apportions each model's metered session USD by
  the skill window's share of that model's metered output-token pool. If measured window output exceeds the
  metered model output pool for a session/model, dollars are left unmodeled rather than over-allocated.
- **NOT derivable:** truthful **per-skill / per-tool dollars**. Tool events are point operations with no token spans,
  so tools stay ranked by invocation count and distinct sessions, plus `session_usd_touched` as a concentration
  signal only.

The DB still carries legacy `session_tools.attributed_*` columns (count-proportional estimate) for reference;
the dashboard no longer uses them for skill dollars. See `VALIDATION.md` for hand-checks and the attribution audit.
