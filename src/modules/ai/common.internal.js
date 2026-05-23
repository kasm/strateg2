// Internal: helpers shared by the AI deciders (decision-att.js, decision-def.js).
// Like the deciders, these never mutate sim state — they only submit commands.

/**
 * Assign idle peasants of `owner` to gold/wood gathering, kept roughly balanced.
 * `woodBias` skews two extra peasants toward wood (used while wood is the bottleneck).
 * `maxGatherers` caps how many peasants end up gathering — any beyond the cap are left
 * idle on purpose so auto-logistics (tryAutoLogistics) can pick them up as haulers.
 */
export function assignIdlePeasants(entities, map, commands, owner, { woodBias, maxGatherers = Infinity }) {
  const peasants = entities.unitsOf(owner).filter(u => u.kind === 'peasant');
  let goldCount = peasants.filter(p => p.job === 'gather' && p.gatherResource === 'gold').length;
  let woodCount = peasants.filter(p => p.job === 'gather' && p.gatherResource === 'wood').length;
  for (const p of peasants) {
    if (p.job) continue;
    if (goldCount + woodCount >= maxGatherers) break;
    const preferWood = woodBias ? woodCount < goldCount + 2 : woodCount < goldCount;
    if (preferWood) {
      const tile = map.findNearestResourceTile('wood', p.x, p.y);
      if (tile) {
        commands.submit({
          type: 'order', playerId: owner, unitIds: [p.id],
          target: { kind: 'tile', x: tile.x, y: tile.y },
        });
        woodCount++;
      }
    } else {
      const mine = entities.nearestOf(
        e => e.type === 'building' && e.kind === 'goldMine' && e.gold > 0,
        p.x, p.y,
      );
      if (mine) {
        commands.submit({
          type: 'order', playerId: owner, unitIds: [p.id],
          target: { kind: 'entity', id: mine.id },
        });
        goldCount++;
      }
    }
  }
}

/**
 * Send idle, un-garrisoned archers of `owner` into the nearest tower with room.
 * A shadow garrison counter prevents oversubscribing one tower within a single pass.
 * `excludeIds` (optional Set) skips archers the caller has earmarked for something
 * else this pass — e.g. Def AI's counter-attack defenders.
 */
export function garrisonIdleArchers(config, entities, commands, owner, excludeIds = null) {
  const towers = entities.buildingsOf(owner).filter(b => b.kind === 'tower');
  if (towers.length === 0) return;
  const gMax = config.building.tower.garrisonMax;
  const shadow = new Map(towers.map(t => [t.id, t.garrisonIds.length]));
  const idleArchers = entities.unitsOf(owner).filter(u =>
    u.kind === 'archer' && u.insideBuildingId == null && (u.job == null || u.job === 'attack')
    && !(excludeIds && excludeIds.has(u.id))
  );
  for (const a of idleArchers) {
    let best = null, bd = Infinity;
    for (const t of towers) {
      if (shadow.get(t.id) >= gMax) continue;
      const cx = (t.tileX + t.w / 2) * config.tile;
      const cy = (t.tileY + t.h / 2) * config.tile;
      const d = (cx - a.x) ** 2 + (cy - a.y) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) {
      commands.submit({
        type: 'order', playerId: owner, unitIds: [a.id],
        target: { kind: 'entity', id: best.id },
      });
      shadow.set(best.id, shadow.get(best.id) + 1);
    }
  }
}
