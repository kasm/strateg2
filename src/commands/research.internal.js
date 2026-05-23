// 'research' command: queue a research at its host building.
//
// Shape:
//   { type:'research', playerId, tick, seq, buildingId, researchId }
//
// Mirrors the 'train' command: validate ownership + affordability + prerequisites,
// then push a job onto the building's researchQueue. combat/production.js advances
// the timer and calls applyResearchComplete when it finishes.

import { canAfford, spend } from '../core/economy.js';

export function validateResearch(deps, cmd) {
  const { config, state, entities } = deps;
  if (typeof cmd.buildingId !== 'number') return { ok: false, reason: 'bad building id' };
  const b = entities.byId(cmd.buildingId);
  if (!b || b.hp <= 0 || b.type !== 'building') return { ok: false, reason: 'no building' };
  if (b.owner !== cmd.playerId) return { ok: false, reason: 'not owner' };

  const bDef = config.building[b.kind];
  if (!bDef.researches || !bDef.researches.includes(cmd.researchId)) {
    return { ok: false, reason: 'building cant research this' };
  }
  const rDef = config.research[cmd.researchId];
  if (!rDef) return { ok: false, reason: 'bad research id' };

  const me = state.players[cmd.playerId];
  if (!me) return { ok: false, reason: 'no player' };
  const research = me.research;
  if (research.done.includes(cmd.researchId))    return { ok: false, reason: 'already researched' };
  if (research.pending.includes(cmd.researchId)) return { ok: false, reason: 'already in progress' };
  for (const req of rDef.requires) {
    if (!research.done.includes(req)) return { ok: false, reason: 'missing prerequisite' };
  }
  if (!canAfford(me, rDef.cost)) return { ok: false, reason: 'cant afford' };
  return { ok: true };
}

export function applyResearch(deps, cmd) {
  const { config, state, entities } = deps;
  const b = entities.byId(cmd.buildingId);
  const rDef = config.research[cmd.researchId];
  const me = state.players[cmd.playerId];
  spend(me, rDef.cost);
  b.researchQueue.push({ id: cmd.researchId, timer: 0 });
  me.research.pending.push(cmd.researchId);
}
