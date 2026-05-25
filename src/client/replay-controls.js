// Replay viewer toolbar: play/pause, speed (1x/2x/4x), scrubber, tick counter,
// verification badge. Pure DOM — writes to viewerCtl, never to sim state.
//
// `getPlayback` is a getter (not a value) because backward-seek replaces the
// playback instance under the hood; the controls always read the live one.

/**
 * @param {{
 *   getPlayback: () => { getTick: () => number, finalTick: number },
 *   viewerCtl:   { paused: boolean, speedMultiplier: number },
 *   onSeek:      (targetTick: number) => void,
 *   onExit:      () => void,
 * }} deps
 */
export function createReplayControls({ getPlayback, viewerCtl, onSeek, onExit }) {
  const root = document.getElementById('replay-controls');
  if (!root) throw new Error('replay-controls: #replay-controls not found in DOM');

  const playBtn   = document.getElementById('replay-play');
  const speedBtns = {
    1: document.getElementById('replay-speed-1'),
    2: document.getElementById('replay-speed-2'),
    4: document.getElementById('replay-speed-4'),
  };
  const scrubber  = /** @type {HTMLInputElement} */ (document.getElementById('replay-scrub'));
  const counter   = document.getElementById('replay-tick');
  const badge     = document.getElementById('replay-badge');
  const exitBtn   = document.getElementById('replay-exit');

  let scrubbing = false;
  let lastDrawnTick = -1;
  let lastDrawnFinal = -1;
  let finishedVerified = null; // null = not finished; true/false = checksum match

  function show() { root.style.display = ''; }
  function hide() { root.style.display = 'none'; }

  function setPaused(p) {
    viewerCtl.paused = p;
    playBtn.textContent = p ? 'Play' : 'Pause';
  }

  function setSpeed(n) {
    viewerCtl.speedMultiplier = n;
    for (const [k, btn] of Object.entries(speedBtns)) {
      if (!btn) continue;
      btn.classList.toggle('active', Number(k) === n);
    }
  }

  function update() {
    const pb = getPlayback();
    const t = pb.getTick();
    const f = pb.finalTick;
    if (f !== lastDrawnFinal) {
      scrubber.min = '0';
      scrubber.max = String(f);
      lastDrawnFinal = f;
    }
    if (!scrubbing && t !== lastDrawnTick) {
      scrubber.value = String(t);
      counter.textContent = `${t} / ${f}`;
      lastDrawnTick = t;
    }
  }

  function markFinished(verified) {
    if (finishedVerified !== null) return;
    finishedVerified = !!verified;
    badge.textContent = verified ? 'verified' : 'mismatch';
    badge.classList.toggle('verified', !!verified);
    badge.classList.toggle('mismatch', !verified);
    badge.style.display = '';
  }

  // --- wiring ---
  playBtn.addEventListener('click', () => setPaused(!viewerCtl.paused));
  for (const [k, btn] of Object.entries(speedBtns)) {
    if (!btn) continue;
    btn.addEventListener('click', () => setSpeed(Number(k)));
  }
  exitBtn?.addEventListener('click', () => onExit());

  // Scrubbing: pause while the user drags, snap to value on release.
  scrubber.addEventListener('input', () => {
    scrubbing = true;
    counter.textContent = `${scrubber.value} / ${scrubber.max}`;
  });
  scrubber.addEventListener('change', () => {
    const target = Number(scrubber.value);
    scrubbing = false;
    // A scrub past the finalTick can happen on touch devices; clamp.
    const pb = getPlayback();
    onSeek(Math.max(0, Math.min(target, pb.finalTick)));
    // Reset finished state if we scrubbed back from the end.
    if (finishedVerified !== null && target < pb.finalTick) {
      finishedVerified = null;
      badge.style.display = 'none';
    }
  });

  // Initial state.
  setPaused(false);
  setSpeed(1);
  badge.style.display = 'none';
  show();

  return { update, markFinished, hide, setPaused };
}
