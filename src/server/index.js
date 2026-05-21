// ORCHESTRATOR: Node multiplayer server.
// Hosts the static client files AND a WebSocket endpoint on the same port.
// Lockstep model: server runs a full sim, but its sole authority output is a
// per-tick broadcast of every player's + AI's commands. Each connected client
// runs an identical deterministic sim and steps from the same broadcast stream.
//
// Crossroads of the server:
//   - createSimWorld(CONFIG) + spawnInitial(sim)  — same headless API the client uses
//   - lobby                                       — slot assignment (red/blue)
//   - relay                                       — per-player seq + tick batching
//   - sim.commands.submit() WRAPPED               — AI cmds route into the relay,
//                                                   never directly into the sim queue
//
// On each tick:
//   1. broadcast tick-commands batch from the PREVIOUS tick's AI + this tick's
//      client cmds (collected by the relay).
//   2. Submit the broadcast batch into the sim's dispatcher (origSubmit).
//   3. stepTick(sim) — drains the batch, advances world, AI for empty slots fires
//      its own submits which our wrapper redirects into the relay (queued for
//      the NEXT broadcast).

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

// Bring the world up to its initial state immediately so client joins land on a
// populated, deterministic sim. AI's autoFight is initialized to true for both
// slots; flips off per-slot as humans connect.
spawnInitial(sim);
sim.state.autoFight.red  = true;
sim.state.autoFight.blue = true;

// Wrap commands.submit so AI cmds (unstamped) flow into the relay buffer for
// broadcast on the next tick, instead of into the sim's local queue. Already
// stamped commands (the broadcast batch we re-inject in the tick loop) pass
// through to the original submit untouched.
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

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const conn of conns) {
    if (conn.readyState === 1 /* OPEN */) conn.send(payload);
  }
}

function syncAutoFightFromLobby() {
  const flags = lobby.autoFightFlags();
  sim.state.autoFight.red  = flags.red;
  sim.state.autoFight.blue = flags.blue;
}

wss.on('connection', (conn) => {
  const playerId = lobby.assignSlot(conn);
  if (!playerId) {
    conn.send(JSON.stringify({ type: 'full' }));
    conn.close();
    return;
  }
  conns.add(conn);
  syncAutoFightFromLobby();

  conn.send(JSON.stringify({
    type: 'hello',
    playerId,
    initialAutoFight: lobby.autoFightFlags(),
  }));

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type !== 'cmd' || !msg.cmd) return;
    const cmd = msg.cmd;
    if (cmd.playerId !== playerId) return;  // spoof guard
    cmd.seq = relay.stampSeq(cmd.playerId);
    relay.enqueue(cmd);
  });

  conn.on('close', () => {
    conns.delete(conn);
    lobby.releaseSlot(conn);
    syncAutoFightFromLobby();
  });
});

setInterval(() => {
  // 1. Collect everything that accumulated since the last tick (client cmds
  //    received async + AI cmds emitted during the previous stepTick).
  const batch = relay.collectTick(serverTick);

  // 2. Broadcast to all peers. Empty batches are still useful as a heartbeat /
  //    tick-advance signal so clients keep their state.tick in lockstep.
  broadcast({ type: 'tick-commands', tick: serverTick, commands: batch });

  // 3. Apply the batch on the server's own sim, then advance.
  for (const cmd of batch) submitCommand(sim, cmd);
  stepTick(sim, TICK_DT);

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
