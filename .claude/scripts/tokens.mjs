#!/usr/bin/env node
// tokens.mjs — Claude Code per-session token usage and cost estimates.
//
// Reads session JSONL logs under ~/.claude/projects/<projectKey>/ and aggregates
// assistant-turn usage (input, output, cache-write 5m/1h, cache-read), folding in
// subagent runs from <sessionId>/subagents/agent-*.jsonl by default.
//
// Pure read-only. Lives next to the other analyzers but reads data outside the
// repo (the local Claude Code data dir) — the only analyzer that does so.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs, writeOut, getOutPath, mdTable } from './_shared.mjs';

// Anthropic list prices in USD per 1M tokens (as of 2026-05).
// Update when pricing changes — see anthropic.com/pricing.
// Lookup strips trailing date suffixes (e.g. "-20251001"), so the dated and
// undated forms of the same model match the same row.
const PRICING = {
  'claude-opus-4-7':   { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.50 },
  'claude-sonnet-4-6': { input:  3, output: 15, cacheWrite5m:  3.75, cacheWrite1h:  6, cacheRead: 0.30 },
  'claude-haiku-4-5':  { input:  1, output:  5, cacheWrite5m:  1.25, cacheWrite1h:  2, cacheRead: 0.10 },
  // Claude Code's local synthetic responses (summaries, injected user msgs) — zero cost.
  '<synthetic>':       { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 },
};

function pricingFor(model) {
  if (PRICING[model]) return PRICING[model];
  const stripped = model.replace(/-\d{8}$/, '');
  return PRICING[stripped] || null;
}

const args = parseArgs(process.argv);
const projectKey = typeof args.flags.project === 'string'
  ? args.flags.project
  : process.cwd().replace(/[:\\/]/g, '-').toLowerCase();
const topN = parseInt(args.flags.top ?? '0', 10);
const includeSubagents = args.flags['no-subagents'] !== true;
const includeCost = args.flags['no-cost'] !== true;

const projectDir = join(homedir(), '.claude', 'projects', projectKey);

if (!existsSync(projectDir)) {
  process.stderr.write(`no session logs at ${projectDir}\n`);
  process.exit(0);
}

const unknownModels = new Set();

const sessions = readSessions(projectDir);
const sessionRows = [];
const perModel = new Map();

for (const [sid, s] of sessions) {
  const parent = sumTurns(s.parent);
  const sub = sumTurns(s.sub);
  const total = {
    turns: parent.turns + sub.turns,
    input: parent.input + sub.input,
    output: parent.output + sub.output,
    cw: parent.cw5 + parent.cw1h + sub.cw5 + sub.cw1h,
    cr: parent.cr + sub.cr,
    cost: parent.cost + sub.cost,
    costKnown: parent.costKnown && sub.costKnown,
  };
  const lastTs = s.parent.at(-1)?.ts || new Date(s.mtime).toISOString();
  sessionRows.push({ sid, mtime: s.mtime, lastTs, parent, sub, total });
  for (const t of [...s.parent, ...s.sub]) accumulateModel(perModel, t);
}

sessionRows.sort((a, b) => b.mtime - a.mtime);
const shownRows = topN > 0 ? sessionRows.slice(0, topN) : sessionRows;

const grand = sumTurns([...sessions.values()].flatMap(s => [...s.parent, ...s.sub]));
const subagentSessionCount = [...sessions.values()].filter(s => s.sub.length > 0).length;

const out = [];
out.push(`# Claude Code token usage\n`);
out.push(`_Project key: \`${projectKey}\`_  `);
out.push(`_Path: ${projectDir}_  `);
out.push(`_Sessions: ${sessions.size}${includeSubagents ? `, subagent runs in ${subagentSessionCount}` : ' (subagents excluded)'}_  `);
out.push(`_Generated: ${new Date().toISOString()}_\n`);

out.push('## Totals\n');
const totalRows = [
  ['Sessions', fmtN(sessions.size)],
  ['Assistant turns', fmtN(grand.turns)],
  ['Input tokens', fmtN(grand.input)],
  ['Output tokens', fmtN(grand.output)],
  ['Cache writes (5m)', fmtN(grand.cw5)],
  ['Cache writes (1h)', fmtN(grand.cw1h)],
  ['Cache reads', fmtN(grand.cr)],
];
if (includeCost) totalRows.push(['Estimated cost', fmt$(grand.cost, grand.costKnown)]);
out.push(mdTable(['Metric', 'Value'], totalRows));

