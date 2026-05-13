// Entry point. Boots the game and runs the fixed-step update + RAF render loop.

let _lastTime = 0;
let _accumulator = 0;
const TICK_DT = 1 / CFG.tickRate;

function boot() {
  initMap();
  spawnInitialEntities();
  initInput();
  initRender();
  refreshBuildButtons();
  refreshTrainMenu();
  resetAI();
  _lastTime = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.1, (now - _lastTime) / 1000);
  _lastTime = now;
  _accumulator += dt;
  while (_accumulator >= TICK_DT) {
    tick(TICK_DT);
    _accumulator -= TICK_DT;
  }
  draw();
  requestAnimationFrame(frame);
}

function tick(dt) {
  if (STATE.gameOver) return;
  updateAI(dt);
  updateUnits(dt);
  updateProjectiles(dt);
  updateBuildings(dt);
  pruneDead();
  checkWinLose();
}

function checkWinLose() {
  const redBuildings = buildingsOf('red').filter(b => b.kind !== 'goldMine');
  const blueBuildings = buildingsOf('blue').filter(b => b.kind !== 'goldMine');
  if (redBuildings.length === 0) endGame('blue');
  else if (blueBuildings.length === 0) endGame('red');
}

function endGame(winner) {
  STATE.gameOver = winner;
  const overlay = document.getElementById('game-over');
  document.getElementById('game-over-text').textContent = (winner === 'red' ? 'Victory!' : 'Defeat.') + ' (' + winner + ' wins)';
  overlay.style.display = '';
}

window.addEventListener('load', boot);
