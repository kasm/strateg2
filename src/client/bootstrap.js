// ORCHESTRATOR: client (browser) entry point.
// Parses URL/mode flags, builds the HUD DOM, and hands off to game-controller.
//   - SP: show the start-game modal (map size picker), then runGame.
//   - MP: setupMP wires the lobby + net transport; runGame is invoked once the
//     server's match-start `hello` arrives.
//
// MP is the default when the page was served by the Node server (which injects
// `window.__STRATEG2_SERVER__=true` into index.html). The `?multiplayer=1` URL
// flag still forces MP for static-served pages; `?multiplayer=0` forces SP.

import { CONFIG, MAP_PRESETS, DEFAULT_MAP_PRESET } from '../core/config.js';
import { createClientState } from './client-state.js';
import { buildHudDom }       from './hud-dom.js';
import { setupMP, runGame }  from './game-controller.js';

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
