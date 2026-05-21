// ORCHESTRATOR: client (browser) bootstrap.
// Builds the headless sim via sim/index.js, wires up the client-only modules (clientState,
// render, input), and owns the RAF loop + game-over overlay. The sim module knows
// nothing about the DOM; everything DOM-shaped lives here.
//
// Mode switch (single branch only — everything else is mode-agnostic):
//   - SP (default, no ?multiplayer): createLocalTransport(sim). RAF accumulator
//     advances stepTick locally; AI runs in-sim against state.autoFight defaults.
//   - MP (?multiplayer=1):           createNetTransport(...). Local AI is locked
//     OFF (autoFight=false on both sides). stepTick is driven by tick-commands
//     messages from the server, not by RAF.

import { CONFIG }              from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createClientState }   from './client-state.js';
import { createLocalTransport } from '../transport/local.js';
import { createNetTransport }   from '../transport/net.js';
import { createRender }        from '../modules/render/index.js';
import { createInput }         from '../modules/input/index.js';

export function startClient() {
  const params = new URLSearchParams(location.search);
  const isMP   = params.has('multiplayer');
  const wsUrl  = params.get('server') || `ws://${location.host}/ws`;

  const sim    = createSimWorld(CONFIG);
  const client = createClientState();

  if (isMP) {
    // Invariant: in MP, AI runs ONLY on the server. Lock both autoFight flags so
    // the client's sim.ai.updateAI never emits commands (which would never make
    // it onto the wire and would desync this peer from everyone else).
    sim.state.autoFight.red  = false;
    sim.state.autoFight.blue = false;
  }

  const transport = isMP
    ? createNetTransport(wsUrl, {
        onAssign: ({ playerId }) => {
          client.playerId = playerId;
          // Refresh UI bits that filter by ownership now that we know our slot.
          input.refreshTrainMenu();
        },
        onError: (e) => { console.error('NetTransport error:', e); },
      })
    : createLocalTransport(sim);

  function restart() {
    // Restart is now a command — applies identically in SP and MP. In SP the
    // LocalTransport submits straight into the dispatcher; in MP it goes to the
    // server which broadcasts to all peers.
    transport.submit({ type: 'restart', playerId: client.playerId });
    client.selectedIds.length = 0;
    client.buildMode = null;
    client.trainFromId = null;
    document.getElementById('game-over').style.display = 'none';
    input.refreshBuildButtons();
    input.refreshTrainMenu();
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

  spawnInitial(sim);
  input.initInput();
  render.initRender();
  input.refreshBuildButtons();
  input.refreshTrainMenu();

  let overlayShown = false;

  if (isMP) {
    // MP: sim advance is driven by the server. RAF is render-only.
    transport.onCommandsForTick((_serverTick, commands) => {
      for (const cmd of commands) submitCommand(sim, cmd);
      stepTick(sim, TICK_DT);
    });
    function frame() {
      render.draw();
      checkOverlay();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } else {
    // SP: RAF accumulator drives stepTick locally, unchanged from the original loop.
    let last = performance.now();
    let acc  = 0;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= TICK_DT) { stepTick(sim, TICK_DT); acc -= TICK_DT; }
      render.draw();
      checkOverlay();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function checkOverlay() {
    if (sim.state.gameOver && !overlayShown) {
      showGameOverOverlay(sim.state.gameOver);
      overlayShown = true;
    } else if (!sim.state.gameOver && overlayShown) {
      document.getElementById('game-over').style.display = 'none';
      overlayShown = false;
    }
  }
}

function showGameOverOverlay(winner) {
  const overlay = document.getElementById('game-over');
  document.getElementById('game-over-text').textContent =
    (winner === 'red' ? 'Victory!' : 'Defeat.') + ' (' + winner + ' wins)';
  overlay.style.display = '';
}
