# Demo 3 — Validation method

This meter was validated empirically against real local Copilot data before being used in the
workshop. This document records the **method** (not the personal numbers — those stay on the
operator's machine in the gitignored `EVIDENCE.md`).

## Constraints honored
- All writes confined to this demo directory; source logs/session-state consumed **read-only**.
- Python **stdlib only** (`json`, `sqlite3`, `unittest`) — no installs.

## What broke out-of-the-box and was fixed
1. The original script assumed `process-*.log`. Real logs are mixed (`process-*`, `github-app.*`,
   `session-<uuid>.log`, bare `<uuid>.log`) → loader now scans `*.log`.
2. Current cost data is more reliably in `session-state/<id>/events.jsonl`
   (`session.shutdown.data.modelMetrics`) than in raw process logs → ETL uses shutdown events as the
   primary source, raw `copilot_usage` blocks as fallback.
3. Mixed-session process logs contain many `for session <uuid>` forwarding lines → anchor heuristic
   hardened.

## Hand-verification (the proof)
One session is parsed by hand from its raw log/`events.jsonl`, the tokens→AIU→USD→credits math is
recomputed manually, and the result is checked against the script and the dashboard. They match.

The cost formula (list rates, per token):
```
usd = input_rate   * input_tokens
    + input_rate*0.10 * cache_read_tokens
    + input_rate*1.25 * cache_write_tokens
    + output_rate  * output_tokens         # all divided by 1e6 for per-Mtok rates
credits = usd / 0.01
AIU     = total_nano_aiu / 1e9
```

## Unit tests (`test_finops_core.py`, synthetic fixtures)
- Log discovery across all four filename patterns.
- Shutdown-event parsing prefers per-model `tokenDetails` and costs.
- Raw `copilot_usage` parsing derives `nano_aiu` and USD.
- Proportional cost attribution to invocations (tools **and** `skill:*`).

Run: `python3 -m unittest test_finops_core.py -v`

## Validation battery
The ETL is run across **all** local sessions and the DB/dashboard totals are cross-checked for
internal consistency (per-model sums = session totals = dashboard summary). Diverse sessions are
spot-checked: zero/near-zero cost, multi-model, cache-heavy, premium-request, and partial/malformed logs.

## Known limitation
Per-tool / per-skill cost is **proportional attribution** by invocation count within a session;
events do not expose per-tool token spans. Session-level numbers are exact; per-tool splits are estimates.
