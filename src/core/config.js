/**
 * Game balance constants. Pure data — no behavior, no state.
 *
 * @typedef {Object} UnitDef
 * @property {number} hp
 * @property {number} dmg
 * @property {number} range
 * @property {number} cooldown   - seconds between attacks
 * @property {number} speed      - tiles per second
 * @property {{gold:number}} cost
 * @property {number} train      - seconds to train at a building
 * @property {number} [carry]    - peasant carry capacity
 * @property {number} [quiverMax] - archer quiver max
 *
 * @typedef {Object} BuildingDef
 * @property {number} hp
 * @property {number} w
 * @property {number} h
 * @property {{gold:number,wood:number}|null} cost
 * @property {string[]} trains
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
 * @property {{forestWood:number,goldPerMine:number,gatherTime:number,gatherAmount:number}} resources
 * @property {number} arrowSpeed
 * @property {number} tickRate
 * @property {{decideEvery:number,minPeasants:number,armyThreshold:number,waveCooldown:number}} ai
 * @property {{gold:number,wood:number}} startResources
 */

/** @type {GameConfig} */
export const CONFIG = {
  tile: 32,
  mapW: 42,
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
    peasant:   { hp: 25, dmg: 2,  range: 1, cooldown: 1.0, speed: 2.2, cost: { gold: 50 },  train: 5,  carry: 5 },
    swordsman: { hp: 60, dmg: 8,  range: 1, cooldown: 1.0, speed: 2.0, cost: { gold: 80 },  train: 8 },
    archer:    { hp: 35, dmg: 6,  range: 6, cooldown: 1.2, speed: 2.0, cost: { gold: 70 },  train: 8, quiverMax: 10 },
  },

  building: {
    townHall:      { hp: 400, w: 3, h: 3, cost: null,                  trains: ['peasant'] },
    barracks:      { hp: 250, w: 2, h: 2, cost: { gold: 200, wood: 100 }, trains: ['swordsman'] },
    archeryRange:  { hp: 220, w: 2, h: 2, cost: { gold: 200, wood: 100 }, trains: ['archer'] },
    arrowBuilding: { hp: 180, w: 2, h: 2, cost: { gold: 100, wood: 150 }, trains: [], woodCap: 20, arrowCap: 30, arrowTime: 1.5, woodPerArrow: 1 },
    tower:         { hp: 250, w: 2, h: 2, cost: { gold: 150, wood: 100 }, trains: [], garrisonMax: 4, rangeMult: 1.5, dmgMult: 2, arrowCap: 20, distributeTime: 0.25 },
    goldMine:      { hp: 1000, w: 2, h: 2, cost: null, trains: [] },
  },

  resources: {
    forestWood: 100,
    goldPerMine: 10000,
    gatherTime: 1.0,
    gatherAmount: 5,
  },

  arrowSpeed: 12,
  tickRate: 30,

  ai: {
    decideEvery: 1.5,
    minPeasants: 5,
    armyThreshold: 6,
    waveCooldown: 30,
  },

  startResources: { gold: 300, wood: 200 },
};
