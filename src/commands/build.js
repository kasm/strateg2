// 'build' command: place a building at a tile.
//
// Shape:
//   { type:'build', playerId, tick, seq, kind:'barracks'|'archeryRange'|'arrowBuilding'|'tower', tileX, tileY }

import { canAfford, spend } from '../core/economy.js';
import { isUnlocked } from '../core/research.js';

export function validateBuild(deps, cmd) {
  const { config, map, state } = deps;
  const def = config.building[cmd.kind];
  if (!def || !def.cost) return { ok: false, reason: 'not buildable' };
  if (typeof cmd.tileX !== 'number' || typeof cmd.tileY !== 'number') {
    return { ok: false, reason: 'bad tile' };
  }
  if (!map.canPlaceBuilding(cmd.kind, cmd.tileX, cmd.tileY)) {
    return { ok: false, reason: 'tile blocked' };
  }
  const me = state.players[cmd.playerId];
  if (!me) return { ok: false, reason: 'no player' };
  if (!isUnlocked(state, cmd.playerId, def)) {
    return { ok: false, reason: 'not researched' };
  }
  if (!canAfford(me, def.cost)) {
    return { ok: false, reason: 'cant afford' };
  }
  return { ok: true };
}

export function applyBuild(deps, cmd) {
  const { config, state, entities } = deps;
  const def = config.building[cmd.kind];
  const me = state.players[cmd.playerId];
  spend(me, def.cost);
  entities.makeBuilding(cmd.kind, cmd.playerId, cmd.tileX, cmd.tileY);
}
