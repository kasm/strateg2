// Replay-browser modal.
//
// Probes `GET /api/games` for a server-supplied list; on success renders the
// list (one row per replay). On any failure (no server, 404, non-JSON body) it
// silently falls back to a `<input type=file>` that accepts a downloaded .json.
//
// View-only: never writes to sim state. Hands the parsed replay JSON to
// `onPick`; the controller owns construction of the playback world.

const REPLAY_FORMAT  = 'strateg2-replay';

/**
 * @param {{ onPick: (replay: object) => void }} deps
 */
export function showReplayBrowser({ onPick }) {
  const modal    = document.getElementById('replay-browser-modal');
  const listEl   = document.getElementById('replay-browser-list');
  const fileInp  = /** @type {HTMLInputElement} */ (document.getElementById('replay-browser-file'));
  const cancelBt = document.getElementById('replay-browser-cancel');
  const statusEl = document.getElementById('replay-browser-status');
  if (!modal || !listEl || !fileInp || !cancelBt || !statusEl) {
    throw new Error('replay-browser: modal markup missing from index.html');
  }

  function show()   { modal.style.display = ''; }
  function hide()   { modal.style.display = 'none'; }
  function status(msg) { statusEl.textContent = msg || ''; }

  function handle(replay) {
    if (!replay || replay.format !== REPLAY_FORMAT) {
      status('Not a strateg2 replay file.');
      return;
    }
    hide();
    onPick(replay);
  }

  // File picker — always available as a fallback.
  fileInp.value = ''; // reset so re-picking the same file fires `change`
  fileInp.onchange = async () => {
    const file = fileInp.files && fileInp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      handle(JSON.parse(text));
    } catch {
      status('Could not parse the selected file as JSON.');
    }
  };

  cancelBt.onclick = () => hide();

  // Server list (best-effort).
  listEl.textContent = '';
  status('Looking for stored replays…');
  fetch('/api/games', { headers: { accept: 'application/json' } })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('non-JSON');
      return resp.json();
    })
    .then((list) => {
      if (!Array.isArray(list) || list.length === 0) {
        status('No stored replays yet. Load one from disk:');
        return;
      }
      status('');
      renderList(list);
    })
    .catch(() => {
      status('No server list available — load a replay file from disk:');
    });

  function renderList(list) {
    for (const entry of list) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'replay-row';
      const when   = formatStamp(entry.recordedAt);
      const mode   = entry.mode || '?';
      const winner = entry.winner || 'unknown';
      const dims   = (entry.mapW && entry.mapH) ? `${entry.mapW}x${entry.mapH}` : '?';
      const ticks  = Number.isFinite(entry.finalTick) ? `${entry.finalTick}t` : '?';
      row.textContent = `${when}  —  ${mode}  ${winner} wins  ${dims}  ${ticks}`;
      row.addEventListener('click', async () => {
        status('Loading…');
        try {
          // Files live under <root>/.games/; the static handler serves them.
          const resp = await fetch(`/.games/${encodeURIComponent(entry.filename)}`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          handle(await resp.json());
        } catch {
          status(`Failed to load ${entry.filename}.`);
        }
      });
      listEl.appendChild(row);
    }
  }

  show();
}

function formatStamp(iso) {
  if (!iso || typeof iso !== 'string') return '?';
  // Trim sub-second + Z, replace T with a space for legibility. Keep the date.
  return iso.replace(/\..*Z$/, 'Z').replace('T', ' ');
}
