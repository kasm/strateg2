// ORCHESTRATOR: shape of the mutable game state. No behavior, no methods.
// Every gameplay module mutates fields on this object — the state graph is intentionally
// flat and readable so a human can scan the high-level invariants in one place.

/**
 * @typedef {Object} PlayerState
 * @property {number} gold
 * @property {number} wood
 *
 * @typedef {Object} GameState
 * @property {Object[]} entities        - units + buildings (alive and just-killed; pruned each tick)
 * @property {Object[]} projectiles     - in-flight arrows
 * @property {{red:PlayerState, blue:PlayerState}} players
 * @property {Object[]} selected        - currently-selected entity refs (human player)
 * @property {{kind:string}|null} buildMode  - non-null while placing a building
 * @property {Object|null} trainFrom    - building whose train menu is currently open
 * @property {'red'|'blue'|null} gameOver
 * @property {{x:number,y:number}|null} hoverTile
 * @property {number} _nextId           - monotonic entity-id counter
 */

/**
 * @param {import('./config.js').GameConfig} config
 * @returns {GameState}
 */
export function createGameState(config) {
  return {
    entities: [],
    projectiles: [],
    players: {
      red:  { gold: config.startResources.gold, wood: config.startResources.wood },
      blue: { gold: config.startResources.gold, wood: config.startResources.wood },
    },
    selected: [],
    buildMode: null,
    trainFrom: null,
    gameOver: null,
    hoverTile: null,
    alwaysHit: true,
    stackMode: 'spread',
    _nextId: 1,
  };
}

/** Reset the state in place so external refs (e.g. UI elements that captured `state`) stay valid. */
export function resetGameState(state, config) {
  state.entities.length = 0;
  state.projectiles.length = 0;
  state.players.red.gold = config.startResources.gold;
  state.players.red.wood = config.startResources.wood;
  state.players.blue.gold = config.startResources.gold;
  state.players.blue.wood = config.startResources.wood;
  state.selected.length = 0;
  state.buildMode = null;
  state.trainFrom = null;
  state.gameOver = null;
  state.hoverTile = null;
  state._nextId = 1;
}
