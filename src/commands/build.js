// 'build' command: place a building at a tile.
//
// Shape:
//   { type:'build', playerId, tick, seq, kind:'barracks'|'archeryRange'|'arrowBuilding'|'tower', tileX, tileY }

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
  if (me.gold < def.cost.gold || me.wood < def.cost.wood) {
    return { ok: false, reason: 'cant afford' };
  }
  return { ok: true };
}

export function applyBuild(deps, cmd) {
  const { config, state, entities } = deps;
  const def = config.building[cmd.kind];
  const me = state.players[cmd.playerId];
  me.gold -= def.cost.gold;
  me.wood -= def.cost.wood;
  entities.makeBuilding(cmd.kind, cmd.playerId, cmd.tileX, cmd.tileY);
}
