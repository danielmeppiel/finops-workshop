// Extension: finops-dashboard
// Renders a local, FILTERABLE FinOps telemetry dashboard (cost-by-model,
// sessions-by-cost, skills-by-windowed-cost, tools-by-usage) from a bundled
// dashboard_data.json snapshot produced by demos/demo3-meter/export_dashboard.py.
// Filters (from/to date, model, skill) recompute every table client-side from
// granular fact arrays; they can also be driven via URL params for shareable
// views. Session/model $ are METERED; skill window output tokens are MEASURED;
// windowed skill $ is MODELED. Tools are point ops: usage only, no $.

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
  .sub { color: var(--text-color-muted, #8b949e); font-size: 12.5px; margin-bottom: 12px; }
  .filters { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; background: var(--background-color-muted,#161b22); border:1px solid var(--border-color-default,#30363d); border-radius:12px; padding:12px 14px; margin-bottom:16px; }
  .filters label { display:flex; flex-direction:column; gap:4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-color-muted,#8b949e); }
  .filters input, .filters select { background: var(--background-color-default,#0d1117); color: var(--text-color-default,#e6edf3); border:1px solid var(--border-color-default,#30363d); border-radius:8px; padding:6px 9px; font-size:13px; font-family:inherit; min-width:140px; }
  .filters button { background: var(--background-color-default,#0d1117); color: var(--text-color-default,#e6edf3); border:1px solid var(--border-color-default,#30363d); border-radius:8px; padding:7px 13px; font-size:12.5px; cursor:pointer; }
  .filters button:hover { border-color: var(--bar); }
  .frange { margin-left:auto; font-size:11.5px; color:var(--text-color-muted,#8b949e); text-transform:none; letter-spacing:0; align-self:center; }
  .legend { display:flex; gap:14px; align-items:center; font-size:12px; color: var(--text-color-muted,#8b949e); margin: 0 0 16px; flex-wrap:wrap; }
  .pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border:1px solid var(--border-color-default,#30363d); border-radius:999px; }
  .pill .d { width:8px; height:8px; border-radius:2px; }
  .meas { background: var(--true-color-green-muted, rgba(35,134,54,.18)); }
  .est  { background: var(--true-color-yellow-muted, rgba(187,128,9,.18)); }
  .cards { display:grid; grid-template-columns: repeat(6, minmax(110px,1fr)); gap:10px; margin-bottom:20px; }
  .card { background: var(--background-color-muted, #161b22); border:1px solid var(--border-color-default,#30363d); border-radius:12px; padding:13px 14px; }
  .card.accent { border-color: color-mix(in srgb, var(--bar) 55%, var(--border-color-default,#30363d)); }
  .label { color: var(--text-color-muted,#8b949e); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .value { font-weight:700; font-size:20px; margin-top:5px; font-variant-numeric: tabular-nums; }
  .value small { font-size:11px; font-weight:500; color:var(--text-color-muted,#8b949e); }
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
  .models { font-size:11px; color:var(--text-color-muted,#8b949e); }
  .dt { white-space:nowrap; }
  .barcell { width:130px; }
  .bar { height:7px; background: var(--border-color-muted,#21262d); border-radius:999px; overflow:hidden; }
  .fill { height:100%; background: linear-gradient(90deg, var(--bar), color-mix(in srgb, var(--bar) 55%, transparent)); }
  .fill.prem { background: linear-gradient(90deg, #cf6a4c, color-mix(in srgb, #cf6a4c 55%, transparent)); }
  .note { color:var(--text-color-muted,#8b949e); font-size:11.5px; margin-top:9px; }
  .note code { font-family: var(--font-mono, ui-monospace, Menlo, monospace); font-size:11px; }
  .empty { color:var(--text-color-muted,#8b949e); font-size:12.5px; padding:10px 2px; }
  .srow { cursor:pointer; }
  .srow:hover { background: color-mix(in srgb, var(--bar) 12%, transparent); }
  .ov { position:fixed; inset:0; background:rgba(1,4,9,.66); display:none; align-items:flex-start; justify-content:center; z-index:50; overflow:auto; padding:34px 16px; }
  .ov.open { display:flex; }
  .modal { background: var(--background-color-default,#0d1117); border:1px solid var(--border-color-default,#30363d); border-radius:14px; max-width:920px; width:100%; padding:18px 20px 22px; box-shadow:0 16px 50px rgba(1,4,9,.6); }
  .modal h3 { margin:0 0 2px; font-size:17px; }
  .modal .msub { color:var(--text-color-muted,#8b949e); font-size:11.5px; margin-bottom:12px; }
  .modal h4 { margin:16px 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-color-muted,#8b949e); }
  .mclose { float:right; cursor:pointer; border:1px solid var(--border-color-default,#30363d); background:var(--background-color-muted,#161b22); color:var(--text-color-default,#e6edf3); border-radius:8px; padding:4px 10px; font-size:12px; }
  .mcards { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:6px 0 4px; }
  @media (max-width: 900px) { .cards { grid-template-columns: repeat(3,1fr); } .mcards { grid-template-columns:repeat(2,1fr); } }
</style>
</head>
<body>
<main>
  <h1>MEASURE your own Copilot cost</h1>
  <div class="sub" id="generated"></div>
  <div class="filters">
    <label>From date<input type="date" id="f-from" /></label>
    <label>To date<input type="date" id="f-to" /></label>
    <label>Model<select id="f-model"></select></label>
    <label>Skill (loop)<select id="f-skill"></select></label>
    <button id="f-reset" type="button">Reset</button>
    <span class="frange" id="frange"></span>
  </div>
  <div class="legend">
    <span class="pill"><span class="d meas"></span> <b>Metered</b> — per-session &amp; per-model $ from real token telemetry</span>
    <span class="pill"><span class="d meas"></span> <b>Measured</b> — skill/tool usage &amp; window output tokens from events</span>
    <span class="pill"><span class="d est"></span> <b>Modeled</b> — windowed skill $ apportioned from metered session cost</span>
  </div>
  <div class="cards" id="cards"></div>
  <section>
    <h2>Cost by model <span class="tag m">metered</span></h2>
    <div id="models"></div>
    <div class="note">Per-model tokens and $ for the selected window. The <b>model sets the unit rate</b> (premium tiers cost multiples of right-sized ones); tokens are the volume — rate &times; volume is the bill. Use this to run the <b>tier-models</b> play.</div>
  </section>
  <section>
    <h2>Top sessions by cost <span class="tag m">metered</span></h2>
    <div id="sessions"></div>
    <div class="note">Session USD/credits come from each session's real per-model token counts (input / output / cache). The biggest sessions are where a better loop pays back fastest.</div>
  </section>
  <section>
    <h2>Most-used skills <span class="tag m">usage + window tokens measured</span> <span class="tag e">window $ modeled</span></h2>
    <div id="skills"></div>
    <div class="note" id="skills-note"></div>
  </section>
  <section>
    <h2>Most-used tools <span class="tag m">usage measured</span></h2>
    <div id="tools"></div>
    <div class="note">Calls and sessions are measured from <code>tool</code> events. Point tools are not windowed, so no per-tool $ is shown. Filtered by date (and by the selected skill's sessions); the model filter does not apply to tools.</div>
  </section>
</main>
<div class="ov" id="ov"><div class="modal" id="modal"></div></div>
<script>
  const data = ${json};
  const ST = data.sessions_tbl||[], FSM = data.facts_session_model||[], FSK = data.facts_skill||[], FT = data.facts_tool||[];
  const fmtMoney = n => '$' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtCredits = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});
  const fmtInt = n => Number(n||0).toLocaleString();
  const fmtPct = n => (Number(n||0)*100).toFixed(0)+'%';
  const fmtTok = n => { n=Number(n||0); return n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n); };
  const esc = s => String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const dayOf = i => { const r=ST[i]; return r?r[1]:''; };
  const sidOf = i => { const r=ST[i]; return r?r[0]:''; };
  const titleOf = i => { const r=ST[i]; return (r&&r[2])?r[2]:''; };
  const tier = m => { m=m||''; return m.indexOf('opus')>=0?'premium':(m.indexOf('sonnet')>=0?'mid':'economy'); };

  const state = { from: data.date_min||'', to: data.date_max||'', model:'', skill:'' };
  try { const q=new URLSearchParams(location.search); ['from','to','model','skill'].forEach(k=>{ if(q.has(k)) state[k]=q.get(k); }); } catch(e){}
  const inRange = i => { const d=dayOf(i); return (!state.from || d>=state.from) && (!state.to || d<=state.to); };

  function compute(){
    const model=state.model, skill=state.skill;
    let skillSessions=null;
    if(skill){ skillSessions=new Set(); for(const f of FSK){ if(f.sk===skill && inRange(f.s) && (!model||f.m===model)) skillSessions.add(f.s); } }
    const smRows=[]; for(const r of FSM){ if(inRange(r.s) && (!model||r.m===model) && (!skillSessions||skillSessions.has(r.s))) smRows.push(r); }
    const pm={}; for(const r of smRows){ const a=pm[r.m]||(pm[r.m]={model:r.m,requests:0,i:0,cr:0,cw:0,o:0,t:0,usd:0,cred:0}); a.requests+=r.rq||0;a.i+=r.i||0;a.cr+=r.cr||0;a.cw+=r.cw||0;a.o+=r.o||0;a.t+=r.t||0;a.usd+=r.usd||0;a.cred+=r.cred||0; }
    const per_model=Object.values(pm).sort((x,y)=>y.usd-x.usd);
    const ss={}; for(const r of smRows){ const a=ss[r.s]||(ss[r.s]={s:r.s,usd:0,cred:0,t:0,models:new Set()}); a.usd+=r.usd||0;a.cred+=r.cred||0;a.t+=r.t||0; a.models.add(r.m); }
    const sessions=Object.values(ss).sort((x,y)=>y.usd-x.usd);
    let totUsd=0,totCred=0,totTok=0,premUsd=0; for(const r of smRows){ totUsd+=r.usd||0; totCred+=r.cred||0; totTok+=r.t||0; if(tier(r.m)==='premium') premUsd+=r.usd||0; }
    const skRows=[]; for(const f of FSK){ if(inRange(f.s) && (!model||f.m===model) && (!skill||f.sk===skill)) skRows.push(f); }
    const sk={}; for(const f of skRows){ const a=sk[f.sk]||(sk[f.sk]={skill:f.sk,calls:0,sessions:new Set(),o:0,i:0,cr:0,cw:0,usd:0,cred:0}); a.calls+=f.c||0;a.sessions.add(f.s);a.o+=f.o||0;a.i+=f.i||0;a.cr+=f.cr||0;a.cw+=f.cw||0;a.usd+=f.usd||0;a.cred+=f.cred||0; }
    const skills=Object.values(sk).sort((x,y)=>y.usd-x.usd);
    const skillTotUsd=skills.reduce((s,r)=>s+r.usd,0);
    const tlRows=[]; for(const f of FT){ if(inRange(f.s) && (!skillSessions||skillSessions.has(f.s))) tlRows.push(f); }
    const tl={}; for(const f of tlRows){ const a=tl[f.tl]||(tl[f.tl]={tool:f.tl,calls:0,sessions:new Set()}); a.calls+=f.c||0; a.sessions.add(f.s); }
    const tools=Object.values(tl).sort((x,y)=>y.calls-x.calls);
    let toolCalls=0; for(const f of tlRows) toolCalls+=f.c||0;
    return {per_model,sessions,skills,skillTotUsd,tools,totUsd,totCred,totTok,sessCount:sessions.length,premUsd,toolCalls};
  }

  function bar(v,max,cls){ return '<td class="barcell"><div class="bar"><div class="fill'+(cls?' '+cls:'')+'" style="width:'+(100*(v||0)/(max||1))+'%"></div></div></td>'; }

  function renderCards(c){
    const avg = c.sessCount ? c.totUsd/c.sessCount : 0;
    const premPct = c.totUsd ? c.premUsd/c.totUsd : 0;
    const cards = [
      ['Sessions', fmtInt(c.sessCount), ''],
      ['Metered $', fmtMoney(c.totUsd), ''],
      ['Credits', fmtCredits(c.totCred), ''],
      ['Avg $/session', fmtMoney(avg), 'accent'],
      ['Premium-tier $', fmtPct(premPct)+' <small>of spend</small>', 'accent'],
      ['Tool calls', fmtInt(c.toolCalls), ''],
    ];
    return cards.map(a=>'<div class="card '+(a[2])+'"><div class="label">'+a[0]+'</div><div class="value">'+a[1]+'</div></div>').join('');
  }
  function renderModels(c){
    const m=c.per_model; if(!m.length) return '<div class="empty">No metered model rows for this filter.</div>';
    const max=Math.max(...m.map(r=>r.usd||0),1);
    return '<table><thead><tr><th>Model</th><th>Tier</th><th class="num">Requests</th><th class="num">Input</th><th class="num">Cache rd</th><th class="num">Output</th><th class="num">USD</th><th>Cost</th></tr></thead><tbody>'+
      m.map(r=>'<tr><td class="name">'+esc(r.model)+'</td><td class="models">'+tier(r.model)+'</td><td class="num">'+fmtInt(r.requests)+'</td><td class="num">'+fmtTok(r.i)+'</td><td class="num">'+fmtTok(r.cr)+'</td><td class="num">'+fmtTok(r.o)+'</td><td class="num">'+fmtMoney(r.usd)+'</td>'+bar(r.usd,max,tier(r.model)==='premium'?'prem':'')+'</tr>').join('')+
      '</tbody></table>';
  }
  function renderSessions(c){
    const s=c.sessions.slice(0,25); if(!s.length) return '<div class="empty">No sessions for this filter.</div>';
    const max=Math.max(...s.map(r=>r.usd||0),1);
    return '<table><thead><tr><th>Session</th><th>Date</th><th>Models</th><th class="num">USD</th><th class="num">Credits</th><th class="num">Tokens</th><th>Cost</th></tr></thead><tbody>'+
      s.map(r=>{ const ti=titleOf(r.s), sid=sidOf(r.s); const label=ti?esc(ti):esc(sid.slice(0,8));
        return '<tr class="srow" data-s="'+r.s+'" title="'+esc(sid)+(ti?' · '+esc(ti):'')+'"><td><div class="name">'+label+'</div><div class="sid">'+esc(sid.slice(0,8))+' · click to inspect</div></td><td class="num dt">'+esc(dayOf(r.s)||'—')+'</td><td class="models">'+esc(Array.from(r.models).sort().join(', '))+'</td><td class="num">'+fmtMoney(r.usd)+'</td><td class="num">'+fmtCredits(r.cred)+'</td><td class="num">'+fmtTok(r.t)+'</td>'+bar(r.usd,max)+'</tr>'; }).join('')+
      '</tbody></table>';
  }
  function renderSkills(c){
    const s=c.skills.slice(0,25); if(!s.length){ document.getElementById('skills-note').innerHTML='No skill invocations for this filter.'; return '<div class="empty">No skill invocations for this filter.</div>'; }
    const max=Math.max(...s.map(r=>r.usd||0),1);
    const top5=s.slice(0,5).reduce((a,r)=>a+r.usd,0);
    const conc = c.skillTotUsd ? top5/c.skillTotUsd : 0;
    document.getElementById('skills-note').innerHTML='<b>Calls, sessions &amp; window output are measured</b> from each <code>skill.invoked</code> until the next skill, the next HUMAN turn, or session end (synthetic skill-context messages no longer truncate the window; a new skill overtakes the prior one, so windows do not overlap). <b>Input / cache / $ (est)</b> apportion the metered session cost by that window\\'s output share (modeled, reconciles to metered). Top 5 skills = <b>'+fmtPct(conc)+'</b> of modeled skill $ — your <b>codify-the-loop</b> candidates.';
    return '<table><thead><tr><th>Skill (loop)</th><th class="num">Calls</th><th class="num">Sessions</th><th class="num">Win input</th><th class="num">Win cache rd</th><th class="num">Win output</th><th class="num">Window $ (est)</th><th>Window cost</th></tr></thead><tbody>'+
      s.map(r=>'<tr><td class="name">'+esc(r.skill)+'</td><td class="num">'+fmtInt(r.calls)+'</td><td class="num">'+fmtInt(r.sessions.size)+'</td><td class="num">'+fmtTok(r.i)+'</td><td class="num">'+fmtTok(r.cr)+'</td><td class="num">'+fmtTok(r.o)+'</td><td class="num">'+fmtMoney(r.usd)+'</td>'+bar(r.usd,max,'')+'</tr>').join('')+
      '</tbody></table>';
  }
  function renderTools(c){
    const s=c.tools.slice(0,25); if(!s.length) return '<div class="empty">No tool calls for this filter.</div>';
    const max=Math.max(...s.map(r=>r.calls||0),1);
    return '<table><thead><tr><th>Tool</th><th class="num">Calls</th><th class="num">Sessions</th><th>Usage</th></tr></thead><tbody>'+
      s.map(r=>'<tr><td class="name">'+esc(r.tool)+'</td><td class="num">'+fmtInt(r.calls)+'</td><td class="num">'+fmtInt(r.sessions.size)+'</td>'+bar(r.calls,max,'')+'</tr>').join('')+
      '</tbody></table>';
  }

  function openInspector(s){
    const sid=sidOf(s), ti=titleOf(s), day=dayOf(s);
    const sm=FSM.filter(r=>r.s===s).slice().sort((a,b)=>(b.usd||0)-(a.usd||0));
    const fk=FSK.filter(r=>r.s===s).slice().sort((a,b)=>(b.usd||0)-(a.usd||0));
    const ft=FT.filter(r=>r.s===s).slice().sort((a,b)=>(b.c||0)-(a.c||0));
    let tUsd=0,tCred=0,tTok=0,tReq=0; for(const r of sm){ tUsd+=r.usd||0; tCred+=r.cred||0; tTok+=r.t||0; tReq+=r.rq||0; }
    let h='<button class="mclose" id="mclose">Close ✕</button>';
    h+='<h3>'+(ti?esc(ti):esc(sid.slice(0,8)))+'</h3>';
    h+='<div class="msub">'+esc(sid)+' · '+esc(day||'—')+'</div>';
    h+='<div class="mcards">'+
      '<div class="card"><div class="label">Metered $</div><div class="value">'+fmtMoney(tUsd)+'</div></div>'+
      '<div class="card"><div class="label">Credits</div><div class="value">'+fmtCredits(tCred)+'</div></div>'+
      '<div class="card"><div class="label">Tokens</div><div class="value">'+fmtTok(tTok)+'</div></div>'+
      '<div class="card"><div class="label">Requests</div><div class="value">'+fmtInt(tReq)+'</div></div>'+
      '</div>';
    h+='<h4>Per-model (metered)</h4>';
    if(sm.length){
      h+='<table><thead><tr><th>Model</th><th class="num">Req</th><th class="num">Input</th><th class="num">Cache rd</th><th class="num">Cache wr</th><th class="num">Output</th><th class="num">USD</th><th class="num">Credits</th></tr></thead><tbody>';
      for(const r of sm){ h+='<tr><td class="name">'+esc(r.m)+'</td><td class="num">'+fmtInt(r.rq)+'</td><td class="num">'+fmtTok(r.i)+'</td><td class="num">'+fmtTok(r.cr)+'</td><td class="num">'+fmtTok(r.cw)+'</td><td class="num">'+fmtTok(r.o)+'</td><td class="num">'+fmtMoney(r.usd)+'</td><td class="num">'+fmtCredits(r.cred)+'</td></tr>'; }
      h+='</tbody></table>';
    } else { h+='<div class="empty">No metered model rows.</div>'; }
    h+='<h4>Skill windows <span class="tag m">output measured</span> <span class="tag e">input/cache/$ modeled</span></h4>';
    if(fk.length){
      h+='<table><thead><tr><th>Skill</th><th>Model</th><th class="num">Calls</th><th class="num">Output</th><th class="num">Input</th><th class="num">Cache rd</th><th class="num">$ est</th></tr></thead><tbody>';
      for(const r of fk){ h+='<tr><td class="name">'+esc(r.sk)+'</td><td class="models">'+esc(r.m)+'</td><td class="num">'+fmtInt(r.c)+'</td><td class="num">'+fmtTok(r.o)+'</td><td class="num">'+fmtTok(r.i)+'</td><td class="num">'+fmtTok(r.cr)+'</td><td class="num">'+fmtMoney(r.usd)+'</td></tr>'; }
      h+='</tbody></table>';
    } else { h+='<div class="empty">No skill windows in this session.</div>'; }
    h+='<h4>Tools</h4>';
    if(ft.length){
      h+='<table><thead><tr><th>Tool</th><th class="num">Calls</th></tr></thead><tbody>';
      for(const r of ft.slice(0,40)){ h+='<tr><td class="name">'+esc(r.tl)+'</td><td class="num">'+fmtInt(r.c)+'</td></tr>'; }
      h+='</tbody></table>';
    } else { h+='<div class="empty">No tool calls in this session.</div>'; }
    document.getElementById('modal').innerHTML=h;
    document.getElementById('ov').classList.add('open');
    document.getElementById('mclose').addEventListener('click',closeInspector);
  }
  function closeInspector(){ document.getElementById('ov').classList.remove('open'); }

  function renderAll(){
    const c=compute();
    document.getElementById('cards').innerHTML=renderCards(c);
    document.getElementById('models').innerHTML=renderModels(c);
    document.getElementById('sessions').innerHTML=renderSessions(c);
    document.getElementById('skills').innerHTML=renderSkills(c);
    document.getElementById('tools').innerHTML=renderTools(c);
    const rows=document.querySelectorAll('#sessions .srow'); for(const el of rows){ el.addEventListener('click',()=>openInspector(parseInt(el.getAttribute('data-s'),10))); }
    const flt=[]; if(state.model) flt.push('model='+state.model); if(state.skill) flt.push('skill='+state.skill);
    document.getElementById('frange').textContent=(state.from||'…')+' → '+(state.to||'…')+(flt.length?'  ·  '+flt.join('  ·  '):'')+'  ·  '+fmtInt(c.sessCount)+' sessions';
  }

  function initControls(){
    document.getElementById('generated').textContent='Generated '+(data.generated_at||'')+' · '+fmtInt((data.summary&&data.summary.session_count)||ST.length)+' local sessions · data '+(data.date_min||'')+' → '+(data.date_max||'');
    const ff=document.getElementById('f-from'), ft=document.getElementById('f-to');
    ff.min=ft.min=data.date_min||''; ff.max=ft.max=data.date_max||''; ff.value=state.from; ft.value=state.to;
    const mo=document.getElementById('f-model'); mo.innerHTML='<option value="">All models</option>'+(data.models||[]).map(m=>'<option value="'+esc(m)+'">'+esc(m)+' ('+tier(m)+')</option>').join('');
    const sk=document.getElementById('f-skill'); sk.innerHTML='<option value="">All skills</option>'+(data.skills||[]).map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
    mo.value=state.model; sk.value=state.skill;
    ff.addEventListener('change',e=>{ state.from=e.target.value; renderAll(); });
    ft.addEventListener('change',e=>{ state.to=e.target.value; renderAll(); });
    mo.addEventListener('change',e=>{ state.model=e.target.value; renderAll(); });
    sk.addEventListener('change',e=>{ state.skill=e.target.value; renderAll(); });
    document.getElementById('f-reset').addEventListener('click',()=>{ state.from=data.date_min||''; state.to=data.date_max||''; state.model=''; state.skill=''; ff.value=state.from; ft.value=state.to; mo.value=''; sk.value=''; renderAll(); });
    document.getElementById('ov').addEventListener('click',e=>{ if(e.target.id==='ov') closeInspector(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeInspector(); });
  }
  initControls();
  renderAll();
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
            description: "Local Copilot cost telemetry: top sessions by metered cost, plus most-used skills and tools (ranked by measured usage).",
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
