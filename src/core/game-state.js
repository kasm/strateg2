// ORCHESTRATOR: shape of the mutable simulation state. No behavior, no methods.
// Every gameplay module mutates fields on this object — the state graph is intentionally
// flat and readable so a human can scan the high-level invariants in one place.
//
// Sim-pure: no client/UI fields (selection, build-mode, hover, stack render mode) live here.
// Those are in client/client-state.js. The fields below are part of the authoritative,
// serializable simulation state.

import { seedTreasury } from './economy.js';
import { seedResearch } from './research.js';

/**
 * @typedef {Object} PlayerState
 *   A resource bag: one numeric field per treasury resource id (see config.resourceTypes).
 *   `gold` and `wood` are the stock resources; more are added purely in config.
 *
 * @typedef {Object} GameState
 * @property {number} tick              - monotonic tick counter, incremented once per sim step
 * @property {Object[]} entities        - units + buildings (alive and just-killed; pruned each tick)
 * @property {Map<number,Object>} entitiesById  - id -> entity, kept in sync with `entities` by the entities module
 * @property {Object[]} projectiles     - in-flight arrows
 * @property {{red:PlayerState, blue:PlayerState}} players
 * @property {string|null} gameOver     - winning faction id, sentinel ('draw'), or null
 * @property {boolean} alwaysHit
 * @property {'auto'|'wood'|'arrows'} supplyPriority
 * @property {{red:string, blue:string}} aiType  - which AI drives each side: off|att|def|adaptive|utility|hybrid
 * @property {number} _nextId           - monotonic entity-id counter
 * @property {import('./events.js').SimEvent[]} events  - append-only HUD notification log
 * @property {Object} pve               - pve subsystem state (camp timers, wave director); shape owned by src/modules/pve
 */

/**
 * @param {import('./config.js').GameConfig} config
 * @returns {GameState}
 */
export function createGameState(config) {
  const players = { red: {}, blue: {} };
  for (const side of ['red', 'blue']) {
    seedTreasury(players[side], config);
    seedResearch(players[side], config);
  }
  return {
    tick: 0,
    entities: [],
    entitiesById: new Map(),
    projectiles: [],
    players,
    gameOver: null,
    alwaysHit: true,
    supplyPriority: 'auto',
    aiType: { red: 'off', blue: 'att' },
    _nextId: 1,
    events: [],
    pve: { waveTimer: 0, nextWaveAt: 0, raidAnnounced: false },
  };
}

/** Reset the state in place so external refs (e.g. UI elements that captured `state`) stay valid. */
export function resetGameState(state, config) {
  state.tick = 0;
  state.entities.length = 0;
  state.entitiesById.clear();
  state.projectiles.length = 0;
  for (const side of ['red', 'blue']) {
    seedTreasury(state.players[side], config);
    seedResearch(state.players[side], config);
  }
  state.gameOver = null;
  state._nextId = 1;
  state.events.length = 0;
  state.pve.waveTimer = 0;
  state.pve.nextWaveAt = 0;
  state.pve.raidAnnounced = false;
}
