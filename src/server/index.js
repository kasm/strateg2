// ORCHESTRATOR: Node multiplayer server.
// Hosts the static client files AND a WebSocket endpoint on the same port.
// Lockstep model: server runs a full sim, but its sole authority output is a
// per-tick broadcast of every player's commands. Each connected client runs an
// identical deterministic sim and steps from the same broadcast stream.
//
// Lifecycle (per match):
//   - Lobby phase: clients connect, pick names, see each other's roster, send
//     and accept invites. No sim exists yet — it is built at match start.
//   - On accept: the inviter's chosen map size is clamped to a known preset,
//     lobby.startMatch pairs inviter=red + invitee=blue with those dims,
//     a fresh sim is constructed with those dims, relay/serverTick reset, and
//     the tick loop starts broadcasting `tick-commands` and stepping the sim.
//   - Match end (gameOver or disconnect): the pair gets a `match-ended` msg,
//     lobby returns to vacant, sim is discarded and rebuilt at the next match.
//
// Capacity rule: while a match is active, new WS connections are refused with
// `{type:'full'}` — no spectators, no queueing on top of the active pair.

import http from 'node:http';
import path from 'node:path';
import url  from 'node:url';
import { execFile } from 'node:child_process';
import { WebSocketServer } from 'ws';

import { CONFIG, MAP_PRESETS }                                from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createLobby }                                         from './lobby.js';
import { createRelay }                                         from './relay.js';
import { createStaticHandler }                                 from './static.js';

const PORT     = Number(process.env.PORT || 4010);
const PROJECT_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');

/** @type {import('../core/world.js').SimWorld|null} */
let sim = null;
const lobby = createLobby();
const relay = createRelay();

// Clamp client-supplied (mapW, mapH) to a known preset; reject otherwise. Server
// is the trust boundary — a forged invite shouldn't be able to drive a 50000x50000
// world.
function dimsAsPreset(mapW, mapH) {
  for (const def of Object.values(MAP_PRESETS)) {
    if (def.w === mapW && def.h === mapH) return { mapW: def.w, mapH: def.h };
  }
  return null;
}

// Build a fresh sim for the next match. Locks AI off (server flow is human-only)
// and wraps `commands.submit` so any locally-emitted command is routed through
// the relay instead of the local queue.
function buildSim(mapW, mapH) {
  const w = createSimWorld(CONFIG, { mapW, mapH });
  w.state.aiType.red  = 'off';
  w.state.aiType.blue = 'off';
  const origSubmit = w.commands.submit;
  w.commands.submit = (cmd) => {
    if (cmd.seq == null) {
      cmd.seq = relay.stampSeq(cmd.playerId);
      relay.enqueue(cmd);
      return;
    }
    origSubmit.call(w.commands, cmd);
  };
  return w;
}

let serverTick = 0;

const staticHandler = createStaticHandler(PROJECT_ROOT);
const httpServer    = http.createServer((req, res) => staticHandler(req, res));
const wss           = new WebSocketServer({ server: httpServer, path: '/ws' });

const conns = new Set();

function send(conn, message) {
  if (conn && conn.readyState === 1 /* OPEN */) {
    conn.send(JSON.stringify(message));
  }
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const conn of conns) {
    if (conn.readyState === 1 /* OPEN */) conn.send(payload);
  }
}

function broadcastRoster() {
  broadcast({ type: 'players', list: lobby.roster() });
}

function beginMatch() {
  const dims = lobby.matchDims();
  if (!dims) return;
  sim = buildSim(dims.mapW, dims.mapH);
  spawnInitial(sim);
  relay.reset();
  serverTick = 0;
  const red  = lobby.matchConn('red');
  const blue = lobby.matchConn('blue');
  const hello = {
    type: 'hello',
    initialAutoFight: { red: false, blue: false },
    mapW: dims.mapW,
    mapH: dims.mapH,
  };
  send(red,  { ...hello, playerId: 'red'  });
  send(blue, { ...hello, playerId: 'blue' });
}

