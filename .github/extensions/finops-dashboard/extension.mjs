// Extension: finops-dashboard
// Renders a local FinOps telemetry dashboard (sessions-by-cost, skills-by-usage,
// tools-by-usage) from a bundled dashboard_data.json snapshot produced by
// demos/demo3-meter/export_dashboard.py. Calls are MEASURED; per-skill/tool
// USD is an ESTIMATE (proportional split of each session's measured cost).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve the local, gitignored telemetry snapshot. Precedence:
//   1. $FINOPS_DASHBOARD_DATA  2. ./dashboard_data.json (copied next to the extension)
//   3. the demo's generated output under demos/demo3-meter/
const DATA_CANDIDATES = [
    process.env.FINOPS_DASHBOARD_DATA,
    join(HERE, "dashboard_data.json"),
    join(HERE, "..", "..", "..", "demos", "demo3-meter", "dashboard_data.json"),
].filter(Boolean);

function resolveDataPath() {
    for (const p of DATA_CANDIDATES) {
        if (existsSync(p)) return p;
    }
    return DATA_CANDIDATES[DATA_CANDIDATES.length - 1];
}

const servers = new Map(); // instanceId -> { server, url }

async function loadData() {
    const path = resolveDataPath();
    if (!existsSync(path)) {
        throw new Error(
            "No dashboard_data.json found. Generate it: cd demos/demo3-meter && python3 build_db.py && python3 export_dashboard.py"
        );
    }
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
}

