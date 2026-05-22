// Generates the data-driven HUD DOM: the resource readouts and the build / train /
// research menus. index.html ships only empty container elements (#resources,
// #build-menu, #train-menu, #research-menu) — everything inside them is derived from
// config here, so a new building, unit, research, or treasury resource needs no HTML
// edit. Run once at bootstrap, before input handlers bind to the buttons.

/** Format a generic resource-map cost as e.g. "200g 100w" (first letter of each id). */
function costLabel(cost) {
  if (!cost) return '';
  return Object.entries(cost).map(([id, n]) => `${n}${id[0]}`).join(' ');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function buildResourceRow(config) {
  const row = document.getElementById('resources');
  if (!row) return;
  row.textContent = '';
  // One readout per treasury resource (id-keyed bag on state.players — see hud.js).
  for (const [id, def] of Object.entries(config.resourceTypes)) {
    if (!def.treasury) continue;
    const span = document.createElement('span');
    span.innerHTML = `${def.label}: <b id="res-${id}">0</b>`;
    row.appendChild(span);
  }
  // Arrows and unit count are not treasury resources but share the readout row.
  const arrows = document.createElement('span');
  arrows.innerHTML = 'Arrows: <b id="arrows-total">0</b>';
  row.appendChild(arrows);
  const pop = document.createElement('span');
  pop.id = 'pop-info';
  pop.innerHTML = 'Units: <b id="pop">0</b>';
  row.appendChild(pop);
}

function buildBuildMenu(config) {
  const menu = document.getElementById('build-menu');
  if (!menu) return;
  menu.textContent = '';
  // A building is player-buildable iff it declares a cost (townHall/goldMine do not).
  for (const [kind, def] of Object.entries(config.building)) {
    if (!def.cost) continue;
    const btn = document.createElement('button');
    btn.dataset.build = kind;
    btn.textContent = `${def.label} (${costLabel(def.cost)})`;
    menu.appendChild(btn);
  }
  const cancel = document.createElement('button');
  cancel.dataset.build = 'cancel';
  cancel.textContent = 'Cancel';
  menu.appendChild(cancel);
}

function buildTrainMenu(config) {
  const menu = document.getElementById('train-menu');
  if (!menu) return;
  menu.textContent = '';
  const title = document.createElement('span');
  title.id = 'train-title';
  title.textContent = 'Train:';
  menu.appendChild(title);
  // Union of every building's `trains` — refreshTrainMenu() shows the relevant subset.
  const trainable = new Set();
  for (const b of Object.values(config.building)) {
    for (const u of b.trains) trainable.add(u);
  }
  for (const kind of trainable) {
    const btn = document.createElement('button');
    btn.dataset.train = kind;
    btn.textContent = `${cap(kind)} (${costLabel(config.unit[kind].cost)})`;
    menu.appendChild(btn);
  }
}

function buildResearchMenu(config) {
  const menu = document.getElementById('research-menu');
  if (!menu) return;
  menu.textContent = '';
  const title = document.createElement('span');
  title.id = 'research-title';
  title.textContent = 'Research:';
  menu.appendChild(title);
  for (const [id, def] of Object.entries(config.research || {})) {
    const btn = document.createElement('button');
    btn.dataset.research = id;
    btn.textContent = `${def.label} (${costLabel(def.cost)})`;
    menu.appendChild(btn);
  }
}

/** Populate every data-driven HUD container from config. */
export function buildHudDom(config) {
  buildResourceRow(config);
  buildBuildMenu(config);
  buildTrainMenu(config);
  buildResearchMenu(config);
}