function finishMatch(reason, winner) {
  const pair = lobby.endMatch();
  if (pair) {
    send(pair.red,  { type: 'match-ended', reason, winner });
    send(pair.blue, { type: 'match-ended', reason, winner });
  }
  relay.reset();
  serverTick = 0;
  sim = null;
  broadcastRoster();
}

wss.on('connection', (conn) => {
  if (lobby.isMatchFull()) {
    send(conn, { type: 'full' });
    conn.close();
    return;
  }
  const connId = lobby.addConn(conn);
  conns.add(conn);
  send(conn, { type: 'lobby-hello', connId });
  broadcastRoster();

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg && msg.type) {
      case 'set-name': {
        const res = lobby.setName(conn, msg.name);
        if (!res.ok) {
          send(conn, { type: 'name-rejected', reason: res.reason });
        } else {
          send(conn, { type: 'name-accepted', name: lobby.nameOf(conn) });
          broadcastRoster();
        }
        return;
      }
      case 'invite': {
        if (lobby.isInMatch()) return;
        if (lobby.matchSlotFor(conn) !== null) return;
        const target = lobby.connById(msg.toConnId);
        if (!target || target === conn) return;
        if (lobby.matchSlotFor(target) !== null) return;
        const dims = dimsAsPreset(msg.mapW, msg.mapH);
        if (!dims) return; // bad invite — ignore
        const fromConnId = lobby.connIdOf(conn);
        const fromName   = lobby.nameOf(conn);
        if (!fromName) return;
        send(target, {
          type: 'invited',
          fromConnId, fromName,
          mapW: dims.mapW, mapH: dims.mapH,
        });
        return;
      }
      case 'accept-invite': {
        if (lobby.isInMatch()) return;
        const inviter = lobby.connById(msg.fromConnId);
        if (!inviter || inviter === conn) return;
        if (!lobby.nameOf(inviter) || !lobby.nameOf(conn)) return;
        const dims = dimsAsPreset(msg.mapW, msg.mapH);
        if (!dims) {
          send(conn, { type: 'invite-failed', reason: 'bad-map-size' });
          return;
        }
        const pair = lobby.startMatch(inviter, conn, dims.mapW, dims.mapH);
        if (!pair) {
          send(conn, { type: 'invite-failed', reason: 'unavailable' });
          return;
        }
        beginMatch();
        broadcastRoster();
        return;
      }
      case 'decline-invite': {
        const inviter = lobby.connById(msg.fromConnId);
        if (!inviter) return;
        const byConnId = lobby.connIdOf(conn);
        send(inviter, { type: 'invite-declined', byConnId });
        return;
      }
      case 'cmd': {
        if (!msg.cmd) return;
        const slot = lobby.matchSlotFor(conn);
        if (!slot || !lobby.isInMatch()) return;
        if (msg.cmd.playerId !== slot) return;
        msg.cmd.seq = relay.stampSeq(msg.cmd.playerId);
        relay.enqueue(msg.cmd);
        return;
      }
      default:
        return;
    }
  });

  conn.on('close', () => {
    const leaverSlot = lobby.matchSlotFor(conn);
    conns.delete(conn);
    const res = lobby.removeConn(conn);
    if (res.wasInMatch && res.opponentConn) {
      const winner = leaverSlot === 'red' ? 'blue' : 'red';
      send(res.opponentConn, { type: 'match-ended', reason: 'opponent-disconnected', winner });
      relay.reset();
      serverTick = 0;
      sim = null;
    }
    broadcastRoster();
  });
});

setInterval(() => {
  if (!lobby.isInMatch() || !sim) return;

  // 1. Collect everything that accumulated since the last tick.
  const batch = relay.collectTick(serverTick);

  // 2. Broadcast to both peers. Empty batches still drive tick-advance.
  broadcast({ type: 'tick-commands', tick: serverTick, commands: batch });

  // 3. Apply the batch on the server's own sim, then advance.
  for (const cmd of batch) submitCommand(sim, cmd);
  stepTick(sim, TICK_DT);

  // 4. Match-end on victory.
  if (sim.state.gameOver) {
    finishMatch('gameOver', sim.state.gameOver);
    return;
  }

  serverTick += 1;
}, TICK_DT * 1000);

