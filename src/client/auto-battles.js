// Headless auto-battles harness. Spins up sims back-to-back with random AI
// matchups on the smallest map, ticks them as fast as JS can manage (no
// render, no input, no transport), and POSTs each finished replay to the
// server. Used to bake a large corpus of replay JSONs for AI tuning.
//
// Match-end conditions (whichever fires first):
//   - state.gameOver set by the victory phase (natural winner / draw).
//   - state.tick reaches TIMEOUT_TICKS — recorder.markTimeout() is called
//     so the saved replay carries status:"timeout".
//
// AI pool excludes 'off' (no AI) and 'def' (pure defence — would deadlock
// turtle-vs-turtle into a guaranteed timeout). Both sides are picked
// independently, so identical pairings (att vs att, etc.) are allowed.
//
// Replays are uploaded to /api/games via the existing SP endpoint, but only
// when window.__STRATEG2_SERVER__ is set (the Node server's static.js marker).
// When running under `npx serve .` the POST would 404; we skip it with a
// single warning instead of spamming the console.

import { CONFIG, MAP_PRESETS }                       from '../core/config.js';
import { createSimWorld, spawnInitial, stepTick, TICK_DT } from '../sim/index.js';

const AI_POOL          = ['att', 'adaptive', 'utility', 'hybrid'];
const SMALLEST_PRESET  = 'small';
const TIMEOUT_TICKS    = 20 * 60 * Math.round(1 / TICK_DT); // 20 min sim time
const CHUNK_TICKS      = 1000;                              // ticks per yield

const AI_LABELS = {
  off: 'Manual', att: 'Att AI', def: 'Def AI',
  adaptive: 'Adaptive AI', utility: 'Utility AI', hybrid: 'Hybrid AI',
};

/**
 * Start a continuous auto-battles loop. Returns a controller with `.stop()`
 * which lets the current battle finish naturally and then halts.
 *
 * @param {{ statusEl?: HTMLElement }} opts
 * @returns {{ stop: () => void }}
 */
export function startAutoBattles({ statusEl } = {}) {
  let stopped = false;
  let battleNumber = 0;
  let lastResult = null;
  let uploadDisabled = !(typeof window !== 'undefined' && window.__STRATEG2_SERVER__);
  if (uploadDisabled) {
    console.warn('[auto-battles] window.__STRATEG2_SERVER__ not set — replays will not be uploaded');
  }

  function setStatus(line) {
    if (statusEl) statusEl.textContent = line;
  }

  async function runOne() {
    battleNumber++;
    const red  = pickAi();
    const blue = pickAi();
    const matchup = `Red: ${AI_LABELS[red]} vs Blue: ${AI_LABELS[blue]}`;
    setStatus(`Battle ${battleNumber} — ${matchup} — starting…`
      + (lastResult ? `\nLast: ${lastResult}` : ''));

    const preset = MAP_PRESETS[SMALLEST_PRESET];
    const sim    = createSimWorld(CONFIG, { mapW: preset.w, mapH: preset.h });
    sim.state.aiType.red  = red;
    sim.state.aiType.blue = blue;
    spawnInitial(sim);

    while (!stopped && !sim.state.gameOver && sim.state.tick < TIMEOUT_TICKS) {
      const stopAt = Math.min(sim.state.tick + CHUNK_TICKS, TIMEOUT_TICKS);
      while (sim.state.tick < stopAt && !sim.state.gameOver) {
        stepTick(sim, TICK_DT);
      }
      setStatus(`Battle ${battleNumber} — ${matchup} — tick ${sim.state.tick}/${TIMEOUT_TICKS}`
        + (lastResult ? `\nLast: ${lastResult}` : ''));
      // Yield to the event loop so the page stays responsive and the Stop
      // button click can land between chunks.
      await new Promise((r) => setTimeout(r, 0));
    }

    if (!sim.state.gameOver && sim.state.tick >= TIMEOUT_TICKS) {
      sim.recorder.markTimeout();
    }
    sim.recorder.finish(sim.state);

    const replay = sim.recorder.toReplay(sim.state);
    lastResult = replay.status ?? '(no status)';
    setStatus(`Battle ${battleNumber} — done: ${lastResult}`);

    if (!uploadDisabled) await upload(replay);
  }

  (async function loop() {
    while (!stopped) {
      try {
        await runOne();
      } catch (err) {
        console.error('[auto-battles] battle failed:', err);
        setStatus(`Battle ${battleNumber} — error: ${err.message || err}`);
        // Brief pause so a tight error loop doesn't hog the main thread.
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setStatus(`Stopped after ${battleNumber} battle(s).`
      + (lastResult ? `\nLast: ${lastResult}` : ''));
  })();

  return { stop() { stopped = true; } };
}

function pickAi() {
  return AI_POOL[Math.floor(Math.random() * AI_POOL.length)];
}

async function upload(replay) {
  try {
    await fetch('/api/games', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(replay),
      keepalive: true,
    });
  } catch (err) {
    console.warn('[auto-battles] upload failed:', err);
  }
}
