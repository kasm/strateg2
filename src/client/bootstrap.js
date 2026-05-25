// ORCHESTRATOR: client (browser) entry point.
// Parses URL/mode flags, builds the HUD DOM, and hands off to game-controller.
//   - SP: show the start-game modal (map size picker), then runGame.
//   - MP: setupMP wires the lobby + net transport; runGame is invoked once the
//     server's match-start `hello` arrives. The lobby also exposes a
//     "Play vs AI" button that reuses the SP start-game modal.
//
// MP is the default when the page was served by the Node server (which injects
// `window.__STRATEG2_SERVER__=true` into index.html). The `?multiplayer=1` URL
// flag still forces MP for static-served pages; `?multiplayer=0` forces SP.

import { CONFIG, MAP_PRESETS, DEFAULT_MAP_PRESET } from '../core/config.js';
import { createClientState }   from './client-state.js';
import { buildHudDom }         from './hud-dom.js';
import { setupMP, runGame, runReplay } from './game-controller.js';
import { showReplayBrowser }   from './replay-browser.js';

const AI_OPTIONS = [
  { value: 'off',      label: 'Manual (no AI)' },
  { value: 'att',      label: 'Att AI' },
  { value: 'def',      label: 'Def AI' },
  { value: 'adaptive', label: 'Adaptive AI' },
  { value: 'utility',  label: 'Utility AI' },
  { value: 'hybrid',   label: 'Hybrid AI' },
];
const DEFAULT_RED_AI  = 'off';
const DEFAULT_BLUE_AI = 'att';

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
    setupMP({
      client,
      wsUrl,
      onPlayVsAI: () => openStartGameModal(client),
    });
  } else {
    openStartGameModal(client);
  }
}

// Opens the SP start-game modal and on submit hands off to runGame. Also wires
// the "Load replay" affordance. Shared between the static-SP entry path and
// the dynamic-server lobby's "Play vs AI" button.
function openStartGameModal(client) {
  showStartGameModal(MAP_PRESETS, DEFAULT_MAP_PRESET,
    (preset, aiTypes) => {
      runGame({
        client,
        isMP: false,
        dims: { mapW: preset.w, mapH: preset.h },
        aiTypes,
      });
    },
    () => {
      showReplayBrowser({
        onPick: (replay) => {
          document.getElementById('start-game-modal').style.display = 'none';
          runReplay({ client, replay });
        },
      });
    },
  );
}

// SP start-game modal: dropdown of MAP_PRESETS + Your AI + Opponent AI + Start
// button. Also exposes a "Load replay" affordance that opens the replay
// browser modal. `onStart` receives (preset, { red, blue }).
function showStartGameModal(presets, defaultKey, onStart, onLoadReplay) {
  const modal      = document.getElementById('start-game-modal');
  const select     = document.getElementById('start-game-map-size');
  const redSel     = document.getElementById('start-game-red-ai');
  const blueSel    = document.getElementById('start-game-blue-ai');
  const submit     = document.getElementById('start-game-submit');
  const loadReplay = document.getElementById('start-game-load-replay');
  if (!modal || !select || !submit) {
    // Defensive: index.html guarantees these exist; fall back to the default.
    onStart(presets[defaultKey], { red: DEFAULT_RED_AI, blue: DEFAULT_BLUE_AI });
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
  populateAiSelect(redSel,  DEFAULT_RED_AI);
  populateAiSelect(blueSel, DEFAULT_BLUE_AI);
  modal.style.display = '';
  const onStartClick = () => {
    const key = select.value || defaultKey;
    const aiTypes = {
      red:  (redSel  && redSel.value)  || DEFAULT_RED_AI,
      blue: (blueSel && blueSel.value) || DEFAULT_BLUE_AI,
    };
    modal.style.display = 'none';
    submit.removeEventListener('click', onStartClick);
    onStart(presets[key], aiTypes);
  };
  submit.addEventListener('click', onStartClick);
  if (loadReplay && onLoadReplay) {
    loadReplay.addEventListener('click', () => onLoadReplay());
  }
}

function populateAiSelect(sel, defaultValue) {
  if (!sel) return;
  sel.textContent = '';
  for (const { value, label } of AI_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}
