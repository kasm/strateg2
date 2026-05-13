// Tunable constants. All game balance lives here.
const CFG = {
  tile: 32,
  mapW: 30,
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
    goldMine:      { hp: 1000, w: 2, h: 2, cost: null, trains: [] },
  },

  resources: {
    forestWood: 100,    // wood per forest tile
    goldPerMine: 10000, // gold pool per mine
    gatherTime: 1.0,    // seconds per gather tick
    gatherAmount: 5,
  },

  arrowSpeed: 12, // tiles/sec
  tickRate: 30,   // updates per second

  ai: {
    decideEvery: 1.5,        // seconds
    minPeasants: 5,
    armyThreshold: 6,        // attack once this many combat units exist
    waveCooldown: 30,        // seconds between attack decisions
  },

  startResources: { gold: 300, wood: 200 },
};
