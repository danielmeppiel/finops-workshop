#!/usr/bin/env python3
"""Export dashboard_data.json and static dashboard.html from finops.db."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone

WORK = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(WORK, "finops.db")
JSON_PATH = os.path.join(WORK, "dashboard_data.json")
HTML_PATH = os.path.join(WORK, "dashboard.html")


def rows(conn, sql, params=()):
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def main() -> int:
    conn = sqlite3.connect(DB_PATH)
    meta = {r["key"]: json.loads(r["value"]) for r in rows(conn, "SELECT key, value FROM etl_metadata")}
    top_sessions = rows(
        conn,
        """
        SELECT session_id, source, models, total_tokens, input_tokens, output_tokens, cache_read_tokens,
               cache_write_tokens, aiu, usd, credits, premium_requests, responses, tool_call_count,
               start_time, end_time, repository
        FROM sessions
        WHERE usd > 0
        ORDER BY usd DESC
        LIMIT 25
        """,
    )
    top_tools = rows(
        conn,
        """
        SELECT st.tool_name AS tool_name,
               SUM(st.invocation_count) AS invocation_count,
               COUNT(DISTINCT st.session_id) AS sessions,
               SUM(COALESCE(s.usd, 0)) AS session_usd_touched,
               SUM(COALESCE(s.credits, 0)) AS session_credits_touched
        FROM session_tools st
        LEFT JOIN sessions s ON s.session_id = st.session_id
        WHERE st.tool_name NOT LIKE 'skill:%'
        GROUP BY st.tool_name
        ORDER BY invocation_count DESC
        LIMIT 25
        """,
    )
    top_skills = rows(
        conn,
        """
        SELECT SUBSTR(st.tool_name, 7) AS skill_name,
               SUM(st.invocation_count) AS invocation_count,
               COUNT(DISTINCT st.session_id) AS sessions,
               SUM(COALESCE(s.usd, 0)) AS session_usd_touched,
               SUM(COALESCE(s.credits, 0)) AS session_credits_touched
        FROM session_tools st
        LEFT JOIN sessions s ON s.session_id = st.session_id
        WHERE st.tool_name LIKE 'skill:%'
        GROUP BY st.tool_name
        ORDER BY invocation_count DESC
        LIMIT 25
        """,
    )
    summary = rows(
        conn,
        """
        SELECT COUNT(*) AS session_count, SUM(usd) AS usd, SUM(credits) AS credits,
               SUM(total_tokens) AS total_tokens, SUM(tool_call_count) AS tool_call_count,
               SUM(CASE WHEN nano_aiu IS NOT NULL THEN 1 ELSE 0 END) AS sessions_with_aiu
        FROM sessions
        """,
    )[0]
    conn.close()
    data = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "method_note": (
            "Per-session USD/credits/tokens are METERED from session.shutdown model telemetry. "
            "Skills/tools are ranked by MEASURED invocation counts. 'session_usd_touched' is the "
            "total metered cost of sessions where the skill/tool appeared, NOT cost attributed to it; "
            "truthful per-skill/tool cost is not derivable from events (range $0..session cost). "
            "See demos/demo3-meter/VALIDATION.md."
        ),
        "summary": summary,
        "top_sessions": top_sessions,
        "top_tools": top_tools,
        "top_skills": top_skills,
        "metadata": meta,
    }
    with open(JSON_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    embedded = json.dumps(data)
    html = f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Demo 3 — Copilot Cost Telemetry</title>
<style>
:root {{ color-scheme: light; --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --bar:#2563eb; --bg:#f8fafc; --card:#fff; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:28px; }}
h1 {{ margin:0 0 6px; font-size:28px; }}
.sub {{ color:var(--muted); margin-bottom:22px; }}
.cards {{ display:grid; grid-template-columns: repeat(5, minmax(130px,1fr)); gap:12px; margin-bottom:22px; }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; box-shadow:0 1px 2px rgba(0,0,0,.04); }}
.label {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }}
.value {{ font-weight:750; font-size:22px; margin-top:4px; }}
section {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; margin:16px 0; box-shadow:0 1px 2px rgba(0,0,0,.04); }}
h2 {{ margin:0 0 12px; font-size:18px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ text-align:left; color:var(--muted); border-bottom:1px solid var(--line); padding:8px; font-weight:650; }}
td {{ border-bottom:1px solid #f1f5f9; padding:8px; vertical-align:middle; }}
.num {{ text-align:right; font-variant-numeric: tabular-nums; }}
.sid {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }}
.barcell {{ min-width:140px; }}
.bar {{ height:8px; background:#dbeafe; border-radius:999px; overflow:hidden; }}
.fill {{ height:100%; background:linear-gradient(90deg,var(--bar),#60a5fa); }}
.note {{ color:var(--muted); font-size:12px; margin-top:10px; }}
@media (max-width:900px) {{ .cards {{ grid-template-columns: repeat(2, 1fr); }} table {{ font-size:12px; }} }}
</style>
</head>
<body><main>
<h1>Demo 3 — MEASURE your own Copilot cost</h1>
<div class=\"sub\" id=\"generated\"></div>
<div class=\"cards\" id=\"cards\"></div>
<section><h2>Top sessions by cost</h2><div id=\"sessions\"></div><div class=\"note\"><b>Measured</b> — session USD/credits come from real per-session model token telemetry (input/output/cache).</div></section>
<section><h2>Most-used skills</h2><div id=\"skills\"></div><div class=\"note\"><b>Calls &amp; sessions are measured</b> from real <code>skill.invoked</code> events. <b>Session $ touched</b> = total <i>metered</i> cost of the sessions where this skill ran — it is <b>not</b> cost attributed to the skill. Truthful per-skill cost is <b>not derivable</b> from the events (a skill invocation is one line among thousands; true per-skill cost could be anywhere from $0 to the whole session). Rank by usage, not by these dollars.</div></section>
<section><h2>Most-used tools</h2><div id=\"tools\"></div><div class=\"note\">Same basis as skills: calls/sessions measured; <b>Session $ touched</b> is metered session cost, not per-tool attribution.</div></section>
</main>
<script>
const data = {embedded};
const fmtMoney = n => '$' + Number(n||0).toFixed(2);
const fmtCredits = n => Number(n||0).toLocaleString(undefined, {{maximumFractionDigits:1}});
const fmtInt = n => Number(n||0).toLocaleString();
const short = s => s ? s.slice(0,8) : '';
document.getElementById('generated').textContent = `Generated ${{data.generated_at}} from ${{data.summary.session_count}} local sessions`;
const cards = [
  ['Sessions', fmtInt(data.summary.session_count)],
  ['Total USD', fmtMoney(data.summary.usd)],
  ['Credits', fmtCredits(data.summary.credits)],
  ['Tokens', fmtInt(data.summary.total_tokens)],
  ['Tool calls', fmtInt(data.summary.tool_call_count)]
];
document.getElementById('cards').innerHTML = cards.map(([l,v]) => `<div class=card><div class=label>${{l}}</div><div class=value>${{v}}</div></div>`).join('');
function renderSessions() {{
 const max = Math.max(...data.top_sessions.map(r => r.usd||0), 1);
 return `<table><thead><tr><th>Session</th><th>Model(s)</th><th class=num>Credits</th><th class=num>USD</th><th class=num>Tokens</th><th class=num>AIU</th><th>Cost bar</th></tr></thead><tbody>` +
 data.top_sessions.map(r => `<tr><td class=sid title="${{r.session_id}}">${{short(r.session_id)}}</td><td>${{r.models||r.source}}</td><td class=num>${{fmtCredits(r.credits)}}</td><td class=num>${{fmtMoney(r.usd)}}</td><td class=num>${{fmtInt(r.total_tokens)}}</td><td class=num>${{r.aiu==null?'—':Number(r.aiu).toFixed(3)}}</td><td class=barcell><div class=bar><div class=fill style="width:${{100*(r.usd||0)/max}}%"></div></div></td></tr>`).join('') + `</tbody></table>`;
}}
function renderSkills() {{
 if (!data.top_skills || !data.top_skills.length) return '<div class=note>No skill invocations recorded.</div>';
 const max = Math.max(...data.top_skills.map(r => r.invocation_count||0), 1);
 return `<table><thead><tr><th>Skill</th><th class=num>Calls</th><th class=num>Sessions</th><th class=num>Session $ touched</th><th>Usage bar</th></tr></thead><tbody>` +
 data.top_skills.map(r => `<tr><td>${{r.skill_name}}</td><td class=num>${{fmtInt(r.invocation_count)}}</td><td class=num>${{fmtInt(r.sessions)}}</td><td class=num>${{fmtMoney(r.session_usd_touched)}}</td><td class=barcell><div class=bar><div class=fill style="width:${{100*(r.invocation_count||0)/max}}%"></div></div></td></tr>`).join('') + `</tbody></table>`;
}}
function renderTools() {{
 const max = Math.max(...data.top_tools.map(r => r.invocation_count||0), 1);
 return `<table><thead><tr><th>Tool</th><th class=num>Calls</th><th class=num>Sessions</th><th class=num>Session $ touched</th><th>Usage bar</th></tr></thead><tbody>` +
 data.top_tools.map(r => `<tr><td>${{r.tool_name}}</td><td class=num>${{fmtInt(r.invocation_count)}}</td><td class=num>${{fmtInt(r.sessions)}}</td><td class=num>${{fmtMoney(r.session_usd_touched)}}</td><td class=barcell><div class=bar><div class=fill style="width:${{100*(r.invocation_count||0)/max}}%"></div></div></td></tr>`).join('') + `</tbody></table>`;
}}
document.getElementById('sessions').innerHTML = renderSessions();
document.getElementById('skills').innerHTML = renderSkills();
document.getElementById('tools').innerHTML = renderTools();
</script></body></html>
"""
    with open(HTML_PATH, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {JSON_PATH} and {HTML_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
