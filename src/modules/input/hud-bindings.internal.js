// Internal: wire all HUD button + dropdown listeners to commands/options.
// Pure DOM event bindings — no per-tick work. Called once from createInput()
// during initInput. Reads/writes go through `transport.submit(...)` for
// anything sim-affecting, or directly into clientState for client-only UI.

import { refreshEjectButton } from './refresh.internal.js';

/**
 * @param {{
 *   client:    Object,
 *   state:     Object,
 *   entities:  Object,
 *   transport: { submit:(cmd:Object)=>void },
 *   refresh:   { refreshBuildButtons:()=>void, refreshTrainMenu:()=>void },
 *   onRestart: (() => void) | undefined,
 *   isMP:      boolean,
 * }} deps
 */
export function bindHudButtons({ client, state, entities, transport, refresh, onRestart, isMP }) {
  document.querySelectorAll('#build-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.build;
      if (kind === 'cancel') client.buildMode = null;
      else                   client.buildMode = { kind };
      refresh.refreshBuildButtons();
    });
  });

  document.querySelectorAll('#train-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.train;
      const b = client.trainFromId != null ? entities.byId(client.trainFromId) : null;
      if (!b || b.hp <= 0) return;
      transport.submit({
        type: 'train', playerId: client.playerId,
        buildingId: b.id, unitKind: kind,
      });
    });
  });

  document.querySelectorAll('#research-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const researchId = btn.dataset.research;
      const b = client.researchFromId != null ? entities.byId(client.researchFromId) : null;
      if (!b || b.hp <= 0) return;
      transport.submit({
        type: 'research', playerId: client.playerId,
        buildingId: b.id, researchId,
      });
      // Reflect the now-pending state on the next frame (post-drain).
      requestAnimationFrame(refresh.refreshTrainMenu);
    });
  });

  const alwaysHitEl = document.getElementById('always-hit');
  if (alwaysHitEl) {
    alwaysHitEl.checked = state.alwaysHit;
    alwaysHitEl.addEventListener('change', () => {
      transport.submit({
        type: 'setOption', playerId: client.playerId,
        key: 'alwaysHit', value: alwaysHitEl.checked,
      });
    });
  }

  // Red AI / Blue AI dropdowns — pick which AI (if any) drives each side.
  // In multiplayer the sim is human-vs-human, so the selectors are disabled.
  for (const side of ['red', 'blue']) {
    const aiEl = document.getElementById(`${side}-ai`);
    if (!aiEl) continue;
    aiEl.value = state.aiType[side];
    aiEl.addEventListener('change', () => { state.aiType[side] = aiEl.value; });
    if (isMP) aiEl.disabled = true;
  }

  const stackModeEl = document.getElementById('stack-mode');
  if (stackModeEl) {
    stackModeEl.value = client.stackMode;
    stackModeEl.addEventListener('change', () => { client.stackMode = stackModeEl.value; });
  }

  const supplyEl = document.getElementById('supply-priority');
  if (supplyEl) {
    supplyEl.value = state.supplyPriority;
    supplyEl.addEventListener('change', () => {
      transport.submit({
        type: 'setOption', playerId: client.playerId,
        key: 'supplyPriority', value: supplyEl.value,
      });
    });
  }

  if (onRestart) {
    document.getElementById('restart').addEventListener('click', onRestart);
  }

  const ejectBtn = document.getElementById('eject-button');
  if (ejectBtn) {
    ejectBtn.addEventListener('click', () => {
      const s = client.selectedIds.length === 1 ? entities.byId(client.selectedIds[0]) : null;
      if (!s || s.type !== 'building' || s.kind !== 'tower' || s.owner !== client.playerId) return;
      transport.submit({ type: 'eject', playerId: client.playerId, buildingId: s.id });
      // Refresh on next animation frame so the post-drain garrison count is reflected.
      requestAnimationFrame(() => refreshEjectButton(client, entities));
    });
  }
}
