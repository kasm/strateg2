// Pluggable victory check.
//
// Replaces the hardcoded "wipe every red/blue non-mine building" rule. The
// active condition is chosen by config.victory.mode; each mode is a small
// pure function from world -> { gameOver: string|null }, where gameOver is
// either a winning faction id, a sentinel like 'draw', or null if the match
// continues.
//
// MVP ships one mode (`eliminateOpponent`) which preserves today's behaviour
// while routing through the faction registry so a third faction (wild) does
// not accidentally fulfil or block a win. New modes (`surviveWaves`,
// `defendStructure`, `reachTech`) plug in without touching game-loop.

import { victoryParticipants } from './factions.js';

/**
 * @typedef {Object} VictoryConfig
 * @property {'eliminateOpponent'} mode
 */

/**
 * Elimination victory: a player-faction loses when it has no buildings left
 * other than resource nodes (gold mines). Last faction standing wins. If
 * multiple are eliminated on the same tick, the order from victoryParticipants()
 * decides — deterministic, matches the legacy red/blue check.
 *
 * @param {import('./world.js').SimWorld} w
 * @returns {string|null} winning faction id, or null
 */
function eliminateOpponent(w) {
  const survivors = [];
  for (const fid of victoryParticipants()) {
    const buildings = w.entities.buildingsOf(fid).filter((b) => b.kind !== 'goldMine');
    if (buildings.length > 0) survivors.push(fid);
  }
  if (survivors.length === 1) return survivors[0];
  if (survivors.length === 0) return 'draw';
  return null;
}

const MODES = {
  eliminateOpponent,
};

/**
 * Run the configured victory check. Caller assigns the result to state.gameOver.
 * @param {import('./world.js').SimWorld} w
 * @returns {string|null}
 */
export function checkVictory(w) {
  const mode = w.config.victory?.mode ?? 'eliminateOpponent';
  const fn = MODES[mode];
  if (!fn) throw new Error(`unknown victory mode: ${mode}`);
  return fn(w);
}