function renderHtml(data) {
    const json = JSON.stringify(data);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FinOps — Copilot cost telemetry</title>
<style>
  :root { --bar: var(--true-color-blue, #2563eb); }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--background-color-default, #0d1117);
    color: var(--text-color-default, #e6edf3);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: var(--text-body-medium, 14px);
    line-height: var(--leading-body-medium, 20px);
  }
  main { max-width: 1100px; margin: 0 auto; padding: 22px 26px 48px; }
  h1 { font-size: var(--text-title-large, 24px); font-weight: var(--font-weight-semibold, 600); margin: 0 0 4px; }
  .sub { color: var(--text-color-muted, #8b949e); font-size: 12.5px; margin-bottom: 8px; }
  .legend { display:flex; gap:14px; align-items:center; font-size:12px; color: var(--text-color-muted,#8b949e); margin: 6px 0 18px; flex-wrap:wrap; }
  .pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border:1px solid var(--border-color-default,#30363d); border-radius:999px; }
  .pill .d { width:8px; height:8px; border-radius:2px; }
  .meas { background: var(--true-color-green-muted, rgba(35,134,54,.18)); }
  .est  { background: var(--true-color-yellow-muted, rgba(187,128,9,.18)); }
  .cards { display:grid; grid-template-columns: repeat(5, minmax(120px,1fr)); gap:10px; margin-bottom:22px; }
  .card { background: var(--background-color-muted, #161b22); border:1px solid var(--border-color-default,#30363d); border-radius:12px; padding:13px 14px; }
  .label { color: var(--text-color-muted,#8b949e); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .value { font-weight:700; font-size:21px; margin-top:5px; font-variant-numeric: tabular-nums; }
  section { background: var(--background-color-muted, #161b22); border:1px solid var(--border-color-default,#30363d); border-radius:12px; padding:14px 16px; margin:14px 0; }
  h2 { font-size:15px; margin:0 0 4px; display:flex; align-items:center; gap:9px; }
  .tag { font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; padding:2px 7px; border-radius:6px; }
  .tag.m { background: var(--true-color-green-muted, rgba(35,134,54,.22)); color: var(--true-color-green, #3fb950); }
  .tag.e { background: var(--true-color-yellow-muted, rgba(187,128,9,.20)); color: var(--true-color-yellow, #d29922); }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
  th { text-align:left; color:var(--text-color-muted,#8b949e); border-bottom:1px solid var(--border-color-default,#30363d); padding:7px 8px; font-weight:600; }
  td { border-bottom:1px solid var(--border-color-muted,#21262d); padding:7px 8px; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  .num { text-align:right; font-variant-numeric: tabular-nums; }
  .sid { font-family: var(--font-mono, ui-monospace, Menlo, monospace); font-size:11.5px; color: var(--text-color-muted,#8b949e); }
  .name { font-weight:600; }
  .barcell { width:130px; }
  .bar { height:7px; background: var(--border-color-muted,#21262d); border-radius:999px; overflow:hidden; }
  .fill { height:100%; background: linear-gradient(90deg, var(--bar), color-mix(in srgb, var(--bar) 55%, transparent)); }
  .note { color:var(--text-color-muted,#8b949e); font-size:11.5px; margin-top:9px; }
  .note code { font-family: var(--font-mono, ui-monospace, Menlo, monospace); font-size:11px; }
  @media (max-width: 820px) { .cards { grid-template-columns: repeat(2,1fr); } }
</style>
</head>
<body>
<main>
  <h1>MEASURE your own Copilot cost</h1>
  <div class="sub" id="generated"></div>
  <div class="legend">
    <span class="pill"><span class="d meas"></span> <b>Measured</b> — from real token telemetry &amp; events</span>
    <span class="pill"><span class="d est"></span> <b>Estimated</b> — proportional split by invocation count</span>
  </div>
  <div class="cards" id="cards"></div>
  <section>
    <h2>Top sessions by cost <span class="tag m">measured</span></h2>
    <div id="sessions"></div>
    <div class="note">Session USD/credits come from each session's real per-model token counts (input / output / cache).</div>
  </section>
  <section>
    <h2>Most-used skills <span class="tag m">calls measured</span> <span class="tag e">cost estimated</span></h2>
    <div id="skills"></div>
    <div class="note">Calls counted from real <code>skill.invoked</code> events. USD is each session's measured cost split <i>proportionally by invocation count</i> — events expose no per-skill token spans, so treat $ as an estimate, not a meter.</div>
  </section>
  <section>
    <h2>Most-used tools <span class="tag m">calls measured</span> <span class="tag e">cost estimated</span></h2>
    <div id="tools"></div>
    <div class="note">Same attribution caveat as skills.</div>
  </section>
</main>
<script>
  const data = ${json};
  const fmtMoney = n => '$' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtCredits = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});
  const fmtInt = n => Number(n||0).toLocaleString();
  const fmtTok = n => { n=Number(n||0); return n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n); };
  const short = s => s ? s.slice(0,8) : '';
  const esc = s => String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  document.getElementById('generated').textContent =
    'Generated ' + (data.generated_at||'') + ' · ' + fmtInt(data.summary.session_count) + ' local sessions';
  const cards = [
    ['Sessions', fmtInt(data.summary.session_count)],
    ['Total USD', fmtMoney(data.summary.usd)],
    ['Credits', fmtCredits(data.summary.credits)],
    ['Tokens', fmtTok(data.summary.total_tokens)],
    ['Tool calls', fmtInt(data.summary.tool_call_count)],
  ];
  document.getElementById('cards').innerHTML = cards.map(([l,v]) =>
    '<div class="card"><div class="label">'+l+'</div><div class="value">'+v+'</div></div>').join('');
  function bar(v,max){ return '<td class="barcell"><div class="bar"><div class="fill" style="width:'+(100*(v||0)/(max||1))+'%"></div></div></td>'; }
  function renderSessions(){
    const max = Math.max(...data.top_sessions.map(r=>r.usd||0),1);
    return '<table><thead><tr><th>Session</th><th>Repository</th><th class="num">USD</th><th class="num">Credits</th><th class="num">Tokens</th><th>Cost</th></tr></thead><tbody>'+
      data.top_sessions.map(r=>'<tr><td class="sid" title="'+esc(r.session_id)+'">'+short(r.session_id)+'</td><td>'+esc(r.repository||'—')+'</td><td class="num">'+fmtMoney(r.usd)+'</td><td class="num">'+fmtCredits(r.credits)+'</td><td class="num">'+fmtTok(r.total_tokens)+'</td>'+bar(r.usd,max)+'</tr>').join('')+
      '</tbody></table>';
  }
  function renderSkills(){
    const s = data.top_skills||[];
    if(!s.length) return '<div class="note">No skill invocations recorded.</div>';
    const max = Math.max(...s.map(r=>r.invocation_count||0),1);
    return '<table><thead><tr><th>Skill</th><th class="num">Calls</th><th class="num">Sessions</th><th class="num">Est. USD</th><th class="num">Est. credits</th><th>Usage</th></tr></thead><tbody>'+
      s.map(r=>'<tr><td class="name">'+esc(r.skill_name)+'</td><td class="num">'+fmtInt(r.invocation_count)+'</td><td class="num">'+fmtInt(r.sessions)+'</td><td class="num">'+fmtMoney(r.attributed_usd)+'</td><td class="num">'+fmtCredits(r.attributed_credits)+'</td>'+bar(r.invocation_count,max)+'</tr>').join('')+
      '</tbody></table>';
  }
  function renderTools(){
    const max = Math.max(...data.top_tools.map(r=>r.invocation_count||0),1);
    return '<table><thead><tr><th>Tool</th><th class="num">Calls</th><th class="num">Est. USD</th><th class="num">Est. tokens</th><th>Usage</th></tr></thead><tbody>'+
      data.top_tools.map(r=>'<tr><td class="name">'+esc(r.tool_name)+'</td><td class="num">'+fmtInt(r.invocation_count)+'</td><td class="num">'+fmtMoney(r.attributed_usd)+'</td><td class="num">'+fmtTok(r.attributed_total_tokens)+'</td>'+bar(r.invocation_count,max)+'</tr>').join('')+
      '</tbody></table>';
  }
  document.getElementById('sessions').innerHTML = renderSessions();
  document.getElementById('skills').innerHTML = renderSkills();
  document.getElementById('tools').innerHTML = renderTools();
</script>
</body>
</html>`;
}

async function startServer(instanceId) {
    let cached = null;
    const server = createServer(async (req, res) => {
        try {
            if (!cached) cached = renderHtml(await loadData());
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(cached);
        } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Failed to render dashboard: " + (err && err.message ? err.message : String(err)));
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "finops-dashboard",
            displayName: "FinOps cost dashboard",
            description: "Local Copilot cost telemetry: top sessions by cost, most-used skills and tools (calls measured, cost estimated).",
            actions: [
                {
                    name: "refresh",
                    description: "Reload the dashboard from the latest dashboard_data.json snapshot on disk.",
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("not_open", "Canvas instance is not open.");
                        const data = await loadData();
                        return {
                            ok: true,
                            sessions: data.summary.session_count,
                            usd: data.summary.usd,
                            top_skill: (data.top_skills && data.top_skills[0]) ? data.top_skills[0].skill_name : null,
                        };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "FinOps cost dashboard", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
