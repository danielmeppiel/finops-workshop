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
- Skill window walk:
  - assistant output before the first skill in a user span remains unattributed;
  - windows end at the next `user.message` or next `skill.invoked`, whichever comes first;
  - adjacent skill windows are non-overlapping;
  - multi-model windows keep separate `(skill, model)` output-token totals;
  - missing `assistant.message.data.model` falls back to the sole metered session model when unambiguous;
  - `window_usd_est` uses the metered per-model output denominator only when measured window output fits that pool.

Run: `python3 -m unittest test_finops_core.py -v`

## Validation battery
The ETL is run across **all** local sessions and the DB/dashboard totals are cross-checked for
internal consistency (per-model sums = session totals = dashboard summary). Diverse sessions are
spot-checked: zero/near-zero cost, multi-model, cache-heavy, premium-request, and partial/malformed logs.

Current local run:

```text
python3 -m unittest test_finops_core.py -v
Ran 8 tests in 0.012s — OK

python3 build_db.py
built .../finops.db: sessions=1552 usd=105898.829730 credits=10589882.97 tool_calls=273102

python3 export_dashboard.py
wrote .../dashboard_data.json and .../dashboard.html
```

## Windowed skill attribution validation

Event schema limitation honored: `assistant.message` has per-message `outputTokens`, but no per-message
input/cache tokens and no per-message cost. Therefore:

- `window_output_tokens` is **measured** exactly from the event timeline.
- `window_usd_est` is **modeled** from metered session/model USD by output-token share.
- If measured window output exceeds the metered model output pool for a session/model, the meter leaves that
  model's window dollars at `$0` rather than exceeding the metered session pool.

Manual hand-checks used independent event walks, not `finops_core.compute_skill_windows`. Session IDs are local
telemetry IDs; exact IDs are kept out of this public method file.

| local session | skill | window | manual output by model | manual total | DB total | exact match |
|---|---|---:|---|---:|---:|---|
| A | `devx-ux` | 17 | `gpt-5-5=132150`, `claude-opus-4-6=145731`, `claude-opus-4-7=32148` | 310029 | 310029 | yes |
| B | `pr-description-skill` | 1 | `claude-sonnet-4-6=142546`, `gpt-5-5=3200`, `claude-opus-4-6=67285`, `claude-opus-4-8=55947` | 268978 | 268978 | yes |

Internal consistency on the same sessions:

| local session | assistant output sum | skill-window output sum | unattributed output | window + unattributed = assistant | metered shutdown output | assistant minus metered | `SUM(window_usd_est) <= session.usd` |
|---|---:|---:|---:|---|---:|---:|---|
| A | 955880 | 814232 | 141648 | yes | 960951 | -5071 | yes (`451.674599 <= 475.989596`) |
| B | 674227 | 408808 | 265419 | yes | 686092 | -11865 | yes (`153.849695 <= 258.556363`) |

For every persisted skill-window row in these sessions, `denominator_output_tokens` equals the corresponding
`session_models.output_tokens` value. A global DB query found `0` sessions where `SUM(window_usd_est)` exceeded
`sessions.usd`.

Dashboard shape check:

```text
keys = generated_at, method_note, summary, per_model, top_sessions, top_skills, top_tools
top_sessions[] = session_id, start_date, models, total_tokens, aiu, usd, credits
top_skills[] = skill_name, invocation_count, sessions, window_output_tokens, window_usd_est, window_credits_est
top_tools[] = tool_name, invocation_count, sessions, session_usd_touched, session_credits_touched
per_model[] = model, requests, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, total_tokens, usd, credits
```

## Known limitation (attribution audit)

Per-session and per-model `$`/credits/tokens are **metered**. Skill/tool **invocation counts**, distinct
**sessions**, and skill `window_output_tokens` are **measured**. Skill `window_usd_est` is **modeled**:
the event stream lacks per-message input/cache/cost, so the meter apportions metered session/model USD by
output-token share inside the non-overlapping skill window. Tool dollars remain **not derivable** because tool
events are point operations with no token spans; the dashboard shows `session_usd_touched` for tools only as
"metered session cost where the tool ran, not per-tool attribution."
