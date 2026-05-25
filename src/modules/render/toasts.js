// Internal: renders sim events from state.events as transient on-screen toasts.
//
// Pure read. Uses `liveEvents()` from core/events.js (filters by TTL relative to
// state.tick) so the displayed list matches deterministically across peers.
//
// Each event type formats into one line. Unknown types are ignored — that lets
// future event types be added on the sim side without coordinating a renderer
// change in the same commit (the toast just won't display until both sides
// learn the type).

import { liveEvents } from '../../core/events.js';

const FORMATTERS = {
  'raid-incoming': (e) => ({
    text: `Raid incoming in ~${Math.max(0, Math.round(e.payload?.inSec ?? 0))}s`,
    cls: 'warn',
  }),
  'raid-fired': (e) => ({
    text: `Raid! ${e.payload?.count ?? 0} bandits inbound`,
    cls: 'danger',
  }),
  'camp-destroyed': (e) => ({
    text: e.payload?.bounty > 0
      ? `Bandit camp destroyed — +${e.payload.bounty} gold`
      : 'Bandit camp destroyed',
    cls: 'success',
  }),
};

export function renderToasts(state) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const events = liveEvents(state);
  // Cheap diff: rebuild the inner HTML when anything changed (event count or
  // newest tick). Toasts are at most a handful, so the cost is negligible
  // and we sidestep DOM-key bookkeeping.
  const signature = events.length === 0 ? '' : `${events.length}:${events[events.length - 1].tick}`;
  if (root.dataset.signature === signature) return;
  root.dataset.signature = signature;
  root.replaceChildren();
  // Render in chronological order — newest at the bottom (CSS column flow).
  for (const ev of events) {
    const f = FORMATTERS[ev.type];
    if (!f) continue;
    const { text, cls } = f(ev);
    const div = document.createElement('div');
    div.className = `toast ${cls ?? ''}`.trim();
    div.textContent = text;
    root.appendChild(div);
  }
}
