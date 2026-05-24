// CONTROLLER: per-match game lifecycle, mode-aware.
// Bootstrap parses the URL/mode flags and shows the SP start modal; once a map
// preset is chosen (SP) or the server's match-start `hello` arrives (MP), it
// hands off here. This file owns sim construction, transport selection, the
// initial spawn dance, input/render/minimap wiring, the per-frame RAF loop,
// and the game-over overlay.

import { CONFIG, MAP_PRESETS, DEFAULT_MAP_PRESET } from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createLocalTransport } from '../transport/local.js';
import { createNetTransport }   from '../transport/net.js';
import { createRender }         from '../modules/render/index.js';
import { createMinimap }        from '../modules/render/minimap.js';
import { createInput }          from '../modules/input/index.js';
import { createLobbyUI }        from './lobby-ui.js';

// MP lobby + deferred sim construction. The net transport opens immediately so
// lobby messages flow; the sim is built inside `onAssign` once the server's
// match-start hello supplies the chosen map size.
export function setupMP({ client, wsUrl }) {
  let lobbyUI = null;
  const transport = createNetTransport(wsUrl, {
    onAssign: ({ playerId, mapW, mapH }) => {
      client.playerId = playerId;
      const dims = resolveDims(mapW, mapH);
      runGame({ client, isMP: true, dims, transport });
      if (lobbyUI) lobbyUI.onMatchStart();
    },
    onLobbyHello:     (msg)  => lobbyUI && lobbyUI.onLobbyHello(msg),
    onPlayers:        (list) => lobbyUI && lobbyUI.onPlayers(list),
    onNameAccepted:   (msg)  => lobbyUI && lobbyUI.onNameAccepted(msg),
    onNameRejected:   (msg)  => lobbyUI && lobbyUI.onNameRejected(msg),
    onInvited:        (msg)  => lobbyUI && lobbyUI.onInvited(msg),
    onInviteDeclined: (msg)  => lobbyUI && lobbyUI.onInviteDeclined(msg),
    onInviteFailed:   (msg)  => lobbyUI && lobbyUI.onInviteFailed(msg),
    onMatchEnded:     (msg)  => {
      showGameOverOverlay(client, true, msg.winner, msg.reason);
      if (lobbyUI) lobbyUI.onMatchEnded(msg);
    },
    onFull:           ()     => lobbyUI && lobbyUI.onFull(),
    onError:          (e)    => { console.error('NetTransport error:', e); },
  });
  lobbyUI = createLobbyUI({ transport, presets: MAP_PRESETS, defaultPreset: DEFAULT_MAP_PRESET });
}

// Resolve server-supplied dims into a known preset, falling back to the
// default. Defends against malformed/missing fields.
function resolveDims(mapW, mapH) {
  for (const def of Object.values(MAP_PRESETS)) {
    if (def.w === mapW && def.h === mapH) return { mapW, mapH };
  }
  const fallback = MAP_PRESETS[DEFAULT_MAP_PRESET];
  return { mapW: fallback.w, mapH: fallback.h };
}

export function runGame({ client, isMP, dims, transport: existingTransport }) {
  const sim = createSimWorld(CONFIG, dims);
  client.camera.setMap(sim.map.w, sim.map.h);

  if (isMP) {
    sim.state.aiType.red  = 'off';
    sim.state.aiType.blue = 'off';
  }

  const transport = existingTransport || createLocalTransport(sim);
  let matchStarted = isMP; // MP starts immediately once we're called from onAssign

  function restart() {
    if (isMP) {
      document.getElementById('game-over').style.display = 'none';
      return;
    }
    transport.submit({ type: 'restart', playerId: client.playerId });
    client.selectedIds.length = 0;
    client.buildMode = null;
    client.trainFromId = null;
    document.getElementById('game-over').style.display = 'none';
    input.refreshBuildButtons();
    input.refreshTrainMenu();
  }

  function downloadReplay() {
    const replay = sim.recorder.toReplay(sim.state);
    const json   = JSON.stringify(replay);
    const stamp  = (replay.recordedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    const url    = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a      = document.createElement('a');
    a.href = url;
    a.download = `strateg2-replay-${replay.result.winner || 'partial'}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // SP-only auto-upload of the finished replay. MP recordings are saved by the
  // server from its own sim — no client round-trip needed. The marker injected
  // by static.js means we only POST when the Node server is actually hosting
  // (running under `npx serve .` would 404 silently anyway, but skipping the
  // request avoids the console noise).
  function uploadReplay() {
    const replay = sim.recorder.toReplay(sim.state);
    fetch('/api/games', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(replay),
      keepalive: true,
    }).catch(() => { /* fire-and-forget — losing an upload is non-fatal */ });
  }

  const input = createInput({
    state:       sim.state,
    client,
    config:      sim.config,
    map:         sim.map,
    entities:    sim.entities,
    units:       sim.units,
    pathfinding: sim.pathfinding,
    transport,
    isMP,
    onRestart:   restart,
  });
  const render = createRender({
    state:    sim.state,
    client,
    config:   sim.config,
    map:      sim.map,
    entities: sim.entities,
    getDragRect: input.getDragRect,
  });
  const minimap = createMinimap({
    state:  sim.state,
    client,
    config: sim.config,
    map:    sim.map,
  });

  // SP: spawn now. MP: server has already spawned (the hello message is the
  // signal); the local sim mirrors via the lockstep stream.
  spawnInitial(sim);

  input.initInput();
  render.initRender();
  minimap.init();
  input.refreshBuildButtons();
  input.refreshTrainMenu();
  centerCameraOnTownHall(client, sim);

  const downloadBtn = document.getElementById('download-replay');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadReplay);

  let overlayShown = false;

  if (isMP) {
    transport.onCommandsForTick((_serverTick, commands) => {
      if (!matchStarted) return;
      for (const cmd of commands) submitCommand(sim, cmd);
      stepTick(sim, TICK_DT);
    });
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      input.tickPan(dt);
      render.draw();
      minimap.draw();
      checkOverlay();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } else {
    let last = performance.now();
    let acc  = 0;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= TICK_DT) { stepTick(sim, TICK_DT); acc -= TICK_DT; }
      input.tickPan(dt);
      render.draw();
      minimap.draw();
      checkOverlay();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function checkOverlay() {
    if (sim.state.gameOver && !overlayShown) {
      showGameOverOverlay(client, isMP, sim.state.gameOver, 'gameOver');
      overlayShown = true;
      if (!isMP && typeof window !== 'undefined' && window.__STRATEG2_SERVER__) {
        uploadReplay();
      }
    } else if (!sim.state.gameOver && overlayShown) {
      document.getElementById('game-over').style.display = 'none';
      overlayShown = false;
    }
  }
}

function centerCameraOnTownHall(client, sim) {
  const me = sim.state.entities.find(
    e => e.type === 'building' && e.kind === 'townHall' && e.owner === client.playerId
  );
  if (!me) return;
  client.camera.centerOnTile(
    me.tileX + me.w / 2,
    me.tileY + me.h / 2,
  );
}

function showGameOverOverlay(client, isMP, winner, reason) {
  const overlay = document.getElementById('game-over');
  const myWin = isMP ? winner === client.playerId : winner === 'red';
  const head  = reason === 'opponent-disconnected'
    ? 'Opponent disconnected.'
    : (myWin ? 'Victory!' : 'Defeat.');
  document.getElementById('game-over-text').textContent =
    `${head} (${winner || '?'} wins)`;
  overlay.style.display = '';
}
