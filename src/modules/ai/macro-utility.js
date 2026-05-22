// Internal: utility-scored MACRO layer (used by the Utility AI).
//
// Instead of a phase script, every macro action — build a building, train a unit,
// launch an attack — is a candidate with a numeric utility score. Candidates are run
// in descending score order, each spending from a shared shadow budget, so the most
// valuable affordable actions happen first and the AI never over-commits in one pass.
//
// Scores are weight (config.ai.utility.w*) times a situational factor in ~[0,1].

import { assignEconomy, buildOne, trainPeasants } from './econ.js';
import { counterPick, requiredAttackPower } from './compose.js';
import { attackWave } from './macro-fsm.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {import('./memory.js').AIMemory} memory
 * @param {Object} snap  - assess() snapshot
 * @param {Object} deps  - { state, config, entities, map, commands, owner, ai }
 */
export function macroUtility(memory, snap, deps) {
  const { config, commands, owner, ai } = deps;
  const shared = config.ai.shared;
  const w = config.ai.utility;
  const comp = counterPick(snap, memory, config);

  // Peasants always gather — free, no scoring needed.
  assignEconomy(deps, snap, {
    woodBias: !snap.has('arrowBuilding') && snap.wood < 200,
    maxGatherers: snap.has('arrowBuilding') ? shared.maxGatherers : Infinity,
  });

  const budget = { gold: snap.gold, wood: snap.wood };
  const barracks = snap.myBuildings.find(b => b.kind === 'barracks');
  const range    = snap.myBuildings.find(b => b.kind === 'archeryRange');

  const trainAt = (building, kind) => {
    if (!building || building.trainQueue.length >= 2) return;
    const cost = config.unit[kind].cost.gold;
    if (budget.gold < cost) return;
    commands.submit({ type: 'train', playerId: owner, buildingId: building.id, unitKind: kind });
    budget.gold -= cost;
  };

  const candidates = [];
  const add = (score, run) => { if (score > 0) candidates.push({ score, run }); };

  // --- economy buildings ---
  if (!snap.has('arrowBuilding')) {
    add(w.wBuildEcon * 1.2, () => buildOne(deps, snap, budget, 'arrowBuilding'));
  }
  if (!snap.has('archeryRange')) {
    add(w.wBuildEcon * 1.0, () => buildOne(deps, snap, budget, 'archeryRange'));
  }
  if (!snap.has('barracks')) {
    add(w.wBuildEcon * (0.55 + (comp.prefer === 'swordsman' ? 0.35 : 0)),
      () => buildOne(deps, snap, budget, 'barracks'));
  }

  // --- towers (defensive) ---
  if (snap.towerCount < shared.towerTarget) {
    const towerNeed = clamp01(0.3 + snap.enemyArmy.length * 0.12 + (snap.threatTiles < 16 ? 0.4 : 0));
    add(w.wTower * towerNeed, () => buildOne(deps, snap, budget, 'tower'));
  }

  // --- peasant economy ---
  if (snap.peasants.length < shared.minPeasants) {
    const deficit = (shared.minPeasants - snap.peasants.length) / shared.minPeasants;
    add(w.wTrainPeasant * deficit, () => trainPeasants(deps, snap, budget, { minPeasants: shared.minPeasants }));
  }

  // --- army training ---
  if (barracks) {
    add(w.wTrainArmy * (comp.prefer === 'swordsman' ? 1.0 : 0.5), () => trainAt(barracks, 'swordsman'));
  }
  if (range) {
    add(w.wTrainArmy * (comp.prefer === 'archer' ? 1.0 : 0.6), () => trainAt(range, 'archer'));
  }

  // --- attack ---
  if (ai.waveTimer <= 0 && snap.fieldArmy.length >= 3) {
    const edge = clamp01(snap.myPower / requiredAttackPower(snap, config) - 1);
    add(w.wAttack * edge, () => attackWave(snap, deps));
  }

  // Run candidates best-first; each spends from the shared budget.
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) c.run();
}
