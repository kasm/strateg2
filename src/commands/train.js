// 'train' command: queue a unit at a building.
//
// Shape:
//   { type:'train', playerId, tick, seq, buildingId, unitKind:'peasant'|'swordsman'|'archer' }

export function validateTrain(deps, cmd) {
  const { config, state, entities } = deps;
  if (typeof cmd.buildingId !== 'number') return { ok: false, reason: 'bad building id' };
  const b = entities.byId(cmd.buildingId);
  if (!b || b.hp <= 0 || b.type !== 'building') return { ok: false, reason: 'no building' };
  if (b.owner !== cmd.playerId) return { ok: false, reason: 'not owner' };
  const allowed = config.building[b.kind].trains;
  if (!allowed.includes(cmd.unitKind)) return { ok: false, reason: 'building cant train this' };
  const def = config.unit[cmd.unitKind];
  if (!def) return { ok: false, reason: 'bad unit kind' };
  const me = state.players[cmd.playerId];
  if (!me || me.gold < def.cost.gold) return { ok: false, reason: 'cant afford' };
  return { ok: true };
}

export function applyTrain(deps, cmd) {
  const { config, state, entities } = deps;
  const b = entities.byId(cmd.buildingId);
  const def = config.unit[cmd.unitKind];
  state.players[cmd.playerId].gold -= def.cost.gold;
  b.trainQueue.push(cmd.unitKind);
}
