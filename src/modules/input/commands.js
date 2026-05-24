// Internal: translate UI clicks into either client-local state changes (selection,
// build-mode) or commands submitted to the dispatcher. This file no longer mutates
// sim entity state directly — orders/builds/trains/eject go through commands/.
//
// Selection lives on clientState (IDs only); sim state is never touched here.

import { validateBuild } from '../../commands/index.js';

/** Selection is client-local: lives on clientState.selectedIds (IDs, not refs). */
export function selectInRect(rect, shift, { state, client }) {
  if (!shift) client.selectedIds.length = 0;
  for (const e of state.entities) {
    if (e.type !== 'unit' || e.owner !== client.playerId || e.hp <= 0) continue;
    if (e.insideBuildingId != null) continue;
    if (e.x >= rect.x && e.x <= rect.x + rect.w && e.y >= rect.y && e.y <= rect.y + rect.h) {
      if (!client.selectedIds.includes(e.id)) client.selectedIds.push(e.id);
    }
  }
}

/** Selection click — also client-local. */
export function handleLeftClick(x, y, shift, { entities, client }) {
  const e = entities.findEntityAt(x, y);
  if (!shift) client.selectedIds.length = 0;
  if (e && e.owner === client.playerId) {
    if (!client.selectedIds.includes(e.id)) client.selectedIds.push(e.id);
  } else if (e) {
    client.selectedIds.length = 0;
    client.selectedIds.push(e.id);
  }
}

/**
 * Build the per-unit list and submit an 'order' command for the human player.
 * Selected own-side units are filtered here so we only send IDs the player owns.
 */
export function submitOrderForSelected(tgt, tile, { entities, client, transport }) {
  const unitIds = [];
  for (const id of client.selectedIds) {
    const u = entities.byId(id);
    if (u && u.type === 'unit' && u.owner === client.playerId && u.hp > 0) unitIds.push(u.id);
  }
  if (unitIds.length === 0) return;
  const target = tgt
    ? { kind: 'entity', id: tgt.id }
    : { kind: 'tile', x: tile.x, y: tile.y };
  transport.submit({ type: 'order', playerId: client.playerId, unitIds, target });
}

/**
 * Submit a 'build' command. Pre-validates locally for snappy UI: only clears build-mode
 * and submits when the build is legal. (Server-authoritative MP will revalidate on its side.)
 */
export function submitBuild(tx, ty, deps) {
  const { client, transport } = deps;
  if (!client.buildMode) return false;
  const cmd = {
    type: 'build', playerId: client.playerId,
    kind: client.buildMode.kind, tileX: tx, tileY: ty,
  };
  if (!validateBuild(deps, cmd).ok) return false;
  transport.submit(cmd);
  client.buildMode = null;
  return true;
}
