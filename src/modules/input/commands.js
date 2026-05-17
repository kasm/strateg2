// Internal: translate UI clicks into either client-local state changes (selection,
// build-mode) or commands submitted to the dispatcher. This file no longer mutates
// sim entity state directly — orders/builds/trains/eject go through commands/.

import { validateBuild } from '../../commands/build.js';

/** Selection is client-local: state.selected isn't part of authoritative sim state. */
export function selectInRect(rect, shift, { state }) {
  if (!shift) state.selected.length = 0;
  for (const e of state.entities) {
    if (e.type !== 'unit' || e.owner !== 'red' || e.hp <= 0) continue;
    if (e.insideBuildingId != null) continue;
    if (e.x >= rect.x && e.x <= rect.x + rect.w && e.y >= rect.y && e.y <= rect.y + rect.h) {
      if (!state.selected.includes(e)) state.selected.push(e);
    }
  }
}

/** Selection click — also client-local. */
export function handleLeftClick(x, y, shift, { state, entities }) {
  const e = entities.findEntityAt(x, y);
  if (!shift) state.selected.length = 0;
  if (e && e.owner === 'red') {
    if (!state.selected.includes(e)) state.selected.push(e);
  } else if (e) {
    state.selected.length = 0;
    state.selected.push(e);
  }
}

/**
 * Build the per-unit list and submit an 'order' command for the human player.
 * Selected red units are filtered here so we only send IDs the player owns.
 */
export function submitOrderForSelected(tgt, tile, { state, commands }) {
  const unitIds = [];
  for (const u of state.selected) {
    if (u.type === 'unit' && u.owner === 'red' && u.hp > 0) unitIds.push(u.id);
  }
  if (unitIds.length === 0) return;
  const target = tgt
    ? { kind: 'entity', id: tgt.id }
    : { kind: 'tile', x: tile.x, y: tile.y };
  commands.submit({ type: 'order', playerId: 'red', unitIds, target });
}

/**
 * Submit a 'build' command. Pre-validates locally for snappy UI: only clears build-mode
 * and submits when the build is legal. (Server-authoritative MP will revalidate on its side.)
 */
export function submitBuild(tx, ty, deps) {
  const { state, commands } = deps;
  if (!state.buildMode) return false;
  const cmd = {
    type: 'build', playerId: 'red',
    kind: state.buildMode.kind, tileX: tx, tileY: ty,
  };
  if (!validateBuild(deps, cmd).ok) return false;
  commands.submit(cmd);
  state.buildMode = null;
  return true;
}
