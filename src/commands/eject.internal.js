// 'eject' command: eject all garrisoned units from a tower.
//
// Shape:
//   { type:'eject', playerId, tick, seq, buildingId }

export function validateEject(deps, cmd) {
  const { entities } = deps;
  if (typeof cmd.buildingId !== 'number') return { ok: false, reason: 'bad building id' };
  const b = entities.byId(cmd.buildingId);
  if (!b || b.hp <= 0 || b.type !== 'building' || b.kind !== 'tower') {
    return { ok: false, reason: 'not a tower' };
  }
  if (b.owner !== cmd.playerId) return { ok: false, reason: 'not owner' };
  return { ok: true };
}

export function applyEject(deps, cmd) {
  const { entities } = deps;
  const tower = entities.byId(cmd.buildingId);
  entities.ejectAllFromTower(tower);
}
