// Internal: text HUD (resources, selection info).

export function updateHUD(state, config, entities) {
  const me = state.players.red;
  document.getElementById('gold').textContent = Math.floor(me.gold);
  document.getElementById('wood').textContent = Math.floor(me.wood);
  document.getElementById('pop').textContent  = entities.unitsOf('red').length;

  const info = document.getElementById('selection-info');
  if (state.selected.length === 0) {
    info.textContent = '(no selection)';
  } else if (state.selected.length === 1) {
    info.textContent = describeEntity(state.selected[0], config);
  } else {
    const counts = {};
    for (const s of state.selected) counts[s.kind] = (counts[s.kind] || 0) + 1;
    info.textContent = 'Selected: ' + Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ');
  }
}

function describeEntity(e, config) {
  if (e.type === 'unit') {
    let s = `${e.kind} (${e.owner})\nHP ${Math.ceil(e.hp)}/${e.maxHp}`;
    if (e.kind === 'archer') s += `\nArrows: ${e.arrows}/${config.unit.archer.quiverMax}`;
    if (e.job)               s += `\nJob: ${e.job}`;
    if (e.carrying)          s += `\nCarrying: ${e.carrying.amount} ${e.carrying.kind}`;
    return s;
  }
  let s = `${e.kind} (${e.owner})\nHP ${Math.ceil(e.hp)}/${e.maxHp}`;
  if (e.kind === 'arrowBuilding') {
    s += `\nWood: ${e.wood}/${config.building.arrowBuilding.woodCap}` +
         `\nArrows: ${e.arrows}/${config.building.arrowBuilding.arrowCap}`;
  }
  if (e.kind === 'goldMine')          s += `\nGold left: ${e.gold}`;
  if (e.trainQueue && e.trainQueue.length) {
    s += `\nQueue: ${e.trainQueue.join(', ')}`;
  }
  return s;
}
