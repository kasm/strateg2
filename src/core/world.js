// ORCHESTRATOR: dependency-injection container. Wires every module to its dependencies.
// This is the single place a human reader needs to look to understand the module graph.
// No business logic lives here — only construction order.

import { createGameState }   from './game-state.js';
import { createMap }         from '../modules/map/index.js';
import { createPathfinding } from '../modules/pathfinding/index.js';
import { createEntities }    from '../modules/entities/index.js';
import { createCombat }      from '../modules/combat/index.js';
import { createUnits }       from '../modules/units/index.js';
import { createAI }          from '../modules/ai/index.js';
import { createRender }      from '../modules/render/index.js';
import { createInput }       from '../modules/input/index.js';
import { createCommands }    from '../commands/index.js';

/**
 * @typedef {Object} World
 * @property {import('./game-state.js').GameState} state
 * @property {import('./config.js').GameConfig} config
 * @property {import('../modules/map/index.js').MapModule} map
 * @property {import('../modules/pathfinding/index.js').Pathfinding} pathfinding
 * @property {import('../modules/entities/index.js').EntitiesModule} entities
 * @property {import('../modules/units/index.js').UnitsModule} units
 * @property {import('../modules/combat/index.js').CombatModule} combat
 * @property {import('../modules/ai/index.js').AIModule} ai
 * @property {import('../commands/index.js').CommandsModule} commands
 * @property {import('../modules/render/index.js').RenderModule} render
 * @property {import('../modules/input/index.js').InputModule} input
 */

/**
 * Build a fully wired game world.
 * @param {import('./config.js').GameConfig} config
 * @param {{ onRestart?: () => void }} [hooks]
 * @returns {World}
 */
export function createWorld(config, hooks = {}) {
  const state       = createGameState(config);
  const map         = createMap({ config });
  const pathfinding = createPathfinding({ map });
  const entities    = createEntities({ state, config, map, pathfinding });
  const combat      = createCombat({ state, config, map, entities, pathfinding });
  const units       = createUnits({ state, config, map, pathfinding, entities, combat });
  // Resolve the units <-> combat cycle: combat's melee/archer steps need movement helpers.
  combat.attachUnits(units);
  const ai          = createAI({ state, config, entities, map });
  // Command dispatcher — the only mutator of sim state outside the per-tick steps.
  // Drained at the start of every tick (see core/game-loop.js).
  const commands    = createCommands({ state, config, map, entities, units, pathfinding });
  // Input is built before render so render can read the live drag rect.
  const input       = createInput({
    state, config, map, entities, units, pathfinding, commands,
    onRestart: hooks.onRestart,
  });
  const render      = createRender({
    state, config, map, entities,
    getDragRect: input.getDragRect,
  });

  return { state, config, map, pathfinding, entities, units, combat, ai, commands, render, input };
}
