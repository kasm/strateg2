// Treasury arithmetic. Pure functions over a player resource bag — no state, no config.
//
// A "player" here is the resource-bag object from game-state.js (`state.players[id]`):
// resource id -> amount. A "cost" is a generic resource map (resource id -> amount),
// the same shape used by `config.building[kind].cost`, `config.unit[kind].cost`, and
// `config.research[id].cost`. Treating both as id-keyed maps is what lets a new
// resource be added in config.js without touching the spend paths.

/** True when the player can pay every line of `cost`. A null/absent cost is free. */
export function canAfford(player, cost) {
  if (!cost) return true;
  for (const id of Object.keys(cost)) {
    if ((player[id] || 0) < cost[id]) return false;
  }
  return true;
}

/** Deduct `cost` from the player bag. Caller must have checked canAfford first. */
export function spend(player, cost) {
  if (!cost) return;
  for (const id of Object.keys(cost)) {
    player[id] = (player[id] || 0) - cost[id];
  }
}

/** Return `cost` to the player bag (e.g. a cancelled queue item). */
export function refund(player, cost) {
  if (!cost) return;
  for (const id of Object.keys(cost)) {
    player[id] = (player[id] || 0) + cost[id];
  }
}

/** Seed/reset a player resource bag from config.startResources, in place. */
export function seedTreasury(player, config) {
  for (const id of Object.keys(config.resourceTypes)) {
    if (config.resourceTypes[id].treasury) {
      player[id] = config.startResources[id] || 0;
    }
  }
}
