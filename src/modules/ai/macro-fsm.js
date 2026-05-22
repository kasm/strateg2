// Internal: phase state-machine MACRO layer (used by the adaptive and hybrid AIs).
//
// A single AI cycles through five phases. Each phase is a small policy built from the
// shared econ.js / compose.js primitives; transitions are driven by the assess.js
// snapshot (army size, power balance, threat distance). A threat at the doorstep
// overrides any non-push phase into `defend`.
//
//   opening -> build economy + first archery, trickle peasants
//   expand  -> add a barracks, grow economy, start the army
//   mass    -> pump army + counter-pick towers until strong enough to attack
//   push    -> send attack waves at the enemy base
//   defend  -> hold behind towers, recall the field army, garrison archers

import { assignEconomy, buildNext, buildTowers, trainArmy, trainPeasants } from './econ.js';
import { counterPick, shouldAttack, attackTarget } from './compose.js';
import { safeTile } from './tactics.js';
import { garrisonIdleArchers } from './common.js';

const OPENING_BUILDS = ['arrowBuilding', 'archeryRange'];

function setPhase(memory, phase, state) {
  if (memory.phase === phase) return;
  memory.phase = phase;
  memory.phaseSince = state.tick;
}

/** Pure transition function — returns the phase to run this tick. */
function nextPhase(memory, snap, config) {
  const fsm = config.ai.fsm;
  const threatened = snap.threatTiles <= fsm.defendThreatTiles;
  const phase = memory.phase;

  // A real threat overrides everything except an in-progress all-in push.
  if (threatened && phase !== 'push' && phase !== 'defend') return 'defend';

  switch (phase) {
    case 'opening':
      return snap.has('archeryRange') ? 'expand' : 'opening';
    case 'expand':
      return snap.army.length >= fsm.massArmy ? 'mass' : 'expand';
    case 'mass':
      return shouldAttack(snap, config) ? 'push' : 'mass';
    case 'push':
      if (snap.fieldArmy.length < 3) return 'mass';            // army spent — rebuild
      if (snap.myPower < snap.enemyPower) return 'defend';      // losing — fall back
      return 'push';
    case 'defend':
      return (!threatened && snap.myPower >= snap.enemyPower) ? 'mass' : 'defend';
    default:
      return 'opening';
  }
}

/** Wave attack at the enemy base, gated by the shared wave cooldown. Shared with macro-utility. */
export function attackWave(snap, deps) {
  const { config, commands, owner, ai } = deps;
  if (ai.waveTimer > 0 || snap.fieldArmy.length < 3) return;
  const target = attackTarget(snap, config);
  if (!target) return;
  commands.submit({
    type: 'order', playerId: owner,
    unitIds: snap.fieldArmy.map(u => u.id),
    target: { kind: 'entity', id: target.id },
  });
  ai.waveTimer = config.ai.waveCooldown;
}

/**
 * Run the macro phase machine for one decide pass.
 * @param {import('./memory.js').AIMemory} memory
 * @param {Object} snap   - assess() snapshot
 * @param {Object} deps   - { state, config, entities, map, commands, owner, ai }
 */
export function macroFsm(memory, snap, deps) {
  const { state, config, entities, commands, owner } = deps;
  const shared = config.ai.shared;
  const fsm = config.ai.fsm;

  setPhase(memory, nextPhase(memory, snap, config), state);

  const comp = counterPick(snap, memory, config);
  const budget = { gold: snap.gold, wood: snap.wood };
  const woodBias = !snap.has('arrowBuilding') && snap.wood < 200;
  const maxGatherers = snap.has('arrowBuilding') ? shared.maxGatherers : Infinity;
  assignEconomy(deps, snap, { woodBias, maxGatherers });

  switch (memory.phase) {
    case 'opening':
      buildNext(deps, snap, budget, OPENING_BUILDS);
      trainPeasants(deps, snap, budget, {
        minPeasants: shared.minPeasants,
        reserveGold: snap.has('arrowBuilding') ? 0 : config.building.arrowBuilding.cost.gold,
      });
      break;

    case 'expand':
      buildNext(deps, snap, budget, ['barracks']);
      if (snap.army.length >= fsm.expandArmy) buildTowers(deps, snap, budget, 1);
      trainPeasants(deps, snap, budget, { minPeasants: shared.minPeasants });
      trainArmy(deps, snap, budget, comp.prefer);
      break;

    case 'mass':
      if (comp.wantTower) buildTowers(deps, snap, budget, shared.towerTarget);
      trainPeasants(deps, snap, budget, { minPeasants: shared.minPeasants });
      trainArmy(deps, snap, budget, comp.prefer);
      break;

    case 'push':
      trainArmy(deps, snap, budget, comp.prefer);
      attackWave(snap, deps);
      break;

    case 'defend': {
      buildTowers(deps, snap, budget, shared.towerTarget);
      trainArmy(deps, snap, budget, 'archer');
      trainPeasants(deps, snap, budget, { minPeasants: shared.minPeasants });
      garrisonIdleArchers(config, entities, commands, owner);
      // Recall the field army to a walkable rally tile near the Town Hall; micro then
      // takes over and fights any intruder. The rally tile must be walkable (not inside
      // the Town Hall footprint), so it is found the same way a retreat tile is.
      const rally = safeTile(snap, deps.map, config);
      if (deps.ai.waveTimer <= 0 && snap.fieldArmy.length > 0 && rally) {
        commands.submit({
          type: 'order', playerId: owner,
          unitIds: snap.fieldArmy.map(u => u.id),
          target: { kind: 'tile', x: rally.x, y: rally.y },
        });
        deps.ai.waveTimer = config.ai.waveCooldown / 2;
      }
      break;
    }
  }
}
