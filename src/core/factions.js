// Faction registry — single source of truth for "what kinds of sides exist in a match".
//
// The codebase historically modeled sides as the literal strings 'red' / 'blue' /
// 'neutral', and most legacy code still does (binary-opponent AI, render colours,
// replay encoding). Those sites are stable and intentionally not migrated here.
//
// New code that needs to ask faction questions ("is this entity hostile?", "does
// this side count toward victory?", "is there an AI driving it?") must go
// through this module. That keeps PvE (the `wild` faction), and any future
// faction (co-op allies, environmental hazards), describable without bolting
// another magic string onto every call site.
//
// Pure data + small predicates. No state, no mutation. Safe to import from
// anywhere in the sim — same shape every call.

/**
 * @typedef {Object} FactionDef
 * @property {string}  id                       - canonical id (matches entity.owner)
 * @property {boolean} isPlayer                 - human/AI-controlled side with treasury, training, etc.
 * @property {boolean} participatesInVictory    - elimination of this faction influences win/loss
 * @property {boolean} hasTreasury              - has a `players[id]` resource bag
 * @property {string}  colorKey                 - lookup key in config.colors / config.colors[`${id}Light`]
 * @property {string}  label                    - HUD label
 * @property {ReadonlyArray<string>} hostileTo  - faction ids this side will attack on sight
 */

/** @type {Readonly<Record<string, FactionDef>>} */
export const FACTIONS = Object.freeze({
  red: Object.freeze({
    id: 'red',
    isPlayer: true,
    participatesInVictory: true,
    hasTreasury: true,
    colorKey: 'red',
    label: 'Red',
    hostileTo: Object.freeze(['blue', 'wild']),
  }),
  blue: Object.freeze({
    id: 'blue',
    isPlayer: true,
    participatesInVictory: true,
    hasTreasury: true,
    colorKey: 'blue',
    label: 'Blue',
    hostileTo: Object.freeze(['red', 'wild']),
  }),
  neutral: Object.freeze({
    id: 'neutral',
    isPlayer: false,
    participatesInVictory: false,
    hasTreasury: false,
    colorKey: 'neutral',
    label: 'Neutral',
    hostileTo: Object.freeze([]),
  }),
  // PvE-only. Spawned by the pve module when config.pve.enabled. Has no
  // treasury and is invisible to victoryCheck — destroying every wild
  // structure does not end the match (it just removes the threat).
  wild: Object.freeze({
    id: 'wild',
    isPlayer: false,
    participatesInVictory: false,
    hasTreasury: false,
    colorKey: 'wild',
    label: 'Wild',
    hostileTo: Object.freeze(['red', 'blue']),
  }),
});

/** All known faction ids. */
export function list() {
  return Object.keys(FACTIONS);
}

/** Faction defs for sides that act like a player (own a treasury, get trained units, can win). */
export function players() {
  return list().filter((id) => FACTIONS[id].isPlayer);
}

/** Faction defs that win/lose: only these are checked by elimination-style victory. */
export function victoryParticipants() {
  return list().filter((id) => FACTIONS[id].participatesInVictory);
}

/**
 * Lookup. Throws on unknown id — callers should never invent owners at runtime.
 * @param {string} id
 * @returns {FactionDef}
 */
export function get(id) {
  const f = FACTIONS[id];
  if (!f) throw new Error(`unknown faction: ${id}`);
  return f;
}

/** Is `id` a real, registered faction? */
export function isKnown(id) {
  return Object.prototype.hasOwnProperty.call(FACTIONS, id);
}

/** Convenience predicates — fast paths for the common questions. */
export function isPlayer(id)              { return isKnown(id) && FACTIONS[id].isPlayer; }
export function participatesInVictory(id) { return isKnown(id) && FACTIONS[id].participatesInVictory; }
export function hasTreasury(id)           { return isKnown(id) && FACTIONS[id].hasTreasury; }

/**
 * Will an `a`-owned entity attack a `b`-owned entity on sight?
 * Symmetric in practice (registry keeps the lists in sync), but the function
 * is directional so future asymmetries (e.g. "wild ignores other wild") have a
 * natural home.
 * @param {string} a
 * @param {string} b
 */
export function isHostileBetween(a, b) {
  if (!isKnown(a) || !isKnown(b)) return false;
  if (a === b) return false;
  return FACTIONS[a].hostileTo.includes(b);
}
