// Internal: try to place a blue-owned building near a hint tile. Spends resources if it lands.

export function tryAIBuild(kind, hintX, hintY, { state, config, map, entities }) {
  const def = config.building[kind];
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = -3; dx < 3; dx++) {
      const x = hintX + dx, y = hintY + dy;
      if (!map.canPlaceBuilding(kind, x, y)) continue;
      const me = state.players.blue;
      if (me.gold < def.cost.gold || me.wood < def.cost.wood) return;
      me.gold -= def.cost.gold;
      me.wood -= def.cost.wood;
      entities.makeBuilding(kind, 'blue', x, y);
      return;
    }
  }
}
