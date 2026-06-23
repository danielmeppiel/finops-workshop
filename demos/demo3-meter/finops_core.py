#!/usr/bin/env python3
"""Core parsers and cost math for Demo 3 Copilot FinOps telemetry."""
from __future__ import annotations

import bisect
import glob
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

RATES_USD_PER_MTOK = {
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (1.0, 5.0),
}
CREDIT_USD = float(os.environ.get("CREDIT_USD", "0.01"))
NANO_PER_AIU = 1_000_000_000
TOKEN_TYPES = ("input", "cache_read", "cache_write", "output")
SESSION_ANCHOR = re.compile(r"for session ([0-9a-fA-F-]{36})")
MODEL_LINE = re.compile(r'"model"\s*:\s*"([^"]+)"')


def family(model: str) -> str:
    text = (model or "").lower()
    if "opus" in text:
        return "opus"
    if "sonnet" in text:
        return "sonnet"
    if "haiku" in text:
        return "haiku"
    return "opus"


def canonical_model(model: str) -> str:
    model = (model or "unknown").strip()
    if model.startswith("capi:"):
        model = model.split(":", 2)[1]
    return model.replace(".", "-")


def zero_tokens() -> Dict[str, int]:
    return {k: 0 for k in TOKEN_TYPES}


def normalize_token_type(name: str) -> str:
    mapping = {
        "inputTokens": "input",
        "outputTokens": "output",
        "cacheReadTokens": "cache_read",
        "cacheWriteTokens": "cache_write",
        "input": "input",
        "output": "output",
        "cache_read": "cache_read",
        "cache_write": "cache_write",
    }
    return mapping.get(name, name)


def usd_from_tokens(model: str, tokens: Dict[str, float]) -> float:
    base_in, base_out = RATES_USD_PER_MTOK[family(model)]
    return (
        base_in * (tokens.get("input", 0) + 0.10 * tokens.get("cache_read", 0) + 1.25 * tokens.get("cache_write", 0)) / 1_000_000
        + base_out * tokens.get("output", 0) / 1_000_000
    )


def nano_aiu_from_details(details: Iterable[Dict[str, Any]]) -> Tuple[int, Dict[str, int]]:
    total = 0
    by_type = zero_tokens()
    for detail in details:
        token_count = int(detail.get("token_count", 0))
        batch_size = int(detail.get("batch_size", 1))
        cost_per_batch = int(detail.get("cost_per_batch", 0))
        per_token = cost_per_batch // batch_size
        token_type = normalize_token_type(str(detail.get("token_type", "")))
        if token_type in by_type:
            by_type[token_type] += token_count
        total += token_count * per_token
    return total, by_type


def tokens_from_token_details_map(token_details: Dict[str, Any]) -> Dict[str, int]:
    tokens = zero_tokens()
    for raw_key, raw_value in (token_details or {}).items():
        key = normalize_token_type(raw_key)
        if key not in tokens:
            continue
        if isinstance(raw_value, dict):
            value = raw_value.get("tokenCount", raw_value.get("token_count", 0))
        else:
            value = raw_value
        tokens[key] += int(value or 0)
    return tokens


def tokens_from_usage(usage: Dict[str, Any]) -> Dict[str, int]:
    tokens = zero_tokens()
    for raw_key, raw_value in (usage or {}).items():
        key = normalize_token_type(raw_key)
        if key in tokens:
            tokens[key] += int(raw_value or 0)
    return tokens


def add_tokens(a: Dict[str, int], b: Dict[str, int]) -> Dict[str, int]:
    return {k: int(a.get(k, 0)) + int(b.get(k, 0)) for k in TOKEN_TYPES}


