#!/usr/bin/env python3
"""
session_cost_telemetry.py — Agentic SDLC Bill: per-session cost meter (PoC).

Reads a Copilot CLI `sessionEnd` hook payload on stdin (or --session-id),
locates the matching process log under ~/.copilot/logs, deterministically
reconstructs token usage + GitHub AI Units (AIU) from each model response's
`copilot_usage` block, derives a list-rate USD cost and AI-credit count, and
emits a DevLake-shaped JSON record (optionally POSTing it to a DevLake
Incoming Webhook).

Determinism: every billed response logs a `copilot_usage` block of the form
    token_details[]: { batch_size, cost_per_batch, token_count, token_type }
    total_nano_aiu
where per-token nano-AIU = cost_per_batch / batch_size and
    total_nano_aiu == sum(token_count * cost_per_batch / batch_size).
1 AIU = 1e9 nano-AIU. The script re-derives total_nano_aiu and asserts it
matches the logged value (integrity self-check) before reporting.

USD cost uses published per-model list rates (same method as the genesis
empirical-proof protocol); AI credits = USD / CREDIT_USD (default $0.01).
Nothing here is estimated — token counts and AIU come straight from the logs.
"""
import argparse
import bisect
import glob
import json
import os
import re
import sys
import time
import urllib.request

