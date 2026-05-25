// Sim event bus.
//
// An append-only log of in-sim notifications ("raid incoming", "town hall under
// attack", "bounty collected") that the HUD renders as toasts. Lives on
// state.events so it is part of the deterministic, serializable sim — replays
// reproduce the exact same notifications.
//
// Events are NEVER read back by sim logic; they are display-only. They DO,
// however, count toward the single-writer rule (P7) — pushes happen here, in
// src/core/, which is already an allowed mutation prefix.
//
// No pruning. Each event is tiny (~50 bytes) and a 30-minute match produces
// at most a few dozen. The renderer filters by TTL at draw time.

/**
 * @typedef {Object} SimEvent
 * @property {number} tick     - sim tick when the event was emitted
 * @property {string} type     - event id, e.g. 'raid-incoming', 'camp-destroyed'
 * @property {number} ttl      - ticks after `tick` during which the renderer should show it
 * @property {Object} [payload] - optional structured details (faction id, entity id, amount, ...)
 */

/**
 * Push an event into state.events.
 * @param {import('./game-state.js').GameState} state
 * @param {string} type
 * @param {number} ttl
 * @param {Object} [payload]
 */
export function emit(state, type, ttl, payload) {
  state.events.push({ tick: state.tick, type, ttl, payload: payload ?? null });
}

/**
 * View of events still within their TTL relative to the current tick.
 * Pure read — used by the renderer, never by sim logic.
 * @param {import('./game-state.js').GameState} state
 * @returns {SimEvent[]}
 */
export function liveEvents(state) {
  return state.events.filter((e) => state.tick - e.tick <= e.ttl);
}
