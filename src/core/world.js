// ORCHESTRATOR: dependency-injection container for the SIMULATION only.
// Builds the deterministic, headless world: state + map + entities + combat + units + AI + commands.
// No DOM, no rendering, no input — those live in `client/bootstrap.js`.
//
// This is the file a server bootstrap would also import: same wiring, no canvas required.

import { createGameState }   from './game-state.js';
import { createMap }         from '../modules/map/index.js';
import { createPathfinding } from '../modules/pathfinding/index.js';
import { createEntities }    from '../modules/entities/index.js';
import { createCombat }      from '../modules/combat/index.js';
import { createUnits }       from '../modules/units/index.js';
import { createAI }          from '../modules/ai/index.js';
import { createCommands }    from '../commands/index.js';
import { createRecorder }    from '../replay/recorder.js';

/**
 * @typedef {Object} SimWorld
 * @property {import('./game-state.js').GameState} state
 * @property {import('./config.js').GameConfig} config
 * @property {import('../modules/map/index.js').MapModule} map
 * @property {import('../modules/pathfinding/index.js').Pathfinding} pathfinding
 * @property {import('../modules/entities/index.js').EntitiesModule} entities
 * @property {import('../modules/units/index.js').UnitsModule} units
 * @property {import('../modules/combat/index.js').CombatModule} combat
 * @property {import('../modules/ai/index.js').AIModule} ai
 * @property {import('../commands/index.js').CommandsModule} commands
 * @property {import('../replay/recorder.js').Recorder} recorder
 */

/**
 * Build a fully wired headless simulation world.
 * @param {import('./config.js').GameConfig} config
 * @param {{ mapW?: number, mapH?: number }} [opts]
 * @returns {SimWorld}
 */
export function createWorld(config, opts = {}) {
  const state       = createGameState(config);
  const map         = createMap({ config, mapW: opts.mapW, mapH: opts.mapH });
  const pathfinding = createPathfinding({ map });
  const entities    = createEntities({ state, config, map, pathfinding });
  const combat      = createCombat({ state, config, map, entities, pathfinding });
  const units       = createUnits({ state, config, map, pathfinding, entities, combat });
  // Resolve the units <-> combat cycle: combat's melee/archer steps need movement helpers.
  combat.attachUnits(units);
  // Replay recorder — captures every applied command so a match can be
  // reconstructed deterministically (see src/replay/). Always on; cheap.
  const recorder    = createRecorder();
  // Command dispatcher — the only mutator of sim state outside the per-tick steps.
  // Drained at the start of every tick (see core/game-loop.js).
  const commands    = createCommands({ state, config, map, entities, units, pathfinding, recorder });
  const ai          = createAI({ state, config, entities, map, commands });

  return { state, config, map, pathfinding, entities, units, combat, ai, commands, recorder };
}