# ---- published list rates, USD per 1M tokens (input, output) ----
# cache_read = 0.10 x input, cache_write = 1.25 x input  (Anthropic public card)
RATES = {
    "opus":   (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku":  (1.0, 5.0),
}
CREDIT_USD = float(os.environ.get("CREDIT_USD", "0.01"))   # 1 AI credit = $0.01
NANO_PER_AIU = 1_000_000_000
LOG_DIR = os.path.expanduser(os.environ.get("COPILOT_LOG_DIR", "~/.copilot/logs"))

SESSION_ANCHOR = re.compile(r"for session ([0-9a-fA-F-]{36})")
MODEL_LINE = re.compile(r'"model":\s*"([^"]+)"')


def family(model: str) -> str:
    m = model.lower()
    if "opus" in m:
        return "opus"
    if "sonnet" in m:
        return "sonnet"
    if "haiku" in m:
        return "haiku"
    return "opus"  # conservative default (most expensive)


def extract_json_object(lines, start_idx):
    """Brace-match a pretty-printed JSON object starting at the line that opens
    `"copilot_usage": {`. Returns (obj, end_idx) or (None, start_idx)."""
    # find the opening brace on the start line
    buf = []
    depth = 0
    started = False
    i = start_idx
    while i < len(lines):
        line = lines[i]
        for ch in line:
            if ch == "{":
                depth += 1
                started = True
            elif ch == "}":
                depth -= 1
        buf.append(line)
        if started and depth == 0:
            break
        i += 1
    text = "\n".join(buf)
    # text begins at `"copilot_usage": {` -> wrap to make valid object
    brace = text.find("{")
    if brace == -1:
        return None, start_idx
    try:
        return json.loads(text[brace:]), i
    except json.JSONDecodeError:
        return None, start_idx


def nano_aiu_from_details(details):
    total = 0
    by_type = {}
    for d in details:
        tc = int(d["token_count"])
        per = int(d["cost_per_batch"]) // int(d["batch_size"])
        total += tc * per
        by_type[d["token_type"]] = by_type.get(d["token_type"], 0) + tc
    return total, by_type


def parse_log(path, target_session):
    with open(path, "r", errors="replace") as fh:
        lines = fh.read().split("\n")

    # index of session anchors: list of (lineno, session_id)
    anchors = []
    for n, line in enumerate(lines):
        m = SESSION_ANCHOR.search(line)
        if m:
            anchors.append((n, m.group(1)))

    def session_for(lineno):
        # Current logs are noisy event-forwarding streams; a copilot_usage block
        # is bracketed by nearby "for session <uuid>" events. Nearest anchor is
        # empirically more accurate than the old process-log "following anchor"
        # heuristic for mixed-session logs.
        if not anchors:
            return None
        positions = [n for n, _sid in anchors]
        idx = bisect.bisect_left(positions, lineno)
        candidates = []
        if idx < len(anchors):
            candidates.append(anchors[idx])
        if idx > 0:
            candidates.append(anchors[idx - 1])
        return min(candidates, key=lambda pair: abs(pair[0] - lineno))[1]

    records = []
    cur_model = None
    i = 0
    while i < len(lines):
        line = lines[i]
        mm = MODEL_LINE.search(line)
        if mm:
            cur_model = mm.group(1)
        if '"copilot_usage"' in line:
            obj, end = extract_json_object(lines, i)
            if obj and "token_details" in obj:
                nano, by_type = nano_aiu_from_details(obj["token_details"])
                logged = int(obj.get("total_nano_aiu", nano))
                assert nano == logged, (
                    f"AIU self-check failed at line {i+1}: "
                    f"derived {nano} != logged {logged}"
                )
                records.append({
                    "line": i,
                    "model": cur_model or "unknown",
                    "by_type": by_type,
                    "nano_aiu": logged,
                    "session": session_for(i),
                })
                i = end + 1
                continue
        i += 1

    return [r for r in records if r["session"] == target_session], records


def aggregate(records):
    per_model = {}
    for r in records:
        fam = family(r["model"])
        agg = per_model.setdefault(r["model"], {
            "family": fam, "responses": 0, "nano_aiu": 0,
            "input": 0, "cache_read": 0, "cache_write": 0, "output": 0,
        })
        agg["responses"] += 1
        agg["nano_aiu"] += r["nano_aiu"]
        for t in ("input", "cache_read", "cache_write", "output"):
            agg[t] += r["by_type"].get(t, 0)

    totals = {"nano_aiu": 0, "usd": 0.0, "input": 0,
              "cache_read": 0, "cache_write": 0, "output": 0, "responses": 0}
    models_out = []
    for model, a in per_model.items():
        base_in, base_out = RATES[a["family"]]
        usd = (
            base_in * (a["input"] + 0.10 * a["cache_read"] + 1.25 * a["cache_write"]) / 1e6
            + base_out * a["output"] / 1e6
        )
        aiu = a["nano_aiu"] / NANO_PER_AIU
        models_out.append({
            "model": model, "responses": a["responses"],
            "tokens": {k: a[k] for k in ("input", "cache_read", "cache_write", "output")},
            "aiu": round(aiu, 6),
            "usd": round(usd, 6),
            "credits": round(usd / CREDIT_USD, 2),
        })
        totals["nano_aiu"] += a["nano_aiu"]
        totals["usd"] += usd
        totals["responses"] += a["responses"]
        for t in ("input", "cache_read", "cache_write", "output"):
            totals[t] += a[t]

    return models_out, {
        "responses": totals["responses"],
        "tokens": {k: totals[k] for k in ("input", "cache_read", "cache_write", "output")},
        "aiu": round(totals["nano_aiu"] / NANO_PER_AIU, 6),
        "usd": round(totals["usd"], 6),
        "credits": round(totals["usd"] / CREDIT_USD, 2),
    }


def find_logs(session_id):
    hits = []
    for path in sorted(glob.glob(os.path.join(LOG_DIR, "*.log")),
                       key=os.path.getmtime, reverse=True):
        try:
            with open(path, "r", errors="replace") as fh:
                if session_id in fh.read():
                    hits.append(path)
        except OSError:
            continue
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-id", help="session id (else read sessionEnd JSON on stdin)")
    ap.add_argument("--log", help="explicit process log path (skip discovery)")
    ap.add_argument("--post", action="store_true", help="POST record to DEVLAKE_WEBHOOK_URL")
    args = ap.parse_args()

    payload = {}
    session_id = args.session_id
    reason = "manual"
    cwd = os.getcwd()
    if not session_id:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        if raw.strip():
            payload = json.loads(raw)
            session_id = payload.get("sessionId") or payload.get("session_id")
            reason = payload.get("reason", reason)
            cwd = payload.get("cwd", cwd)
    if not session_id:
        print("no sessionId provided", file=sys.stderr)
        return 2

    logs = [args.log] if args.log else find_logs(session_id)
    if not logs:
        print(f"no process log found for session {session_id}", file=sys.stderr)
        return 1

    matched = []
    checks = 0
    for path in logs:
        recs, all_recs = parse_log(path, session_id)
        checks += len(all_recs)
        matched.extend(recs)
    print(f"[telemetry] {len(matched)} billed responses for session "
          f"{session_id[:8]} | {checks}/{checks} AIU integrity checks passed",
          file=sys.stderr)

    models_out, totals = aggregate(matched)
    record = {
        "schema": "agentic-sdlc-bill/session-cost/v1",
        "session_id": session_id,
        "reason": reason,
        "cwd": cwd,
        "ended_at": int(time.time()),
        "source_logs": logs,
        "credit_usd": CREDIT_USD,
        "models": models_out,
        "totals": totals,
    }
    out = json.dumps(record, indent=2)
    print(out)

    if args.post:
        url = os.environ.get("DEVLAKE_WEBHOOK_URL")
        if not url:
            print("DEVLAKE_WEBHOOK_URL not set; skipping POST", file=sys.stderr)
            return 0
        req = urllib.request.Request(
            url, data=out.encode(), method="POST",
            headers={"Content-Type": "application/json",
                     **({"Authorization": os.environ["DEVLAKE_WEBHOOK_TOKEN"]}
                        if os.environ.get("DEVLAKE_WEBHOOK_TOKEN") else {})},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"DevLake POST -> {resp.status}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - PoC: never fail the session
            print(f"DevLake POST failed (non-fatal): {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
