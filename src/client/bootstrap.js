// ORCHESTRATOR: client (browser) bootstrap.
// Builds the headless sim via sim/index.js, wires up the client-only modules (clientState,
// render, input), and owns the RAF loop + game-over overlay. The sim module knows
// nothing about the DOM; everything DOM-shaped lives here.
//
// Mode switch (single branch only — everything else is mode-agnostic):
//   - SP: createLocalTransport(sim). RAF accumulator advances stepTick locally;
//     AI runs in-sim against state.autoFight defaults.
//   - MP: createNetTransport(...). Local AI is locked OFF (autoFight=false on
//     both sides). stepTick is driven by tick-commands messages from the
//     server, not by RAF. spawnInitial is delayed until the server's `hello`
//     (match-start) message arrives after a lobby invite exchange.
//
// MP is the default when the page was served by the Node server (which injects
// `window.__STRATEG2_SERVER__=true` into index.html). The `?multiplayer=1` URL
// flag still forces MP for static-served pages; `?multiplayer=0` forces SP.

import { CONFIG }              from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { createClientState }   from './client-state.js';
import { createLocalTransport } from '../transport/local.js';
import { createNetTransport }   from '../transport/net.js';
import { createRender }        from '../modules/render/index.js';
import { createInput }         from '../modules/input/index.js';
import { createLobbyUI }       from './lobby-ui.js';

export function startClient() {
  const params      = new URLSearchParams(location.search);
  const explicitOff = params.get('multiplayer') === '0';
  const explicitOn  = params.has('multiplayer') && !explicitOff;
  const isMP        = !explicitOff && (explicitOn || !!window.__STRATEG2_SERVER__);
  const wsUrl       = params.get('server') || `ws://${location.host}/ws`;

  const sim    = createSimWorld(CONFIG);
  const client = createClientState();

  if (isMP) {
    // Invariant: in MP, AI runs ONLY on the server (and currently is unused
    // since human-vs-human is the only flow). Lock both autoFight flags so any
    // stray AI tick on the client never emits commands that wouldn't make it
    // onto the wire.
    sim.state.autoFight.red  = false;
    sim.state.autoFight.blue = false;
  }

  let lobbyUI = null;
  let matchStarted = false;

  const transport = isMP
    ? createNetTransport(wsUrl, {
        onAssign: ({ playerId }) => {
          client.playerId = playerId;
          matchStarted = true;
          // Reset the local sim to a fresh match state and seed entities. The
          // server has just done the same; the lockstep stream is about to
          // start.
          spawnInitial(sim);
          if (lobbyUI) lobbyUI.onMatchStart();
          input.refreshTrainMenu();
          input.refreshBuildButtons();
        },
        onLobbyHello:     (msg)  => lobbyUI && lobbyUI.onLobbyHello(msg),
        onPlayers:        (list) => lobbyUI && lobbyUI.onPlayers(list),
        onNameAccepted:   (msg)  => lobbyUI && lobbyUI.onNameAccepted(msg),
        onNameRejected:   (msg)  => lobbyUI && lobbyUI.onNameRejected(msg),
        onInvited:        (msg)  => lobbyUI && lobbyUI.onInvited(msg),
        onInviteDeclined: (msg)  => lobbyUI && lobbyUI.onInviteDeclined(msg),
        onInviteFailed:   (msg)  => lobbyUI && lobbyUI.onInviteFailed(msg),
        onMatchEnded:     (msg)  => {
          matchStarted = false;
          showGameOverOverlay(msg.winner, msg.reason);
          if (lobbyUI) lobbyUI.onMatchEnded(msg);
        },
        onFull:           ()     => lobbyUI && lobbyUI.onFull(),
        onError:          (e)    => { console.error('NetTransport error:', e); },
      })
    : createLocalTransport(sim);

  function restart() {
    // SP-only: in MP, restart is driven by accepting a new invite after a
    // match ends. The Restart button stays bound for SP usage; in MP the
    // overlay's Restart button just hides itself and the user uses the lobby.
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

  if (isMP) {
    // Lobby UI lives only in MP. The DOM elements for it exist either way but
    // remain hidden in SP.
    lobbyUI = createLobbyUI({ transport });
  } else {
    // SP: same legacy behavior — populate the sim immediately.
    spawnInitial(sim);
  }
  input.initInput();
  render.initRender();
  input.refreshBuildButtons();
  input.refreshTrainMenu();

  let overlayShown = false;

  if (isMP) {
    // MP: sim advance is driven by the server. RAF is render-only.
    transport.onCommandsForTick((_serverTick, commands) => {
      if (!matchStarted) return; // ignore stragglers between matches
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
      showGameOverOverlay(sim.state.gameOver, 'gameOver');
      overlayShown = true;
    } else if (!sim.state.gameOver && overlayShown) {
      document.getElementById('game-over').style.display = 'none';
      overlayShown = false;
    }
  }

  function showGameOverOverlay(winner, reason) {
    const overlay = document.getElementById('game-over');
    const myWin = isMP ? winner === client.playerId : winner === 'red';
    const head  = reason === 'opponent-disconnected'
      ? 'Opponent disconnected.'
      : (myWin ? 'Victory!' : 'Defeat.');
    document.getElementById('game-over-text').textContent =
      `${head} (${winner || '?'} wins)`;
    overlay.style.display = '';
  }
}
