// Effective unit stats — the single insertion point for passive upgrades.
//
// `unitStat(deps, unit, stat)` returns the unit's base config stat adjusted by the
// owning player's completed research. Combat and movement read stats exclusively
// through here, so a research effect of `{type:'stat',...}` is the only thing that
// has to change to make units stronger.
//
// Modifiers are precomputed into `players[owner].statMods` by `rebuildStatMods`
// (called when research completes — see commands/research.js / combat/production.js),
// so the per-tick combat path stays a plain nested lookup, not a research scan.
//
// `deps` must carry `config` and `state` — the combat and units module dep objects
// both do. A unit with no modifiers, a neutral owner, or a missing statMods table all
// fall through to the raw config value, so this is behaviour-preserving until a
// research effect actually exists.

/**
 * @param {{config:Object, state:Object}} deps
 * @param {{owner:string, kind:string}} unit
 * @param {string} stat
 * @returns {number}
 */
export function unitStat(deps, unit, stat) {
  const { config, state } = deps;
  const base = config.unit[unit.kind]?.[stat] ?? 0;
  const m = state.players[unit.owner]?.statMods?.unit?.[unit.kind]?.[stat];
  if (!m) return base;
  return (base + (m.add || 0)) * (m.mult || 1);
}

/**
 * Recompute `player.statMods` from the player's completed research. Idempotent —
 * call it after every research completion. A player with no `research` field (or no
 * `config.research` table) gets an empty table, which `unitStat` treats as "no mods".
 *
 * @param {Object} config
 * @param {Object} player  - a player resource-bag from state.players
 */
export function rebuildStatMods(config, player) {
  const mods = { unit: {} };
  const done = player.research?.done || [];
  for (const id of done) {
    const def = config.research?.[id];
    if (!def) continue;
    for (const eff of def.effects || []) {
      if (eff.type !== 'stat' || eff.target !== 'unit') continue;
      const kindSlot = (mods.unit[eff.kind] ||= {});
      const cur = (kindSlot[eff.stat] ||= { add: 0, mult: 1 });
      if (eff.add)  cur.add  += eff.add;
      if (eff.mult) cur.mult *= eff.mult;
    }
  }
  player.statMods = mods;
}