let listenErrorHandled = false;
function handleListenError(err) {
  if (listenErrorHandled) return;
  listenErrorHandled = true;
  if (err.code !== 'EADDRINUSE') {
    console.error(err);
    process.exit(1);
  }
  console.error(`\nPort ${PORT} is already in use. Looking up the owning process...\n`);
  diagnosePortHolder(PORT).then(report => {
    console.error(report);
    console.error('\nFree the port (close the offending process) or rerun with a different port:');
    console.error(`  PORT=4011 npm run server          # bash`);
    console.error(`  $env:PORT=4011; npm run server    # PowerShell\n`);
    process.exit(1);
  });
}
httpServer.on('error', handleListenError);
wss.on('error',        handleListenError);

httpServer.listen(PORT, () => {
  console.log(`strateg2 server listening on http://localhost:${PORT}`);
  console.log(`open http://localhost:${PORT}?multiplayer=1 in two browser tabs`);
});

/**
 * Identify which process is holding the requested port. Best-effort, never throws.
 * Windows: netstat -ano + PowerShell Get-CimInstance for full command line + exe path.
 *          (Process cwd is not exposed via Win32 CLI tools without third-party utilities
 *          like Sysinternals `handle.exe` — the script path inside the command line is
 *          usually enough to identify the source.)
 * POSIX:   lsof for listener + cwd + ps for full args.
 * @param {number} port
 * @returns {Promise<string>} human-readable multi-line report
 */
function diagnosePortHolder(port) {
  const run = (cmd, args) => new Promise(resolve => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });

  if (process.platform === 'win32') {
    return run('netstat.exe', ['-ano', '-p', 'TCP']).then(out => {
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/\s\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
      if (pids.size === 0) return `  (no LISTENING socket found on :${port} — the port may belong to a non-TCP listener or another user's session)`;
      return Promise.all([...pids].map(pid => describeWindowsPid(pid, run))).then(rows => rows.join('\n\n'));
    });
  }
  return run('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-Pn']).then(out => {
    if (!out.trim()) return `  (lsof returned nothing — install lsof or check manually with: ss -lptn 'sport = :${port}')`;
    const pids = new Set();
    for (const line of out.split(/\r?\n/).filter(l => l && !l.startsWith('COMMAND'))) {
      const parts = line.trim().split(/\s+/);
      if (parts[1]) pids.add(parts[1]);
    }
    return Promise.all([...pids].map(pid => describePosixPid(pid, run))).then(rows => rows.join('\n\n'));
  });
}

function describeWindowsPid(pid, run) {
  const psScript =
    `$ErrorActionPreference='SilentlyContinue';` +
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";` +
    `if ($p) { '{0}|{1}|{2}' -f $p.Name, $p.ExecutablePath, $p.CommandLine }`;
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]).then(out => {
    const first = (out.split(/\r?\n/).find(l => l.trim()) || '').trim();
    const [name = '<unknown>', exe = '', cmdline = ''] = first.split('|');
    const lines = [
      `  PID ${pid}  →  ${name}`,
      exe     ? `    exe : ${exe}`     : null,
      cmdline ? `    args: ${cmdline}` : null,
      `    cwd : (not exposed by Windows CLI — see the script path inside args above)`,
    ].filter(Boolean);
    return lines.join('\n');
  });
}

function describePosixPid(pid, run) {
  return Promise.all([
    run('ps',   ['-p', pid, '-o', 'comm=,args=']),
    run('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']),
  ]).then(([psOut, lsofOut]) => {
    const psLine = (psOut.split(/\r?\n/)[0] || '').trim();
    const [comm, ...rest] = psLine.split(/\s+/);
    const args = rest.join(' ');
    const cwdLine = (lsofOut.split(/\r?\n/).find(l => l.startsWith('n')) || '').slice(1);
    return [
      `  PID ${pid}  →  ${comm || '<unknown>'}`,
      args    ? `    args: ${args}` : null,
      cwdLine ? `    cwd : ${cwdLine}` : null,
    ].filter(Boolean).join('\n');
  });
}
