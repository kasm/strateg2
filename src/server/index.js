// ORCHESTRATOR: Node multiplayer server.
// Hosts the static client files AND a WebSocket endpoint on the same port.
// Lockstep model: server runs a full sim, but its sole authority output is a
// per-tick broadcast of every player's commands. Each connected client runs an
// identical deterministic sim and steps from the same broadcast stream.
//
// Lifecycle (per match):
//   - Lobby phase: clients connect, pick names, see each other's roster, send
//     and accept invites. The sim object exists but is dormant — no entities,
//     no ticks broadcast.
//   - On accept: lobby.startMatch pairs inviter=red + invitee=blue; sim is
//     freshly spawned via spawnInitial; relay/serverTick reset; tick loop
//     starts broadcasting `tick-commands` and stepping the sim.
//   - Match end (gameOver or disconnect): the pair gets a `match-ended` msg,
//     lobby returns to vacant, sim sits idle until the next match starts.
//
// Capacity rule: while a match is active, new WS connections are refused with
// `{type:'full'}` — no spectators, no queueing on top of the active pair.

import http from 'node:http';
import path from 'node:path';
import url  from 'node:url';
import { execFile } from 'node:child_process';
import { WebSocketServer } from 'ws';

import { CONFIG }                                              from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createLobby }                                         from './lobby.js';
import { createRelay }                                         from './relay.js';
import { createStaticHandler }                                 from './static.js';

const PORT     = Number(process.env.PORT || 4010);
const PROJECT_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');

const sim   = createSimWorld(CONFIG);
const lobby = createLobby();
const relay = createRelay();

// Sim stays dormant until two players agree on a match. autoFight is unused
// (no AI players in this mode), but kept false so any stray AI tick in the sim
// modules doesn't try to emit commands.
sim.state.autoFight.red  = false;
sim.state.autoFight.blue = false;

// Wrap commands.submit defensively. In this lobby-gated flow only human-stamped
// cmds reach the relay (AI is off), but we keep the wrap so future changes that
// re-enable AI route its commands through the relay rather than the local queue.
const origSubmit = sim.commands.submit;
sim.commands.submit = (cmd) => {
  if (cmd.seq == null) {
    cmd.seq = relay.stampSeq(cmd.playerId);
    relay.enqueue(cmd);
    return;
  }
  origSubmit.call(sim.commands, cmd);
};

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
  // Fresh sim each match. The sim object is reused (so the dispatcher wrap
  // stays intact), state is reset in place by spawnInitial.
  spawnInitial(sim);
  relay.reset();
  serverTick = 0;
  const red  = lobby.matchConn('red');
  const blue = lobby.matchConn('blue');
  send(red,  { type: 'hello', playerId: 'red',  initialAutoFight: { red: false, blue: false } });
  send(blue, { type: 'hello', playerId: 'blue', initialAutoFight: { red: false, blue: false } });
}

function finishMatch(reason, winner) {
  const pair = lobby.endMatch();
  if (pair) {
    send(pair.red,  { type: 'match-ended', reason, winner });
    send(pair.blue, { type: 'match-ended', reason, winner });
  }
  // Drain any residual relay state and reset tick counter for the next match.
  relay.reset();
  serverTick = 0;
  broadcastRoster();
}

wss.on('connection', (conn) => {
  // Capacity gate: no spectators while a match is active.
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
        const fromConnId = lobby.connIdOf(conn);
        const fromName   = lobby.nameOf(conn);
        if (!fromName) return; // inviter must have a name
        send(target, { type: 'invited', fromConnId, fromName });
        return;
      }
      case 'accept-invite': {
        if (lobby.isInMatch()) return;
        const inviter = lobby.connById(msg.fromConnId);
        if (!inviter || inviter === conn) return;
        if (!lobby.nameOf(inviter) || !lobby.nameOf(conn)) return;
        const pair = lobby.startMatch(inviter, conn);
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
        if (!slot || !lobby.isInMatch()) return;       // not in a match: ignore
        if (msg.cmd.playerId !== slot) return;          // spoof guard
        msg.cmd.seq = relay.stampSeq(msg.cmd.playerId);
        relay.enqueue(msg.cmd);
        return;
      }
      default:
        return;
    }
  });

  conn.on('close', () => {
    // Snapshot the leaver's slot BEFORE removeConn clears the pairing, so we
    // can tell the survivor who won.
    const leaverSlot = lobby.matchSlotFor(conn);
    conns.delete(conn);
    const res = lobby.removeConn(conn);
    if (res.wasInMatch && res.opponentConn) {
      const winner = leaverSlot === 'red' ? 'blue' : 'red';
      send(res.opponentConn, { type: 'match-ended', reason: 'opponent-disconnected', winner });
      relay.reset();
      serverTick = 0;
    }
    broadcastRoster();
  });
});

setInterval(() => {
  if (!lobby.isInMatch()) return;

  // 1. Collect everything that accumulated since the last tick (client cmds
  //    received async + any future AI cmds that route through the relay wrap).
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
        // Listening rows look like: "  TCP    0.0.0.0:4010   0.0.0.0:0   LISTENING   12345"
        const m = line.match(/\s\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
      if (pids.size === 0) return `  (no LISTENING socket found on :${port} — the port may belong to a non-TCP listener or another user's session)`;
      return Promise.all([...pids].map(pid => describeWindowsPid(pid, run))).then(rows => rows.join('\n\n'));
    });
  }
  // macOS / Linux
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
  // Single PowerShell call yields image, exe, and full command line.
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
    // lsof -Fn output is one field per line; the cwd line starts with 'n'.
    const cwdLine = (lsofOut.split(/\r?\n/).find(l => l.startsWith('n')) || '').slice(1);
    return [
      `  PID ${pid}  →  ${comm || '<unknown>'}`,
      args    ? `    args: ${args}` : null,
      cwdLine ? `    cwd : ${cwdLine}` : null,
    ].filter(Boolean).join('\n');
  });
}
