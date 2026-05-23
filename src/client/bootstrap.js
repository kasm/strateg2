// ORCHESTRATOR: client (browser) bootstrap.
// Builds the headless sim via sim/index.js, wires up the client-only modules (clientState,
// render, input), and owns the RAF loop + game-over overlay. The sim module knows
// nothing about the DOM; everything DOM-shaped lives here.
//
// Mode switch (single branch only — everything else is mode-agnostic):
//   - SP: createLocalTransport(sim). RAF accumulator advances stepTick locally;
//     AI runs in-sim against state.aiType defaults (blue 'att', red 'off').
//   - MP: createNetTransport(...). Local AI is locked OFF (aiType='off' on
//     both sides). stepTick is driven by tick-commands messages from the
//     server, not by RAF. spawnInitial is delayed until the server's `hello`
//     (match-start) message arrives after a lobby invite exchange.
//
// MP is the default when the page was served by the Node server (which injects
// `window.__STRATEG2_SERVER__=true` into index.html). The `?multiplayer=1` URL
// flag still forces MP for static-served pages; `?multiplayer=0` forces SP.
//
// Map size is per-game. In SP a start-game modal asks the player to pick a
// preset; the sim is constructed afterwards. In MP the inviter's choice rides
// on the invite handshake and the server-broadcast match-start `hello` carries
// the agreed dims, so sim construction is deferred until match start.

import { CONFIG, MAP_PRESETS, DEFAULT_MAP_PRESET } from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createClientState }   from './client-state.js';
import { buildHudDom }         from './hud-dom.js';
import { createLocalTransport } from '../transport/local.js';
import { createNetTransport }   from '../transport/net.js';
import { createRender }        from '../modules/render/index.js';
import { createMinimap }       from '../modules/render/minimap.js';
import { createInput }         from '../modules/input/index.js';
import { createLobbyUI }       from './lobby-ui.js';

export function startClient() {
  const params      = new URLSearchParams(location.search);
  const explicitOff = params.get('multiplayer') === '0';
  const explicitOn  = params.has('multiplayer') && !explicitOff;
  const isMP        = !explicitOff && (explicitOn || !!window.__STRATEG2_SERVER__);
  const wsScheme    = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl       = params.get('server') || `${wsScheme}//${location.host}/ws`;

  const client = createClientState();

  // HUD DOM is data-driven from CONFIG — same in every match, independent of
  // sim instance. Build it once up front.
  buildHudDom(CONFIG);

  if (isMP) {
    setupMP({ client, wsUrl });
  } else {
    showStartGameModal(MAP_PRESETS, DEFAULT_MAP_PRESET, (preset) => {
      runGame({ client, isMP: false, dims: { mapW: preset.w, mapH: preset.h } });
    });
  }
}

// SP start-game modal: dropdown of MAP_PRESETS + Start button.
function showStartGameModal(presets, defaultKey, onStart) {
  const modal  = document.getElementById('start-game-modal');
  const select = document.getElementById('start-game-map-size');
  const submit = document.getElementById('start-game-submit');
  if (!modal || !select || !submit) {
    // Defensive: index.html guarantees these exist; fall back to the default.
    onStart(presets[defaultKey]);
    return;
  }
  select.textContent = '';
  for (const [key, def] of Object.entries(presets)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = def.label;
    if (key === defaultKey) opt.selected = true;
    select.appendChild(opt);
  }
  modal.style.display = '';
  const onClick = () => {
    const key = select.value || defaultKey;
    modal.style.display = 'none';
    submit.removeEventListener('click', onClick);
    onStart(presets[key]);
  };
  submit.addEventListener('click', onClick);
}

// MP lobby + deferred sim construction. The net transport opens immediately so
// lobby messages flow; the sim is built inside `onAssign` once the server's
// match-start hello supplies the chosen map size.
function setupMP({ client, wsUrl }) {
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

function runGame({ client, isMP, dims, transport: existingTransport }) {
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