def iso_from_millis(ms: Any) -> Optional[str]:
    if ms in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(float(ms) / 1000.0, timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


def parse_iso_timestamp(ts: Optional[str]) -> Optional[str]:
    if not ts:
        return None
    return ts


def find_logs(session_id: str, log_dir: str) -> List[str]:
    hits = []
    for path in sorted(glob.glob(os.path.join(os.path.expanduser(log_dir), "*.log")), key=os.path.getmtime, reverse=True):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                if session_id in fh.read():
                    hits.append(path)
        except OSError:
            continue
    return hits


def extract_json_object_after_key(lines: List[str], start_idx: int) -> Tuple[Optional[Dict[str, Any]], int]:
    buf: List[str] = []
    depth = 0
    started = False
    end_idx = start_idx
    for idx in range(start_idx, len(lines)):
        line = lines[idx]
        for ch in line:
            if ch == "{":
                depth += 1
                started = True
            elif ch == "}":
                depth -= 1
        buf.append(line)
        end_idx = idx
        if started and depth == 0:
            break
    text = "\n".join(buf)
    brace = text.find("{")
    if brace < 0:
        return None, start_idx
    try:
        return json.loads(text[brace:]), end_idx
    except json.JSONDecodeError:
        return None, start_idx


def session_for_line_nearest(anchors: List[Tuple[int, str]], line_no: int) -> Optional[str]:
    if not anchors:
        return None
    positions = [n for n, _sid in anchors]
    idx = bisect.bisect_left(positions, line_no)
    candidates = []
    if idx < len(anchors):
        candidates.append(anchors[idx])
    if idx > 0:
        candidates.append(anchors[idx - 1])
    return min(candidates, key=lambda pair: abs(pair[0] - line_no))[1]


def parse_copilot_usage_log(path: str, target_session: Optional[str] = None) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()
    anchors: List[Tuple[int, str]] = []
    for idx, line in enumerate(lines):
        m = SESSION_ANCHOR.search(line)
        if m:
            anchors.append((idx, m.group(1)))
    records: List[Dict[str, Any]] = []
    current_model = "unknown"
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        model_match = MODEL_LINE.search(line)
        if model_match:
            current_model = canonical_model(model_match.group(1))
        if '"copilot_usage"' in line:
            obj, end_idx = extract_json_object_after_key(lines, idx)
            if obj and "token_details" in obj:
                nano, tokens = nano_aiu_from_details(obj["token_details"])
                logged = int(obj.get("total_nano_aiu", nano))
                if nano != logged:
                    raise ValueError(f"AIU self-check failed in {path}:{idx+1}: derived {nano} != logged {logged}")
                session_id = session_for_line_nearest(anchors, idx)
                record = {
                    "line": idx + 1,
                    "session_id": session_id,
                    "model": current_model,
                    "tokens": tokens,
                    "nano_aiu": logged,
                    "source_log": path,
                }
                if target_session is None or session_id == target_session:
                    records.append(record)
                idx = end_idx + 1
                continue
        idx += 1
    return records


def session_from_log_records(session_id: str, records: List[Dict[str, Any]], source_logs: List[str]) -> Dict[str, Any]:
    per_model: Dict[str, Dict[str, Any]] = {}
    total_tokens = zero_tokens()
    total_nano = 0
    for rec in records:
        model = canonical_model(rec.get("model", "unknown"))
        model_row = per_model.setdefault(model, {"model": model, "responses": 0, "tokens": zero_tokens(), "nano_aiu": 0})
        model_row["responses"] += 1
        model_row["tokens"] = add_tokens(model_row["tokens"], rec["tokens"])
        model_row["nano_aiu"] += int(rec.get("nano_aiu") or 0)
        total_tokens = add_tokens(total_tokens, rec["tokens"])
        total_nano += int(rec.get("nano_aiu") or 0)
    models = []
    total_usd = 0.0
    for model, row in sorted(per_model.items()):
        usd = usd_from_tokens(model, row["tokens"])
        total_usd += usd
        models.append({
            "model": model,
            "responses": row["responses"],
            "tokens": row["tokens"],
            "nano_aiu": row["nano_aiu"],
            "aiu": row["nano_aiu"] / NANO_PER_AIU,
            "usd": usd,
            "credits": usd / CREDIT_USD,
        })
    return {
        "session_id": session_id,
        "source": "raw_log",
        "source_logs": source_logs,
        "models": models,
        "model_names": ", ".join(m["model"] for m in models),
        "tokens": total_tokens,
        "nano_aiu": total_nano if records else None,
        "aiu": (total_nano / NANO_PER_AIU) if records else None,
        "usd": total_usd,
        "credits": total_usd / CREDIT_USD,
        "premium_requests": None,
        "responses": sum(m["responses"] for m in models),
    }


def session_from_shutdown(session_id: str, shutdown_event: Dict[str, Any]) -> Dict[str, Any]:
    data = shutdown_event.get("data") or {}
    models = []
    total_tokens = zero_tokens()
    total_nano: Optional[int] = int(data["totalNanoAiu"]) if data.get("totalNanoAiu") is not None else None
    total_usd = 0.0
    total_responses = 0
    summed_model_nano = 0
    saw_model_nano = False
    for model_name, metrics in sorted((data.get("modelMetrics") or {}).items()):
        model = canonical_model(model_name)
        token_details = metrics.get("tokenDetails") if isinstance(metrics, dict) else None
        usage = metrics.get("usage") if isinstance(metrics, dict) else None
        tokens = tokens_from_token_details_map(token_details) if token_details else tokens_from_usage(usage or {})
        total_tokens = add_tokens(total_tokens, tokens)
        model_nano = metrics.get("totalNanoAiu") if isinstance(metrics, dict) else None
        model_nano_int = int(model_nano) if model_nano is not None else None
        if model_nano_int is not None:
            summed_model_nano += model_nano_int
            saw_model_nano = True
        usd = usd_from_tokens(model, tokens)
        total_usd += usd
        requests = metrics.get("requests", {}) if isinstance(metrics, dict) else {}
        responses = int(requests.get("count") or 0)
        total_responses += responses
        models.append({
            "model": model,
            "responses": responses,
            "tokens": tokens,
            "nano_aiu": model_nano_int,
            "aiu": (model_nano_int / NANO_PER_AIU) if model_nano_int is not None else None,
            "usd": usd,
            "credits": usd / CREDIT_USD,
            "premium_requests": requests.get("cost"),
        })
    if total_nano is None and saw_model_nano:
        total_nano = summed_model_nano
    if not models and data.get("tokenDetails"):
        model = canonical_model(data.get("currentModel", "unknown"))
        tokens = tokens_from_token_details_map(data["tokenDetails"])
        total_tokens = tokens
        total_usd = usd_from_tokens(model, tokens)
        models.append({
            "model": model,
            "responses": 0,
            "tokens": tokens,
            "nano_aiu": total_nano,
            "aiu": (total_nano / NANO_PER_AIU) if total_nano is not None else None,
            "usd": total_usd,
            "credits": total_usd / CREDIT_USD,
            "premium_requests": data.get("totalPremiumRequests"),
        })
    return {
        "session_id": session_id,
        "source": "events_shutdown",
        "source_logs": [],
        "models": models,
        "model_names": ", ".join(m["model"] for m in models),
        "tokens": total_tokens,
        "nano_aiu": total_nano,
        "aiu": (total_nano / NANO_PER_AIU) if total_nano is not None else None,
        "usd": total_usd,
        "credits": total_usd / CREDIT_USD,
        "premium_requests": data.get("totalPremiumRequests"),
        "responses": total_responses,
        "start_time": iso_from_millis(data.get("sessionStartTime")),
        "end_time": parse_iso_timestamp(shutdown_event.get("timestamp")),
        "shutdown_type": data.get("shutdownType"),
    }


def read_events_file(path: str) -> List[Dict[str, Any]]:
    events = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def summarize_event_file(session_id: str, path: str) -> Dict[str, Any]:
    events = read_events_file(path)
    starts = [e for e in events if e.get("type") == "session.start"]
    shutdowns = [e for e in events if e.get("type") == "session.shutdown"]
    invocation_counts: Counter[str] = Counter()
    tool_call_count = 0
    for event in events:
        typ = event.get("type")
        data = event.get("data") or {}
        if typ == "tool.execution_start":
            name = data.get("toolName") or "unknown_tool"
            invocation_counts[str(name)] += 1
            tool_call_count += 1
        elif typ == "external_tool.requested":
            name = data.get("toolName") or "unknown_external_tool"
            invocation_counts[f"external:{name}"] += 1
            tool_call_count += 1
        elif typ == "skill.invoked":
            name = data.get("name") or "unknown_skill"
            invocation_counts[f"skill:{name}"] += 1
    min_ts = min((e.get("timestamp") for e in events if e.get("timestamp")), default=None)
    max_ts = max((e.get("timestamp") for e in events if e.get("timestamp")), default=None)
    result = {
        "session_id": session_id,
        "events_path": path,
        "start_time": parse_iso_timestamp(starts[0].get("timestamp")) if starts else min_ts,
        "end_time": parse_iso_timestamp(shutdowns[-1].get("timestamp")) if shutdowns else max_ts,
        "selected_model": ((starts[0].get("data") or {}).get("selectedModel") if starts else None),
        "cwd": (((starts[0].get("data") or {}).get("context") or {}).get("cwd") if starts else None),
        "repository": (((starts[0].get("data") or {}).get("context") or {}).get("repository") if starts else None),
        "tool_call_count": tool_call_count,
        "invocation_counts": dict(invocation_counts),
        "has_shutdown": bool(shutdowns),
    }
    if shutdowns:
        result.update(session_from_shutdown(session_id, shutdowns[-1]))
    return result


def attribute_to_invocations(session: Dict[str, Any], invocation_counts: Dict[str, int]) -> Dict[str, Dict[str, float]]:
    total_count = sum(int(v) for v in invocation_counts.values())
    if total_count <= 0:
        return {}
    total_tokens = sum(float(session.get("tokens", {}).get(k, 0) or 0) for k in TOKEN_TYPES)
    out: Dict[str, Dict[str, float]] = {}
    for name, count_raw in invocation_counts.items():
        count = int(count_raw)
        share = count / total_count
        row = {
            "count": count,
            "tokens_total": total_tokens * share,
            "usd": float(session.get("usd") or 0.0) * share,
            "credits": float(session.get("credits") or 0.0) * share,
        }
        for key in TOKEN_TYPES:
            row[key] = float(session.get("tokens", {}).get(key, 0) or 0) * share
        out[name] = row
    return out


def round_money(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(float(value), 6)


def round_credits(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(float(value), 2)
