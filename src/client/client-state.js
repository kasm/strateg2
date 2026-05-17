// Client-only state. Lives outside GameState so the sim stays serializable and headless.
// Entity refs in here are IDs (numbers), resolved via entities.byId() at read time.
//
// Fields here are pure UX: selection set, building placement mode, the hovered tile,
// which building's train menu is open, and the stack render mode. None of these are
// observed by the simulation.

/**
 * @typedef {Object} ClientState
 * @property {number[]} selectedIds            - selected entity IDs (alive-only is enforced at read sites).
 * @property {{kind:string}|null} buildMode    - non-null while placing a building.
 * @property {number|null} trainFromId         - building ID whose train menu is open.
 * @property {{x:number,y:number}|null} hoverTile
 * @property {'spread'|'overlap'|'badge'} stackMode
 */

/** @returns {ClientState} */
export function createClientState() {
  return {
    selectedIds: [],
    buildMode: null,
    trainFromId: null,
    hoverTile: null,
    stackMode: 'spread',
  };
}

/**
 * Resolve selected IDs to live entities (drops IDs whose entity is gone or dead).
 * Side-effect: rewrites selectedIds to the surviving set.
 */
export function resolveSelected(client, entities) {
  const live = [];
  const ids = [];
  for (const id of client.selectedIds) {
    const e = entities.byId(id);
    if (e && e.hp > 0) { live.push(e); ids.push(id); }
  }
  if (ids.length !== client.selectedIds.length) {
    client.selectedIds = ids;
  }
  return live;
}

/** True if entity id is currently selected. */
export function isSelected(client, id) {
  return client.selectedIds.indexOf(id) !== -1;
}
