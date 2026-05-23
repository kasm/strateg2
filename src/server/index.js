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
//     a fresh sim is constructed with those dims, relay-loop resets, and
//     the tick loop starts broadcasting `tick-commands` and stepping the sim.
//   - Match end (gameOver or disconnect): the pair gets a `match-ended` msg,
//     lobby returns to vacant, sim is discarded and rebuilt at the next match.
//
// Capacity rule: while a match is active, new WS connections are refused with
// `{type:'full'}` — no spectators, no queueing on top of the active pair.

import http from 'node:http';
import path from 'node:path';
import url  from 'node:url';
import { WebSocketServer } from 'ws';

import { CONFIG, MAP_PRESETS } from '../core/config.js';
import { createSimWorld, spawnInitial } from '../sim/index.js';
import { createLobby }         from './lobby.js';
import { createRelay }         from './relay.js';
import { createStaticHandler } from './static.js';
import { createRelayLoop }     from './relay-loop.js';
import { diagnosePortHolder }  from './port-diagnose.js';

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

const relayLoop = createRelayLoop({
  relay,
  broadcast,
  getSim:     () => sim,
  isActive:   () => lobby.isInMatch(),
  onGameOver: (winner) => finishMatch('gameOver', winner),
});

function beginMatch() {
  const dims = lobby.matchDims();
  if (!dims) return;
  sim = buildSim(dims.mapW, dims.mapH);
  spawnInitial(sim);
  relay.reset();
  relayLoop.reset();
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
  relayLoop.reset();
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
      relayLoop.reset();
      sim = null;
    }
    broadcastRoster();
  });
});

relayLoop.start();

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
