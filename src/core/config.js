/**
 * Game balance constants. Pure data — no behavior, no state.
 *
 * @typedef {Object} UnitDef
 * @property {'worker'|'melee'|'ranged'} role  - per-tick behaviour handler (units/index.js dispatch)
 * @property {string} shape      - render shape id (render/sprites.js)
 * @property {number} hp
 * @property {number} dmg
 * @property {number} range
 * @property {number} cooldown   - seconds between attacks
 * @property {number} speed      - tiles per second
 * @property {Object<string,number>} cost  - resource id -> amount
 * @property {number} train      - seconds to train at a building
 * @property {number} [carry]    - peasant carry capacity
 * @property {{max:number}} [quiver]  - present => unit carries arrows (factory seeds `arrows`)
 * @property {string} [requiresResearch] - research id that must be completed to train this unit
 *
 * @typedef {Object} BuildingDef
 * @property {number} hp
 * @property {number} w
 * @property {number} h
 * @property {Object<string,number>|null} cost  - resource id -> amount
 * @property {string[]} trains
 * @property {string} fill       - render fill colour (render/sprites.js)
 * @property {string} label      - HUD/render label
 * @property {string[]} [researches] - research ids hosted at this building
 * @property {string} [requiresResearch] - research id that must be completed to build this
 * @property {{resource:string,amount:number}} [node] - resource node payload (e.g. gold mine)
 * @property {number} [woodCap]
 * @property {number} [arrowCap]
 * @property {number} [arrowTime]
 * @property {number} [woodPerArrow]
 *
 * @typedef {Object} GameConfig
 * @property {number} tile
 * @property {number} mapW
 * @property {number} mapH
 * @property {Object<string,string>} colors
 * @property {Object<string,UnitDef>} unit
 * @property {Object<string,BuildingDef>} building
 * @property {{gatherTime:number,gatherAmount:number}} resources
 * @property {Object<string,ResourceDef>} resourceTypes
 * @property {Object<string,{resource:string,amount:number}>} tiles  - gatherable tile types
 * @property {Object<string,ResearchDef>} research
 * @property {number} arrowSpeed
 * @property {number} tickRate
 * @property {{decideEvery:number,microEvery:number,minPeasants:number,armyThreshold:number,waveCooldown:number,def:Object,shared:Object,fsm:Object,utility:Object}} ai
 * @property {Object<string,number>} startResources  - resource id -> starting amount
 *
 * @typedef {Object} ResourceDef
 * @property {boolean} treasury  - true if stockpiled in the player treasury and spendable on costs
 * @property {string} label      - HUD display label
 * @property {{kind:'node',building:string}|{kind:'tile',tile:string}} source
 *   Where peasants gather it from: a building node (e.g. goldMine) or a map tile type (e.g. forest).
 *
 * @typedef {Object} ResearchEffect
 * @property {'stat'|'unlock'|'ability'} type
 * @property {'unit'} [target]   - 'stat' effects: which def family the effect applies to
 * @property {string} [kind]     - 'stat'/'unlock' effects: target unit/building kind
 * @property {string} [stat]     - 'stat' effects: stat name (dmg, range, ...)
 * @property {number} [add]      - 'stat' effects: flat modifier
 * @property {number} [mult]     - 'stat' effects: multiplicative modifier
 * @property {'unit'|'building'} [what]  - 'unlock' effects: family of the unlocked kind
 *
 * @typedef {Object} ResearchDef
 * @property {Object<string,number>} cost  - resource id -> amount
 * @property {number} time          - seconds to research at the host building
 * @property {string[]} requires    - prerequisite research ids (all must be completed)
 * @property {string} researchedAt  - building kind that hosts this research
 * @property {string} label         - HUD display label
 * @property {ResearchEffect[]} effects
 */