out.push(`\n## Per-session (most recent first${topN > 0 ? `, top ${shownRows.length}` : ''})\n`);
const sessionHeaders = ['Date', 'Time', 'Session', 'Turns', 'Input', 'Output', 'CacheW', 'CacheR'];
if (includeSubagents && includeCost) sessionHeaders.push('Sub $');
if (includeCost) sessionHeaders.push('Total $');
const sessionData = shownRows.map(r => {
  const d = r.lastTs ? new Date(r.lastTs) : new Date(r.mtime);
  const row = [
    d.toLocaleDateString('sv-SE'),
    d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
    r.sid.slice(0, 8),
    fmtN(r.total.turns),
    fmtN(r.total.input),
    fmtN(r.total.output),
    fmtN(r.total.cw),
    fmtN(r.total.cr),
  ];
  if (includeSubagents && includeCost) row.push(fmt$(r.sub.cost, r.sub.costKnown));
  if (includeCost) row.push(fmt$(r.total.cost, r.total.costKnown));
  return row;
});
out.push(mdTable(sessionHeaders, sessionData));

out.push('\n## Per-model\n');
const modelHeaders = ['Model', 'Turns', 'Input', 'Output', 'CacheW', 'CacheR'];
if (includeCost) modelHeaders.push('Cost');
const modelRows = [...perModel.entries()]
  .sort((a, b) => b[1].cost - a[1].cost)
  .map(([model, m]) => {
    const row = [
      model,
      fmtN(m.turns),
      fmtN(m.input),
      fmtN(m.output),
      fmtN(m.cw5 + m.cw1h),
      fmtN(m.cr),
    ];
    if (includeCost) row.push(fmt$(m.cost, m.costKnown));
    return row;
  });
out.push(mdTable(modelHeaders, modelRows));

if (includeCost && unknownModels.size) {
  out.push(`\n_Cost missing from price table for: ${[...unknownModels].join(', ')} (marked with \`?\`)_`);
}

writeOut(out.join('\n'), getOutPath(args));

// ---

function readSessions(dir) {
  const map = new Map();
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
    const sid = e.name.slice(0, -'.jsonl'.length);
    const full = join(dir, e.name);
    const st = statSync(full);
    map.set(sid, { parent: extractTurns(full), sub: [], mtime: st.mtimeMs });
  }
  if (!includeSubagents) return map;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const subDir = join(dir, e.name, 'subagents');
    if (!existsSync(subDir)) continue;
    const session = map.get(e.name) || { parent: [], sub: [], mtime: 0 };
    for (const f of readdirSync(subDir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      session.sub.push(...extractTurns(join(subDir, f)));
    }
    if (!map.has(e.name)) map.set(e.name, session);
  }
  return map;
}

function extractTurns(path) {
  const turns = [];
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return turns; }
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type !== 'assistant' || !obj.message?.usage) continue;
    const u = obj.message.usage;
    const model = obj.message.model || 'unknown';
    if (model !== 'unknown' && !pricingFor(model)) unknownModels.add(model);
    let cacheWrite5m = 0, cacheWrite1h = 0;
    if (u.cache_creation) {
      cacheWrite5m = u.cache_creation.ephemeral_5m_input_tokens || 0;
      cacheWrite1h = u.cache_creation.ephemeral_1h_input_tokens || 0;
    } else {
      cacheWrite5m = u.cache_creation_input_tokens || 0;
    }
    turns.push({
      ts: obj.timestamp || '',
      model,
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite5m,
      cacheWrite1h,
      cacheRead: u.cache_read_input_tokens || 0,
    });
  }
  return turns;
}

function costOf(turn) {
  const p = pricingFor(turn.model);
  if (!p) return null;
  return (
    turn.input         * p.input +
    turn.output        * p.output +
    turn.cacheWrite5m  * p.cacheWrite5m +
    turn.cacheWrite1h  * p.cacheWrite1h +
    turn.cacheRead     * p.cacheRead
  ) / 1_000_000;
}

function sumTurns(turns) {
  const acc = { turns: turns.length, input: 0, output: 0, cw5: 0, cw1h: 0, cr: 0, cost: 0, costKnown: true };
  for (const t of turns) {
    acc.input  += t.input;
    acc.output += t.output;
    acc.cw5    += t.cacheWrite5m;
    acc.cw1h   += t.cacheWrite1h;
    acc.cr     += t.cacheRead;
    const c = costOf(t);
    if (c == null) acc.costKnown = false;
    else acc.cost += c;
  }
  return acc;
}

function accumulateModel(map, t) {
  const m = map.get(t.model) || { turns: 0, input: 0, output: 0, cw5: 0, cw1h: 0, cr: 0, cost: 0, costKnown: true };
  m.turns++;
  m.input  += t.input;
  m.output += t.output;
  m.cw5    += t.cacheWrite5m;
  m.cw1h   += t.cacheWrite1h;
  m.cr     += t.cacheRead;
  const c = costOf(t);
  if (c == null) m.costKnown = false;
  else m.cost += c;
  map.set(t.model, m);
}

function fmtN(n) { return Number.isFinite(n) ? n.toLocaleString('en-US') : String(n); }
function fmt$(n, known) { return known ? `$${n.toFixed(2)}` : `$${n.toFixed(2)}?`; }
