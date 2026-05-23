// Client-only state. Lives outside GameState so the sim stays serializable and headless.
// Entity refs in here are IDs (numbers), resolved via entities.byId() at read time.
//
// Fields here are pure UX: selection set, building placement mode, the hovered tile,
// which building's train menu is open, the stack render mode, and the viewport
// camera. None of these are observed by the simulation.

import { createCamera } from './camera.js';

/**
 * @typedef {Object} ClientState
 * @property {'red'|'blue'} playerId           - which side the local player controls. Set by the transport on connect in MP; defaults to 'red' for SP.
 * @property {number[]} selectedIds            - selected entity IDs (alive-only is enforced at read sites).
 * @property {{kind:string}|null} buildMode    - non-null while placing a building.
 * @property {number|null} trainFromId         - building ID whose train menu is open.
 * @property {number|null} researchFromId      - building ID whose research menu is open.
 * @property {{x:number,y:number}|null} hoverTile
 * @property {'spread'|'overlap'|'badge'} stackMode
 * @property {import('./camera.js').Camera} camera  - viewport pan/zoom (render-only)
 */

/** @returns {ClientState} */
export function createClientState() {
  return {
    playerId: 'red',
    selectedIds: [],
    buildMode: null,
    trainFromId: null,
    researchFromId: null,
    hoverTile: null,
    stackMode: 'spread',
    camera: createCamera({ canvasW: 1152, canvasH: 640, simTile: 32 }),
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