/** @type {GameConfig} */
export const CONFIG = {
  tile: 32,
  mapW: 36,
  mapH: 20,

  colors: {
    grass: '#2c5530',
    forest: '#0f3a18',
    goldmine: '#a8862b',
    blocked: '#333',
    grid: 'rgba(0,0,0,0.12)',
    red: '#d83b3b',
    blue: '#3b6fd8',
    redLight: '#ff7575',
    blueLight: '#7da9ff',
    arrow: '#f1e7c0',
    select: '#ffe44a',
    hp: '#4caf50',
    hpBg: '#222',
  },

  unit: {
    peasant:   { role: 'worker', shape: 'circle',   hp: 25, dmg: 2, range: 1, cooldown: 1.0, speed: 2.2, cost: { gold: 50 }, train: 5, carry: 5 },
    swordsman: { role: 'melee',  shape: 'square',   hp: 60, dmg: 8, range: 1, cooldown: 1.0, speed: 2.0, cost: { gold: 80 }, train: 8 },
    archer:    { role: 'ranged', shape: 'triangle', hp: 35, dmg: 6, range: 6, cooldown: 1.2, speed: 2.0, cost: { gold: 70 }, train: 8, quiver: { max: 10 } },
  },

  building: {
    townHall:      { hp: 400,  w: 3, h: 3, cost: null,                    trains: ['peasant'],   fill: '#7a5c2e', label: 'TH' },
    barracks:      { hp: 250,  w: 2, h: 2, cost: { gold: 200, wood: 100 }, trains: ['swordsman'], fill: '#5e3b2a', label: 'Barracks' },
    archeryRange:  { hp: 220,  w: 2, h: 2, cost: { gold: 200, wood: 100 }, trains: ['archer'],    fill: '#3b5e2a', label: 'Archery' },
    arrowBuilding: { hp: 180,  w: 2, h: 2, cost: { gold: 100, wood: 150 }, trains: [], fill: '#8a7a3a', label: 'Arrow', woodCap: 20, arrowCap: 30, arrowTime: 1.5, woodPerArrow: 1 },
    tower:         { hp: 250,  w: 2, h: 2, cost: { gold: 150, wood: 100 }, trains: [], fill: '#6e6e6e', label: 'Tower', garrisonMax: 4, rangeMult: 1.5, dmgMult: 2, arrowCap: 20, distributeTime: 0.25 },
    blacksmith:    { hp: 200,  w: 2, h: 2, cost: { gold: 150, wood: 100 }, trains: [], fill: '#4a4a6e', label: 'Blacksmith', researches: ['ironWeapons', 'fletching'] },
    goldMine:      { hp: 1000, w: 2, h: 2, cost: null, trains: [], fill: '#a8862b', label: 'Mine', node: { resource: 'gold', amount: 10000 } },
  },

  resources: {
    gatherTime: 1.0,
    gatherAmount: 5,
  },

  // Treasury + map-gathered resource definitions. `source` tells the gather
  // logic where a peasant collects this resource from (see units/logistics.js):
  //   - 'node' : a building whose def carries a matching `node` payload (goldMine)
  //   - 'tile' : a map tile type carrying a matching resource (see `tiles` below)
  // Adding a new treasury resource here flows automatically through the player
  // bag (game-state.js), cost checks (core/economy.js), and the HUD.
  resourceTypes: {
    gold: { treasury: true, label: 'Gold', source: { kind: 'node', building: 'goldMine' } },
    wood: { treasury: true, label: 'Wood', source: { kind: 'tile', tile: 'forest' } },
  },

  // Gatherable map tile types: tile type id -> { resource, amount } the tile yields.
  // A peasant gathering from a tile reads `tile.resource`/`tile.amount` (set at map
  // build time, see map/grid.js). Non-gatherable tiles (grass, blocked) are omitted.
  tiles: {
    forest: { resource: 'wood', amount: 100 },
  },

  // Research / upgrade tree. Each entry is researched at its `researchedAt` building
  // (queued via the 'research' command) and, once complete, applies its `effects` to
  // the owning player. Starter content — extend or replace freely; the subsystem
  // (commands/research.js, core/research.js, core/stats.js) is fully data-driven.
  research: {
    ironWeapons: {
      cost: { gold: 150 }, time: 25, requires: [], researchedAt: 'blacksmith',
      label: 'Iron Weapons',
      effects: [{ type: 'stat', target: 'unit', kind: 'swordsman', stat: 'dmg', add: 3 }],
    },
    fletching: {
      cost: { gold: 120, wood: 60 }, time: 25, requires: [], researchedAt: 'blacksmith',
      label: 'Fletching',
      effects: [{ type: 'stat', target: 'unit', kind: 'archer', stat: 'dmg', add: 2 }],
    },
  },

  arrowSpeed: 12,
  tickRate: 30,

  ai: {
    decideEvery: 1.5,
    microEvery: 0.4,     // fast micro sub-tick interval (adaptive/utility/hybrid only)
    minPeasants: 5,
    armyThreshold: 6,
    waveCooldown: 30,
    // Tuning for the defensive "Def AI" (see modules/ai/decision-def.js).
    def: {
      towerTarget:  3,   // towers to build and hold
      minPeasants:  7,   // gatherers + arrow haulers
      maxGatherers: 5,   // gather-job cap once an Arrow Building exists; the rest haul
      threatRadius: 12,  // tiles from the Town Hall counted as "territory"
    },
    // Shared tuning for the complex AIs (adaptive / utility / hybrid).
    shared: {
      minPeasants:        6,    // peasant trickle target
      maxGatherers:       6,    // gather-job cap once an Arrow Building exists
      retreatHpFrac:      0.35, // pull an army unit back below this HP fraction
      kiteTiles:          3,    // archer backs off when a melee enemy is this close (tiles)
      focusTiles:         8,    // micro focus-fire engagement radius (tiles)
      attackPowerMargin:  1.2,  // attack only when my army power exceeds enemy's by this
      towerTarget:        3,    // towers to hold once defensive
    },
    // Phase state-machine tuning (adaptive + hybrid macro).
    fsm: {
      expandArmy:       2,   // army size that ends the opening phase
      massArmy:         7,   // army size that ends the expand phase
      pushPowerMargin:  1.2, // power ratio that flips mass -> push
      defendThreatTiles: 11, // enemy this close to the Town Hall forces the defend phase
    },
    // Utility-scoring weights (utility macro + utility/hybrid micro).
    utility: {
      wBuildEcon:    1.0,
      wTrainArmy:    1.1,
      wTrainPeasant: 0.8,
      wTower:        0.9,
      wAttack:       1.0,
      wFocusFire:    1.0,
      wRetreat:      1.5,
      wKite:         1.2,
      wGarrison:     0.6,
    },
  },

  startResources: { gold: 300, wood: 200 },
};
