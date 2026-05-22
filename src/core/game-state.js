// ORCHESTRATOR: shape of the mutable simulation state. No behavior, no methods.
// Every gameplay module mutates fields on this object — the state graph is intentionally
// flat and readable so a human can scan the high-level invariants in one place.
//
// Sim-pure: no client/UI fields (selection, build-mode, hover, stack render mode) live here.
// Those are in client/client-state.js. The fields below are part of the authoritative,
// serializable simulation state.

/**
 * @typedef {Object} PlayerState
 * @property {number} gold
 * @property {number} wood
 *
 * @typedef {Object} GameState
 * @property {number} tick              - monotonic tick counter, incremented once per sim step
 * @property {Object[]} entities        - units + buildings (alive and just-killed; pruned each tick)
 * @property {Map<number,Object>} entitiesById  - id -> entity, kept in sync with `entities` by the entities module
 * @property {Object[]} projectiles     - in-flight arrows
 * @property {{red:PlayerState, blue:PlayerState}} players
 * @property {'red'|'blue'|null} gameOver
 * @property {boolean} alwaysHit
 * @property {'auto'|'wood'|'arrows'} supplyPriority
 * @property {{red:('off'|'att'|'def'), blue:('off'|'att'|'def')}} aiType  - which AI drives each side
 * @property {number} _nextId           - monotonic entity-id counter
 */

/**
 * @param {import('./config.js').GameConfig} config
 * @returns {GameState}
 */
export function createGameState(config) {
  return {
    tick: 0,
    entities: [],
    entitiesById: new Map(),
    projectiles: [],
    players: {
      red:  { gold: config.startResources.gold, wood: config.startResources.wood },
      blue: { gold: config.startResources.gold, wood: config.startResources.wood },
    },
    gameOver: null,
    alwaysHit: true,
    supplyPriority: 'auto',
    aiType: { red: 'off', blue: 'att' },
    _nextId: 1,
  };
}

/** Reset the state in place so external refs (e.g. UI elements that captured `state`) stay valid. */
export function resetGameState(state, config) {
  state.tick = 0;
  state.entities.length = 0;
  state.entitiesById.clear();
  state.projectiles.length = 0;
  state.players.red.gold = config.startResources.gold;
  state.players.red.wood = config.startResources.wood;
  state.players.blue.gold = config.startResources.gold;
  state.players.blue.wood = config.startResources.wood;
  state.gameOver = null;
  state._nextId = 1;
}
